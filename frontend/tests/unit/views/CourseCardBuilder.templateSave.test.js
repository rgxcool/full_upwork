import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// #31: a template loaded into the builder is updated in place (PUT);
// "Spara som ny mall" is the only way to create a copy (POST).

const routeState = vi.hoisted(() => ({ query: {} }))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import api from '@/api/client'
import CourseCardBuilder from '@/views/Admin/CourseCardBuilder.vue'

const template = {
  _id: 'tpl-1',
  templateName: 'Svenska 1 – Kursmall',
  courseCode: 'SVESVE01',
  modules: [{ moduleNumber: 1, title: 'Modul 1', sections: [] }],
}

const mountBuilder = async () => {
  const wrapper = mount(CourseCardBuilder, { global: { stubs: { teleport: true } } })
  await flushPromises()
  return wrapper
}

describe('CourseCardBuilder — saving templates (#31)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.query = {}
    api.get.mockImplementation((url) => {
      if (url === '/course-templates') return Promise.resolve({ data: { templates: [template] } })
      if (url === '/course-templates/tpl-1') return Promise.resolve({ data: { template } })
      return Promise.resolve({ data: [] })
    })
    api.post.mockResolvedValue({ data: { template: { ...template, _id: 'tpl-new' } } })
    api.put.mockResolvedValue({ data: { template } })
  })

  it('without a loaded template there is only "Spara som mall", which creates (POST)', async () => {
    const wrapper = await mountBuilder()
    expect(wrapper.find('[data-test="update-template"]').exists()).toBe(false)
    const saveNew = wrapper.find('[data-test="save-new-template"]')
    expect(saveNew.text()).toBe('Spara som mall')

    await saveNew.trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/course-templates', expect.any(Object))
    expect(api.put).not.toHaveBeenCalled()
  })

  it('with a loaded template, "Uppdatera mall" updates it in place (PUT, no duplicate)', async () => {
    routeState.query = { templateId: 'tpl-1' }
    const wrapper = await mountBuilder()

    const update = wrapper.find('[data-test="update-template"]')
    expect(update.text()).toBe('Uppdatera mall')
    await update.trigger('click')
    await flushPromises()

    expect(api.put).toHaveBeenCalledWith(
      '/course-templates/tpl-1',
      expect.objectContaining({ courseCode: 'SVESVE01' })
    )
    expect(api.post).not.toHaveBeenCalled()
  })

  it('with a loaded template, "Spara som ny mall" explicitly creates a copy (POST)', async () => {
    routeState.query = { templateId: 'tpl-1' }
    const wrapper = await mountBuilder()

    const saveNew = wrapper.find('[data-test="save-new-template"]')
    expect(saveNew.text()).toBe('Spara som ny mall')
    await saveNew.trigger('click')
    await flushPromises()

    expect(api.post).toHaveBeenCalledWith('/course-templates', expect.any(Object))
    expect(api.put).not.toHaveBeenCalled()
  })
})
