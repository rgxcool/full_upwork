import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import InactivityReport from '@/views/Admin/InactivityReport.vue'
import client from '@/api/client.js'
import { buildStore, buildRouter } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

const report = {
  students: [
    {
      studentId: 's1',
      name: 'Elev Ett',
      personalNumber: '123',
      email: 'elev@example.se',
      municipality: 'Stockholm',
      responsibleTeacher: 'Lärare',
      responsibleTeacherUserId: 'u2',
      daysSinceLastLogin: 20,
      daysSinceLastSubmission: 10,
      openSubmissions: 1,
      level: 'warning',
      warningSentAt: null,
      enrollments: [{ courseInstanceId: 'c1', courseName: 'Matte' }],
    },
  ],
  summary: { evaluated: 1, mustWithdraw: 0, inactiveForWarning: 1 },
  thresholds: { withdrawDays: 5, warningDays: 14 },
}

describe('InactivityReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockImplementation((url) => {
      if (url === '/inactivity/report') return Promise.resolve({ data: report })
      if (url === '/inactivity/scan-status') return Promise.resolve({ data: { lastScan: null } })
      if (url === '/inactivity/settings') {
        return Promise.resolve({
          data: {
            warningDays: 14,
            withdrawDays: 5,
            autoWarningEnabled: true,
            autoWithdrawEnabled: true,
          },
        })
      }
      return Promise.resolve({ data: {} })
    })
    client.put.mockImplementation((url, data) => Promise.resolve({ data }))
    client.post.mockResolvedValue({ data: {} })
  })

  const mountView = async (isAdmin = true) => {
    const store = buildStore({ getters: { isAdmin } })
    const wrapper = shallowMount(InactivityReport, {
      global: { plugins: [store, buildRouter()] },
    })
    await flushPromises()
    return wrapper
  }

  it('loads the report and renders the student row', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('elev@example.se')
    expect(wrapper.text()).toContain('Varningsmail')
  })

  it('loads the current settings on mount for admins', async () => {
    const wrapper = await mountView()
    expect(client.get).toHaveBeenCalledWith('/inactivity/settings')
    expect(wrapper.vm.settings).toMatchObject({
      warningDays: 14,
      withdrawDays: 5,
      autoWarningEnabled: true,
      autoWithdrawEnabled: true,
    })
    expect(wrapper.vm.settings).not.toHaveProperty('resendCooldownHours')
  })

  it('saves inactivity settings and refreshes report thresholds', async () => {
    const wrapper = await mountView()
    wrapper.vm.settings.warningDays = 10
    await wrapper.vm.saveSettings()
    await flushPromises()
    expect(client.put).toHaveBeenCalledWith('/inactivity/settings', expect.objectContaining({ warningDays: 10 }))
    expect(wrapper.vm.thresholds).toMatchObject({ warningDays: 10, withdrawDays: 5 })
  })

  it('resends a warning email through the per-student endpoint', async () => {
    const wrapper = await mountView()
    const student = wrapper.vm.filteredStudents[0]
    await wrapper.vm.resendWarningEmail(student)
    await flushPromises()
    expect(client.post).toHaveBeenCalledWith('/inactivity/s1/warning-email/resend')
  })

  it('surfaces the backend error when there is no previous warning', async () => {
    const wrapper = await mountView()
    client.post.mockRejectedValueOnce({
      response: { data: { error: 'No previous inactivity warning to resend' } },
    })
    await wrapper.vm.resendWarningEmail(wrapper.vm.filteredStudents[0])
    await flushPromises()
    expect(wrapper.vm.sendingWarningFor).toBeNull()
  })
})
