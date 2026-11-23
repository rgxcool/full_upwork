import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createStore } from 'vuex'
import ProvningarCrud from '@/views/Provningar/ProvningarCrud.vue'
import client from '@/api/client.js'

vi.mock('@/api/client.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const toast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}

vi.mock('@/composables/useToast.js', () => ({
  useToast: () => toast,
}))

const exportToCSV = vi.fn()
vi.mock('@/utils/exportUtils.js', () => ({
  exportToCSV: (...args) => exportToCSV(...args),
}))

const sampleExams = [
  {
    _id: 'exam-1',
    name: 'Anna Svensson',
    personalNumber: '19950101-1234',
    course: 'MATMAT01a',
    requestedMonth: 'Mars',
    municipality: 'Göteborg',
    status: 'intresse',
    accommodations: {
      extraTime: true,
      computer: false,
      separateRoom: false,
      notes: 'Förlängd skrivtid',
    },
    decision: null,
  },
]

const createTestStore = (role = 'admin') =>
  createStore({
    state: {
      user: {
        _id: 'user-1',
        name: 'Test User',
        role,
        roles: [role],
      },
    },
    getters: {
      isLoggedIn: (state) => Boolean(state.user),
      userRole: (state) => state.user?.role || 'guest',
      isAdmin: (state) => ['admin', 'systemadmin'].includes(state.user?.role),
      isSystemAdmin: (state) => state.user?.role === 'systemadmin',
    },
  })

const mountCrud = (options = {}, role = 'admin') =>
  mount(ProvningarCrud, {
    ...options,
    global: {
      ...(options.global || {}),
      plugins: [createTestStore(role), ...(options.global?.plugins || [])],
      stubs: {
        teleport: true,
        ...(options.global?.stubs || {}),
      },
    },
  })

describe('ProvningarCrud.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockImplementation((url) => {
      if (String(url).includes('/teachers')) {
        return Promise.resolve({ data: [] })
      }
      return Promise.resolve({ data: sampleExams })
    })
    client.post.mockResolvedValue({ data: { success: true } })
    client.put.mockResolvedValue({ data: { success: true } })
    client.delete.mockResolvedValue({ data: { success: true } })
  })

  it('mounts and renders exam data', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    expect(wrapper.exists()).toBe(true)
    expect(client.get).toHaveBeenCalledWith('/admin/exams')
    expect(client.get).toHaveBeenCalledWith('/teachers')
    expect(wrapper.text()).toContain('Anna Svensson')
    wrapper.unmount()
  })

  it('fetches teacher-scoped exams and hides admin actions for non-admins', async () => {
    const wrapper = mountCrud({}, 'teacher')
    await flushPromises()

    expect(client.get).toHaveBeenCalledWith('/exams')
    expect(client.get).not.toHaveBeenCalledWith('/admin/exams')
    expect(client.get).not.toHaveBeenCalledWith('/teachers')
    expect(wrapper.text()).not.toContain('Registrera Ny')
    expect(wrapper.text()).not.toContain('Importera')
    wrapper.unmount()
  })

  it('filters exams when typing in search input', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    const searchInput = wrapper.find('input[type="text"]')
    if (searchInput.exists()) {
      await searchInput.setValue('Saknas')
      await flushPromises()
      expect(wrapper.text()).not.toContain('Anna Svensson')
    }

    wrapper.unmount()
  })

  it('opens and closes the exam form with safe defaults', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openForm()
    await flushPromises()
    expect(wrapper.vm.showForm).toBe(true)
    expect(wrapper.vm.currentExam.status).toBe('intresse')
    expect(wrapper.vm.currentExam.accommodations.extraTime).toBe(false)

    wrapper.vm.closeForm()
    await flushPromises()
    expect(wrapper.vm.showForm).toBe(false)
    wrapper.unmount()
  })

  it('shows a validation error when saving an incomplete exam', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openForm()
    await flushPromises()

    await wrapper.vm.saveExam()
    await flushPromises()

    expect(client.post).not.toHaveBeenCalled()
    expect(wrapper.vm.formError).toBe('Namn och kurs måste fyllas i.')
    wrapper.unmount()
  })

  it('saves a valid new exam and refreshes the list', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openForm()
    wrapper.vm.currentExam.name = 'Erik Lindqvist'
    wrapper.vm.currentExam.course = 'SVESVA01'
    wrapper.vm.currentExam.requestedMonth = 'Maj'

    await wrapper.vm.saveExam()
    await flushPromises()

    expect(client.post).toHaveBeenCalledWith(
      '/exams',
      expect.objectContaining({
        name: 'Erik Lindqvist',
        course: 'SVESVA01',
        requestedMonth: 'Maj',
      })
    )
    expect(wrapper.vm.showForm).toBe(false)
    wrapper.unmount()
  })

  it('requires a motivation when denying an exam and submits valid decisions', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openDecision(sampleExams[0])
    wrapper.vm.decisionComment = '   '
    await wrapper.vm.submitDecision('deny')
    await flushPromises()

    expect(client.put).not.toHaveBeenCalled()
    expect(wrapper.vm.decisionError).toContain('Motivering krävs')

    wrapper.vm.decisionComment = 'Saknar godkännande'
    await wrapper.vm.submitDecision('deny')
    await flushPromises()

    expect(client.put).toHaveBeenCalledWith('/exams/exam-1/decision', {
      decision: 'deny',
      comment: 'Saknar godkännande',
    })
    expect(wrapper.vm.showDecision).toBe(false)
    wrapper.unmount()
  })

  it('opens delete confirmation and deletes the exam on confirm', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.deleteExam('exam-1')
    expect(wrapper.vm.showDeleteDialog).toBe(true)

    await wrapper.vm.confirmDelete()
    await flushPromises()

    expect(client.delete).toHaveBeenCalledWith('/exams/exam-1')
    expect(wrapper.vm.showDeleteDialog).toBe(false)
    wrapper.unmount()
  })

  it('exports exams to CSV', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.exportExams()
    expect(exportToCSV).toHaveBeenCalledWith(
      'provningar-export.csv',
      expect.any(Array),
      expect.any(Array)
    )
    wrapper.unmount()
  })
})
