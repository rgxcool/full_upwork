import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CourseTemplates from '@/views/Admin/CourseTemplates.vue'
import api from '@/api/client'

const pushMock = vi.fn(() => Promise.resolve())
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

const storeState = vi.hoisted(() => ({ role: 'admin' }))
vi.mock('@/store/store.js', () => ({
  default: {
    get getters() {
      return { userRole: storeState.role }
    },
  },
}))

vi.mock('@/composables/useToast.js', () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
  }),
}))

const sampleTemplates = [
  {
    _id: 'tpl-1',
    templateName: 'Engelska 5',
    title: 'Engelska 5',
    courseCode: 'ENGENG05',
    description: 'Grundstruktur för Engelska 5',
    modules: [
      { moduleNumber: 1, title: 'Modul 1', sections: [] },
      { moduleNumber: 2, title: 'Modul 2', sections: [] },
      { moduleNumber: 3, title: 'Modul 3', sections: [] },
      { moduleNumber: 4, title: 'Modul 4', sections: [] },
      { moduleNumber: 5, title: 'Modul 5', sections: [] },
    ],
  },
]

function mountView() {
  return mount(CourseTemplates, {
    global: {
      stubs: {
        'v-container': { template: '<div><slot /></div>' },
        'v-card': { template: '<div><slot /></div>' },
        'v-card-title': { template: '<div><slot /></div>' },
        'v-row': { template: '<div><slot /></div>' },
        'v-col': { template: '<div><slot /></div>' },
        'v-chip': { template: '<span><slot /></span>' },
        'v-alert': { template: '<div role="alert"><slot /></div>' },
        'v-progress-linear': { template: '<div />' },
        'v-btn': {
          template:
            '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>',
        },
      },
    },
  })
}

describe('CourseTemplates.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { templates: sampleTemplates } })
    api.delete.mockResolvedValue({ data: { success: true } })
  })

  it('renders template name', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Engelska 5')
    wrapper.unmount()
  })

  it('shows the linked course code', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('ENGENG05')
    wrapper.unmount()
  })

  it('shows the number of modules in the template', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('5')
    wrapper.unmount()
  })

  it('navigates to builder when opening a template', async () => {
    const wrapper = mountView()
    await flushPromises()
    const openBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Öppna i byggare'))
    expect(openBtn).toBeDefined()
    await openBtn.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      path: '/admin/course-card-builder',
      query: { templateId: 'tpl-1' },
    })
    wrapper.unmount()
  })

  it('deletes a template after confirmation and removes it from the list', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mountView()
    await flushPromises()
    const deleteBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Ta bort'))
    expect(deleteBtn).toBeDefined()
    await deleteBtn.trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalled()
    expect(api.delete).toHaveBeenCalledWith('/course-templates/tpl-1')
    expect(wrapper.text()).not.toContain('Engelska 5')
    confirmSpy.mockRestore()
    wrapper.unmount()
  })

  it('does not delete when the confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mountView()
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Ta bort'))
      .trigger('click')
    await flushPromises()
    expect(api.delete).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Engelska 5')
    confirmSpy.mockRestore()
    wrapper.unmount()
  })

  it('hides the delete button for teachers (no courseTemplates:delete)', async () => {
    storeState.role = 'teacher'
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('Ta bort'))).toBe(false)
    storeState.role = 'admin'
    wrapper.unmount()
  })
})