import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// "Spara kurskort" from CourseCardBuilder (PUT /course-instances/:id/content).
// Guards BUG-01 / BUG-04 regressions: a save from the builder must not unhide modules a teacher hid,
// must not wipe the teacher's module instructions, and must key content by string module number.

const routeState = vi.hoisted(() => ({ query: {} }))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), defaults: { baseURL: '/api' } },
}))

import api from '@/api/client'
import CourseCardBuilder from '@/views/Admin/CourseCardBuilder.vue'

const INSTANCE_ID = 'ci-1'

// Shape returned by GET /course-instances/:id: cardContent.modules is what the builder saved
// earlier (serializeContent never stored the hidden flag).
const instance = {
  _id: INSTANCE_ID,
  courseName: 'Svenska 1',
  courseCode: 'SVESVE01',
  cardContent: {
    title: 'Svenska 1',
    courseCode: 'SVESVE01',
    modules: [
      { id: 'm1', moduleNumber: 1, title: 'Modul 1', sections: [{ id: 's1', title: 'Delmoment 1.1', blocks: [] }] },
      { id: 'm2', moduleNumber: 2, title: 'Modul 2', sections: [{ id: 's2', title: 'Delmoment 2.1', blocks: [] }] },
    ],
  },
}

// GET /course-instances/:id/content: string keys, as the Mongoose Map serializes them.
const content = {
  1: { title: 'Introduktion', instructions: 'Läs kapitel 1.', isHiddenFromStudent: false },
  2: { title: 'Fördjupning', instructions: 'Skriv en text.', isHiddenFromStudent: true },
}

const mountBuilder = async () => {
  const wrapper = mount(CourseCardBuilder, { global: { stubs: { teleport: true } } })
  await flushPromises()
  return wrapper
}

const button = (wrapper, text) => wrapper.findAll('button').filter((b) => b.text().trim() === text)

const savedPayload = () => {
  const call = api.put.mock.calls.find(([url]) => url === `/course-instances/${INSTANCE_ID}/content`)
  return call?.[1]
}

describe('CourseCardBuilder — "Spara kurskort"', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.query = { courseInstanceId: INSTANCE_ID }
    api.get.mockImplementation((url) => {
      if (url === '/course-templates') return Promise.resolve({ data: { templates: [] } })
      if (url === `/course-instances/${INSTANCE_ID}`) return Promise.resolve({ data: { instance } })
      if (url === `/course-instances/${INSTANCE_ID}/content`) return Promise.resolve({ data: { content } })
      return Promise.resolve({ data: [instance] })
    })
    api.put.mockResolvedValue({ data: { ok: true } })
  })

  it('keeps a module the teacher hid hidden, and keeps the teacher\'s instructions', async () => {
    const wrapper = await mountBuilder()
    await button(wrapper, 'Spara kurskort')[0].trigger('click')
    await flushPromises()

    const payload = savedPayload()
    expect(payload.content['2']).toEqual({
      title: 'Fördjupning',
      instructions: 'Skriv en text.',
      isHiddenFromStudent: true,
    })
    expect(payload.content['1'].isHiddenFromStudent).toBe(false)
    expect(payload.content['1'].instructions).toBe('Läs kapitel 1.')
    // The card snapshot carries the flag too, so the next load is consistent.
    expect(payload.cardContent.modules[1].isHiddenFromStudent).toBe(true)
    expect(wrapper.text()).toContain('Kurskortet sparades och kopplades till kursinstansen.')
  })

  it('sends content keyed by string module number, synced modules and no template link', async () => {
    const wrapper = await mountBuilder()
    await button(wrapper, 'Spara kurskort')[0].trigger('click')
    await flushPromises()

    const payload = savedPayload()
    expect(Object.keys(payload.content)).toEqual(['1', '2'])
    expect(payload.syncModules).toBe(true)
    expect(payload.courseTemplateId).toBeNull()
    expect(payload.modules.map((m) => m.moduleNumber)).toEqual([1, 2])
    // Dates belong to the Datumplanering; the builder never sends them (the backend keeps them, #30).
    for (const m of payload.modules) {
      expect(m).not.toHaveProperty('startDate')
      expect(m).not.toHaveProperty('endDate')
    }
  })

  it('module and section edits are reflected in the saved payload, with modules renumbered', async () => {
    const wrapper = await mountBuilder()

    await button(wrapper, '+ Lägg till modul')[0].trigger('click')
    await button(wrapper, '+ Lägg till sektion')[0].trigger('click')
    await button(wrapper, '+ Textblock')[0].trigger('click')
    await button(wrapper, 'Ta bort modul')[1].trigger('click') // removes module 2

    await button(wrapper, 'Spara kurskort')[0].trigger('click')
    await flushPromises()

    const { modules } = savedPayload()
    expect(modules.map((m) => m.moduleNumber)).toEqual([1, 2])
    expect(modules[0].sections).toHaveLength(2)
    expect(modules[0].sections[0].blocks).toHaveLength(1)
    expect(modules[0].sections[0].blocks[0]).toMatchObject({ type: 'text', colorCode: 'default', url: '' })
    expect(modules[1].title).toBe('Modul 3')
  })

  it('removing a section keeps at least one and a text block can be removed again', async () => {
    const wrapper = await mountBuilder()

    await button(wrapper, '+ Lägg till sektion')[0].trigger('click')
    await button(wrapper, 'Ta bort sektion')[0].trigger('click')
    expect(button(wrapper, 'Ta bort sektion')).toHaveLength(0)

    await button(wrapper, '+ Textblock')[0].trigger('click')
    const removeBlock = wrapper.findAll('.block-item button[title="Ta bort delmoment"]')
    expect(removeBlock).toHaveLength(1)
    await removeBlock[0].trigger('click')

    await button(wrapper, 'Spara kurskort')[0].trigger('click')
    await flushPromises()
    expect(savedPayload().modules[0].sections).toHaveLength(1)
    expect(savedPayload().modules[0].sections[0].blocks).toHaveLength(0)
  })

  it('shows the server message in Swedish when the save fails', async () => {
    api.put.mockRejectedValueOnce({ message: 'Request failed', response: { data: { message: 'Åtkomst nekad' } } })
    const wrapper = await mountBuilder()
    await button(wrapper, 'Spara kurskort')[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Kunde inte spara kurskortet: Åtkomst nekad')
  })

  it('shows an error when the course instance cannot be loaded', async () => {
    api.get.mockImplementation((url) => {
      if (url === `/course-instances/${INSTANCE_ID}`) return Promise.reject(new Error('Nätverksfel'))
      if (url === '/course-templates') return Promise.resolve({ data: { templates: [] } })
      return Promise.resolve({ data: [] })
    })
    const wrapper = await mountBuilder()
    expect(wrapper.text()).toContain('Kunde inte ladda kurskortet från kursinstansen: Nätverksfel')
  })

  it('without a selected course instance the save button is disabled', async () => {
    routeState.query = {}
    const wrapper = await mountBuilder()
    expect(button(wrapper, 'Spara kurskort')[0].attributes('disabled')).toBeDefined()
    expect(api.put).not.toHaveBeenCalled()
  })
})
