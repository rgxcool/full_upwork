import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ProvningarCrud from '@/views/Provningar/ProvningarCrud.vue'
import client from '@/api/client.js'
import { createStore } from 'vuex'

// The view reads the role from Vuex: admins manage everything, teachers only
// see their own prövningar and may decide on them.
const storeFor = (role = 'admin') =>
  createStore({
    state: { user: { role, roles: [role] } },
    getters: { isAdmin: (state) => ['admin', 'systemadmin'].includes(state.user.role) },
  })
const mountCrud = (options = {}, role = 'admin') =>
  mountCrud({
    ...options,
    global: { ...(options.global || {}), plugins: [storeFor(role), ...(options.global?.plugins || [])] },
  })

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

describe('ProvningarCrud', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockImplementation((url) => {
      if (url === '/admin/exams') return Promise.resolve({ data: [] })
      if (url === '/teachers') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
  })

  it('renders actions above the search and filter fields', () => {
    const wrapper = mountCrud()

    const actionRow = wrapper.find('.provning-actions')
    expect(actionRow.exists()).toBe(true)
    expect(actionRow.text()).toContain('Registrera Ny')
    expect(actionRow.text()).toContain('Importera')
    expect(actionRow.text()).toContain('Exportera')

    const actionRowPosition = wrapper.html().indexOf('provning-actions')
    const searchFieldPosition = wrapper.html().indexOf('Sök elev, kurs eller personnummer')
    expect(actionRowPosition).toBeGreaterThan(-1)
    expect(actionRowPosition).toBeLessThan(searchFieldPosition)
  })

  it('closes edit mode with safe empty nested form state', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openForm({
      _id: 'exam-1',
      name: 'Test Elev',
      course: 'Svenska',
      requestedMonth: 'Maj',
      accommodations: { extraTime: true, computer: false, separateRoom: true, notes: '' },
      materialReceived: { status: true, receivedDate: '2026-05-01' },
    })
    await flushPromises()

    expect(wrapper.vm.showForm).toBe(true)
    expect(wrapper.vm.currentExam.accommodations.extraTime).toBe(true)

    wrapper.vm.closeForm()
    await flushPromises()

    expect(wrapper.vm.showForm).toBe(false)
    expect(wrapper.vm.currentExam.accommodations).toEqual({
      extraTime: false,
      computer: false,
      separateRoom: false,
      notes: '',
    })
    expect(wrapper.vm.currentExam.materialReceived).toEqual({
      status: false,
      receivedDate: '',
    })
  })

  it('opens a new exam with safe nested defaults', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openForm()
    await flushPromises()

    expect(wrapper.vm.currentExam.status).toBe('intresse')
    expect(wrapper.vm.currentExam.accommodations.extraTime).toBe(false)
    expect(wrapper.vm.currentExam.materialReceived.status).toBe(false)
  })

  it('filters exams and exposes status and decision labels', async () => {
    client.get.mockImplementation((url) => {
      if (url === '/admin/exams') {
        return Promise.resolve({
          data: [{
            _id: 'exam-1',
            name: 'Anna Andersson',
            course: 'Svenska',
            personalNumber: '19900101',
            requestedMonth: 'Maj',
            status: 'scheduled',
            decision: 'accept',
            municipality: 'Sollentuna',
          }],
        })
      }
      if (url === '/teachers') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.searchQuery = 'Anna'
    await flushPromises()
    expect(wrapper.vm.filteredExams).toHaveLength(1)

    wrapper.vm.searchQuery = 'Ej hittad'
    await flushPromises()
    expect(wrapper.vm.filteredExams).toHaveLength(0)

    expect(wrapper.vm.statusLabel('scheduled')).toBe('Scheduled')
    expect(wrapper.vm.statusColor('denied')).toBe('red')
    expect(wrapper.vm.decisionLabel('accept')).toBe('Accepterad')
  })

  it('shows an accommodation note icon and opens its popup', async () => {
    client.get.mockImplementation((url) => {
      if (url === '/admin/exams') {
        return Promise.resolve({
          data: [{
            _id: 'exam-note',
            name: 'Anna Andersson',
            course: 'Svenska',
            requestedMonth: 'Maj',
            status: 'scheduled',
            accommodations: {
              extraTime: true,
              computer: false,
              separateRoom: false,
              notes: 'Extra skrivtid från 09:00.',
            },
          }],
        })
      }
      if (url === '/teachers') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    const wrapper = mountCrud({
      attachTo: document.body,
    })
    await flushPromises()

    const noteButton = wrapper.find(
      'button[aria-label="Visa anteckning om anpassning: Extra skrivtid från 09:00."]'
    )
    expect(noteButton.exists()).toBe(true)

    await noteButton.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Anteckning om anpassning')
    expect(document.body.textContent).toContain('Extra skrivtid från 09:00.')

    wrapper.unmount()
  })

  it('handles decision dialog open and close', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openDecision({
      _id: 'exam-1',
      name: 'Anna',
      course: 'Svenska',
      requestedMonth: 'Maj',
      comment: 'Godkänd',
    })
    expect(wrapper.vm.showDecision).toBe(true)
    expect(wrapper.vm.decisionComment).toBe('Godkänd')

    wrapper.vm.closeDecision()
    expect(wrapper.vm.showDecision).toBe(false)
    expect(wrapper.vm.decisionTarget).toBeNull()
  })

  it('submits an exam decision and refreshes the list', async () => {
    client.put.mockResolvedValue({ data: { success: true } })
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openDecision({ _id: 'exam-1', name: 'Anna', course: 'Svenska' })
    await wrapper.vm.submitDecision('accept')
    await flushPromises()

    expect(client.put).toHaveBeenCalledWith('/exams/exam-1/decision', {
      decision: 'accept',
      comment: '',
    })
    expect(wrapper.vm.showDecision).toBe(false)
  })

  it('requires a motivation before denying and sends it when given', async () => {
    client.put.mockResolvedValue({ data: { success: true } })
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openDecision({ _id: 'exam-1', name: 'Anna', course: 'Svenska' })
    wrapper.vm.decisionComment = '   '
    await wrapper.vm.submitDecision('deny')
    expect(client.put).not.toHaveBeenCalled()
    expect(wrapper.vm.decisionError).toContain('Motivering krävs')

    wrapper.vm.decisionComment = 'AUDIT: ej behörig'
    await wrapper.vm.submitDecision('deny')
    await flushPromises()
    expect(client.put).toHaveBeenCalledWith('/exams/exam-1/decision', {
      decision: 'deny',
      comment: 'AUDIT: ej behörig',
    })
  })

  it('shows teachers only their own prövningar and hides admin actions', async () => {
    client.get.mockResolvedValue({ data: [] })
    const wrapper = mountCrud({}, 'teacher')
    await flushPromises()

    expect(client.get).toHaveBeenCalledWith('/exams')
    expect(client.get).not.toHaveBeenCalledWith('/admin/exams')
    expect(client.get).not.toHaveBeenCalledWith('/teachers')
    expect(wrapper.text()).not.toContain('Registrera Ny')
    expect(wrapper.text()).not.toContain('Importera')
  })

  it('edits material pickup separately for SVE/SVA 1 and 3', async () => {
    const wrapper = mountCrud()
    await flushPromises()
    wrapper.vm.openForm({
      _id: 'exam-2',
      materialReceived: { status: true, level3: { status: true, receivedDate: '2026-11-03T00:00:00.000Z' } },
    })
    expect(wrapper.vm.currentExam.materialReceived.level1).toEqual({ status: false, receivedDate: '' })
    expect(wrapper.vm.currentExam.materialReceived.level3).toEqual({ status: true, receivedDate: '2026-11-03' })
  })

  it('opens and confirms exam deletion', async () => {
    client.delete.mockResolvedValue({ data: { success: true } })
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.deleteExam('exam-1')
    expect(wrapper.vm.showDeleteDialog).toBe(true)
    expect(wrapper.vm.deleteTargetId).toBe('exam-1')

    await wrapper.vm.confirmDelete()
    await flushPromises()

    expect(client.delete).toHaveBeenCalledWith('/exams/exam-1')
    expect(wrapper.vm.showDeleteDialog).toBe(false)
  })

  it('validates imports and closes import state', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.showImport = true
    wrapper.vm.setImportFile({ name: 'prövningar.txt' })
    expect(toast.error).toHaveBeenCalledWith('Endast CSV och Excel-filer är tillåtna')

    const file = { name: 'prövningar.csv' }
    wrapper.vm.setImportFile(file)
    expect(wrapper.vm.importFile).toEqual(file)
    expect(wrapper.vm.importResult).toBeNull()

    wrapper.vm.closeImport()
    expect(wrapper.vm.showImport).toBe(false)
    expect(wrapper.vm.importFile).toBeNull()
  })

  it('exports the filtered exam list as CSV', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.exams = [{
      name: 'Anna',
      course: 'Svenska',
      requestedMonth: 'Maj',
      municipality: 'Sollentuna',
      status: 'scheduled',
    }]
    wrapper.vm.exportExams()

    expect(exportToCSV).toHaveBeenCalled()
  })

  it('handles file selection, drag and drop, and import submission', async () => {
    client.post.mockResolvedValue({
      data: { success: true, message: 'Klart', saved: [{ _id: 'exam-1' }] },
    })
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.handleFileSelect({
      target: { files: [{ name: 'prövningar.csv', text: vi.fn().mockResolvedValue('namn,kurs') }] },
    })
    expect(wrapper.vm.importFile.name).toBe('prövningar.csv')

    wrapper.vm.isDragging = true
    wrapper.vm.handleDrop({
      dataTransfer: { files: [{ name: 'prövningar.xlsx' }] },
    })
    expect(wrapper.vm.isDragging).toBe(false)
    expect(wrapper.vm.importFile.name).toBe('prövningar.xlsx')

    wrapper.vm.importFile = {
      name: 'prövningar.csv',
      text: vi.fn().mockResolvedValue('namn,kurs'),
    }
    await wrapper.vm.submitImport()
    await flushPromises()

    expect(client.post).toHaveBeenCalledWith('/exams/import', {
      file: 'namn,kurs',
      type: 'csv',
    })
  })

  it('saves a valid exam and closes the form', async () => {
    client.post.mockResolvedValue({ data: { success: true } })
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openForm()
    wrapper.vm.currentExam.name = 'Anna Andersson'
    wrapper.vm.currentExam.course = 'Svenska'
    wrapper.vm.currentExam.requestedMonth = 'Maj'

    await wrapper.vm.saveExam()
    await flushPromises()

    expect(client.post).toHaveBeenCalled()
    expect(wrapper.vm.showForm).toBe(false)
  })

  it('shows validation errors without saving an incomplete exam', async () => {
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.openForm()
    await wrapper.vm.saveExam()

    expect(wrapper.vm.formError).toBe('Namn och kurs måste fyllas i.')
  })

  it('shows an error when delete or import fails', async () => {
    client.delete.mockRejectedValueOnce(new Error('delete failed'))
    client.post.mockRejectedValueOnce({
      response: { data: { error: 'Ogiltig fil' } },
    })
    const wrapper = mountCrud()
    await flushPromises()

    wrapper.vm.deleteExam('exam-1')
    await wrapper.vm.confirmDelete()
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith('Kunde inte ta bort prövningen.')

    wrapper.vm.importFile = {
      name: 'prövningar.xlsx',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(2)),
    }
    await wrapper.vm.submitImport()
    await flushPromises()

    expect(wrapper.vm.importResult).toEqual({
      success: false,
      message: 'Ogiltig fil',
    })
  })
})
