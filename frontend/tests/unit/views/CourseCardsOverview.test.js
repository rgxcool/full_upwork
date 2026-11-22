import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const storeState = vi.hoisted(() => ({ role: 'admin' }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/store/store.js', () => ({
  default: {
    get getters() {
      return { userRole: storeState.role }
    },
    state: { user: { userId: 'u-admin' } },
  },
}))

import client from '@/api/client.js'
import CourseCardsOverview from '@/views/Admin/CourseCardsOverview.vue'

const cards = [
  {
    _id: 'card-1',
    courseName: 'Svenska 1',
    courseCode: 'SVESVE01',
    startDate: '2026-01-05',
    endDate: '2026-02-09',
    isActive: true,
    modules: [{ moduleNumber: 1 }],
  },
  {
    _id: 'card-2',
    courseName: 'Matematik 1a',
    courseCode: 'MATMAT01a',
    startDate: '2026-03-02',
    endDate: '2026-04-06',
    isActive: true,
    modules: [],
  },
]

const passthrough = { template: '<div><slot /></div>' }
const mountView = () =>
  mount(CourseCardsOverview, {
    global: {
      stubs: {
        'v-container': passthrough,
        'v-card': passthrough,
        'v-card-title': passthrough,
        'v-card-text': passthrough,
        'v-card-actions': passthrough,
        'v-divider': true,
        'v-spacer': true,
        'v-chip': { template: '<span><slot /></span>' },
        'v-alert': { template: '<div role="alert"><slot /></div>' },
        'v-progress-linear': true,
        'v-text-field': true,
        'v-select': true,
        'v-autocomplete': true,
        // Render dialog content only while open, like Vuetify does.
        'v-dialog': {
          props: ['modelValue'],
          template: '<div v-if="modelValue" class="dialog"><slot /></div>',
        },
        'v-btn': {
          template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>',
        },
        CourseCardDiscussions: true,
      },
    },
  })

const findButton = (wrapper, text) =>
  wrapper.findAll('button').filter((b) => b.text().trim() === text)

describe('CourseCardsOverview.vue — delete kurskort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.role = 'admin'
    client.get.mockResolvedValue({ data: { cards } })
    client.delete.mockResolvedValue({ data: { success: true } })
  })

  it('shows a delete button per card for admins only', async () => {
    const admin = mountView()
    await flushPromises()
    expect(findButton(admin, 'Ta bort')).toHaveLength(2)
    admin.unmount()

    storeState.role = 'teacher'
    const teacher = mountView()
    await flushPromises()
    expect(findButton(teacher, 'Ta bort')).toHaveLength(0)
    teacher.unmount()
  })

  it('asks for confirmation, deletes and removes the card from the list', async () => {
    const wrapper = mountView()
    await flushPromises()

    await findButton(wrapper, 'Ta bort')[0].trigger('click')
    expect(wrapper.find('.dialog').exists()).toBe(true)
    expect(wrapper.find('.dialog').text()).toContain('Svenska 1')
    expect(client.delete).not.toHaveBeenCalled()

    // The confirm button is the last "Ta bort" (inside the dialog).
    const buttons = findButton(wrapper, 'Ta bort')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()

    expect(client.delete).toHaveBeenCalledWith('/course-instances/card-1')
    expect(wrapper.find('.dialog').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Svenska 1')
    expect(wrapper.text()).toContain('Matematik 1a')
  })

  it('keeps the card and shows the server reason when students are linked (409)', async () => {
    client.delete.mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'Kurskortet har 3 kopplade elever och kan inte tas bort.' },
      },
    })
    const wrapper = mountView()
    await flushPromises()

    await findButton(wrapper, 'Ta bort')[0].trigger('click')
    const buttons = findButton(wrapper, 'Ta bort')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()

    expect(wrapper.find('.dialog').exists()).toBe(true)
    expect(wrapper.find('.dialog [role="alert"]').text()).toContain('3 kopplade elever')
    expect(wrapper.text()).toContain('Svenska 1')
  })

  it('cancel closes the dialog without deleting', async () => {
    const wrapper = mountView()
    await flushPromises()
    await findButton(wrapper, 'Ta bort')[0].trigger('click')
    await findButton(wrapper, 'Avbryt')[0].trigger('click')
    expect(wrapper.find('.dialog').exists()).toBe(false)
    expect(client.delete).not.toHaveBeenCalled()
  })
})
