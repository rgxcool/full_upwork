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
      if (url === '/inactivity/settings') return Promise.resolve({ data: { warningDays: 14, withdrawDays: 5, resendCooldownHours: 24 } })
      return Promise.resolve({ data: {} })
    })
    client.put.mockResolvedValue({ data: { warningDays: 14, withdrawDays: 5, resendCooldownHours: 24 } })
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

  it('saves inactivity settings', async () => {
    const wrapper = await mountView()
    wrapper.vm.settings.warningDays = 10
    await wrapper.vm.saveSettings()
    await flushPromises()
    expect(client.put).toHaveBeenCalledWith('/inactivity/settings', expect.objectContaining({ warningDays: 10 }))
  })

  it('resends a warning email', async () => {
    const wrapper = await mountView()
    const student = wrapper.vm.filteredStudents[0]
    await wrapper.vm.resendWarningEmail(student)
    await flushPromises()
    expect(client.post).toHaveBeenCalledWith('/inactivity/resend-warning', { studentId: 's1' })
  })
})
