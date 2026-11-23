import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CourseInstances from '@/views/Admin/CourseInstances.vue'
import client from '@/api/client.js'
import { buildRouter, buildStore } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/composables/useToast.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

const SVA_TEMPLATE = {
  _id: 'tpl-1',
  templateName: 'Svenska som andraspråk 1 - mall',
  courseId: { _id: 'course-sva', courseName: 'SVENSKA SOM ANDRASPRÅK NIVÅ 1' },
}
const MATH_TEMPLATE = {
  _id: 'tpl-2',
  templateName: 'Matematik 1A - mall',
  courseId: { _id: 'course-mat', courseName: 'MATEMATIK NIVÅ 1A' },
}

const mountView = async () => {
  const wrapper = mount(CourseInstances, {
    global: {
      plugins: [buildStore({ getters: { userRole: 'admin', isAdmin: true } }), buildRouter()],
      stubs: { 'v-autocomplete': true },
    },
  })
  await flushPromises()
  return wrapper
}

const optionTexts = (wrapper) => wrapper.findAll('#templateId option').map((o) => o.text())

describe('CourseInstances.vue — "Skapa ny instans" mall picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockImplementation((url) => {
      if (url === '/course-templates') {
        return Promise.resolve({ data: { success: true, templates: [SVA_TEMPLATE, MATH_TEMPLATE] } })
      }
      if (url.startsWith('/course-instances')) return Promise.resolve({ data: { instances: [] } })
      return Promise.resolve({ data: [] })
    })
  })

  it('lists the mallar from /course-templates so a new instance can copy modules', async () => {
    const wrapper = await mountView()

    const options = optionTexts(wrapper)
    expect(options[0]).toBe('Ingen mall')
    expect(options.some((t) => t.includes('Svenska som andraspråk 1 - mall'))).toBe(true)
    expect(options.some((t) => t.includes('Matematik 1A - mall'))).toBe(true)
    wrapper.unmount()
  })

  it('only offers mallar for the chosen huvudkurs and drops a mall that no longer fits', async () => {
    const wrapper = await mountView()
    wrapper.vm.instanceForm.templateId = 'tpl-2'
    wrapper.vm.instanceForm.mainCourseId = 'course-sva'
    await flushPromises()

    const options = optionTexts(wrapper)
    expect(options.some((t) => t.includes('Svenska som andraspråk 1 - mall'))).toBe(true)
    expect(options.some((t) => t.includes('Matematik 1A - mall'))).toBe(false)
    expect(wrapper.vm.instanceForm.templateId).toBe('')
    wrapper.unmount()
  })
})
