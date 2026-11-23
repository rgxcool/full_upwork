import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, mount, flushPromises } from '@vue/test-utils'
import CourseContentEditor from '@/views/Admin/CourseContentEditor.vue'
import client from '@/api/client.js'

vi.mock('@/api/client.js', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

const instance = {
  _id: 'i1',
  courseName: 'Matte',
  courseCode: 'M1',
  modules: [
    {
      moduleNumber: 1,
      title: 'Modul 1',
      isPartialExam: true,
      sections: [{ title: 'S1', description: '', instructions: '' }],
      avsnitt: [
        {
          avsnittId: 'm1-a1',
          title: 'Avsnitt 1',
          order: 1,
          plannedDate: '2026-11-23T00:00:00.000Z',
          contentItems: [
            {
              contentId: 'c1',
              type: 'lektion',
              title: 'Intro',
              order: 1,
              lektion: { videoUrl: 'https://example.test/video', durationMinutes: 12 },
            },
            {
              contentId: 'c2',
              type: 'lasning',
              title: 'Kapitel 1',
              order: 2,
              lasning: { resourceUrl: 'https://example.test/text', estimatedMinutes: 8 },
            },
            { contentId: 'c3', type: 'uppgift', title: 'Uppgift', order: 3 },
          ],
        },
      ],
      assignment: { title: 'Uppgift 1', description: 'Gör klart.' },
    },
    {
      moduleNumber: 2,
      title: 'Modul 2',
      sections: [],
      avsnitt: [],
      assignment: { title: '', description: '' },
    },
  ],
}

const content = {
  '1': { title: 'Startmodul', instructions: 'Läs.', isHiddenFromStudent: true },
}

describe('CourseContentEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockImplementation((url) => {
      if (url === '/course-instances') {
        return Promise.resolve({ data: { success: true, instances: [instance] } })
      }
      if (url === '/course-instances/i1/content') {
        return Promise.resolve({ data: { success: true, content, canEdit: true } })
      }
      return Promise.resolve({ data: {} })
    })
    client.put.mockResolvedValue({ data: { success: true } })
  })

  const loadEditor = async () => {
    const wrapper = shallowMount(CourseContentEditor)
    await flushPromises()
    wrapper.vm.selectedInstanceId = 'i1'
    await wrapper.vm.loadContent()
    await flushPromises()
    return wrapper
  }

  it('reads the real /course-instances response and builds instance options', async () => {
    const wrapper = await loadEditor()

    expect(wrapper.vm.instances).toHaveLength(1)
    expect(wrapper.vm.instanceOptions).toEqual([
      { title: 'Matte (M1)', value: 'i1' },
    ])
  })

  it('merges module structure with content overlay, including the hide flag', async () => {
    const wrapper = await loadEditor()

    expect(client.get).toHaveBeenCalledWith('/course-instances/i1/content')
    expect(wrapper.vm.modules).toHaveLength(2)
    expect(wrapper.vm.modules[0]).toMatchObject({
      moduleNumber: 1,
      title: 'Modul 1',
      contentTitle: 'Startmodul',
      instructions: 'Läs.',
      isHiddenFromStudent: true,
    })
    expect(wrapper.vm.modules[0].avsnitt).toHaveLength(1)
    expect(wrapper.vm.modules[0].sections[0].title).toBe('S1')
    expect(wrapper.vm.modules[1]).toMatchObject({
      title: 'Modul 2',
      contentTitle: 'Modul 2',
      instructions: '',
      isHiddenFromStudent: false,
    })
  })

  it('edits the overlay title only, leaving the structural module title intact', async () => {
    const wrapper = await loadEditor()

    wrapper.vm.modules[0].contentTitle = 'Ny studenttitels'

    await wrapper.vm.saveContent()

    expect(client.put.mock.calls[0][1].content['1'].title).toBe('Ny studenttitels')
    expect(wrapper.vm.modules[0].title).toBe('Modul 1')
    wrapper.unmount()
  })

  it('seeds the overlay title from the structural title when it is empty', async () => {
    client.get.mockImplementation((url) => {
      if (url === '/course-instances') {
        return Promise.resolve({ data: { success: true, instances: [instance] } })
      }
      if (url === '/course-instances/i1/content') {
        return Promise.resolve({
          data: { success: true, content: { '1': { title: '' } }, canEdit: true },
        })
      }
      return Promise.resolve({ data: {} })
    })
    const wrapper = await loadEditor()

    expect(wrapper.vm.modules[0].contentTitle).toBe('Modul 1')
    expect(wrapper.vm.effectiveTitle(wrapper.vm.modules[0])).toBe('Modul 1')
    wrapper.unmount()
  })

  it('shows the effective overlay title in the panel header and field', async () => {
    const wrapper = mount(CourseContentEditor)
    await flushPromises()
    wrapper.vm.selectedInstanceId = 'i1'
    await wrapper.vm.loadContent()
    wrapper.vm.openPanels = [0]
    await flushPromises()

    expect(wrapper.text()).toContain('Modul 1 — Startmodul')
    const titleField = wrapper
      .findAllComponents({ name: 'VTextField' })
      .find((field) => field.props('label') === 'Modultitel')
    expect(titleField).toBeDefined()
    expect(titleField.props('modelValue')).toBe('Startmodul')
    wrapper.unmount()
  })

  it('keeps Avsnitt visible to staff even when the module is hidden', async () => {
    const wrapper = await loadEditor()

    const avsnitt = wrapper.vm.avsnittFor(wrapper.vm.modules[0])
    expect(avsnitt).toHaveLength(1)
    expect(avsnitt[0].title).toBe('Avsnitt 1')
    expect(avsnitt[0].plannedDate).toBe('2026-11-23')
    expect(wrapper.vm.avsnittFor(wrapper.vm.modules[1])).toEqual([])
  })

  it('saves the real { content } payload keyed by module number', async () => {
    const wrapper = await loadEditor()

    await wrapper.vm.saveContent()

    expect(client.put).toHaveBeenCalledWith('/course-instances/i1/content', {
      content: {
        '1': { title: 'Startmodul', instructions: 'Läs.', isHiddenFromStudent: true },
        '2': { title: 'Modul 2', instructions: '', isHiddenFromStudent: false },
      },
    })
  })

  it('persists a hide toggle for a module with no prior overlay', async () => {
    const wrapper = await loadEditor()
    wrapper.vm.modules[1].isHiddenFromStudent = true

    await wrapper.vm.saveContent()

    expect(client.put.mock.calls[0][1].content['2']).toEqual({
      title: 'Modul 2',
      instructions: '',
      isHiddenFromStudent: true,
    })
  })

  it('handles a legacy empty content object without errors', async () => {
    client.get.mockImplementation((url) => {
      if (url === '/course-instances') {
        return Promise.resolve({ data: { success: true, instances: [instance] } })
      }
      if (url === '/course-instances/i1/content') {
        return Promise.resolve({ data: { success: true, content: {}, canEdit: true } })
      }
      return Promise.resolve({ data: {} })
    })
    const wrapper = await loadEditor()

    expect(wrapper.vm.modules[0].isHiddenFromStudent).toBe(false)
    expect(wrapper.vm.modules[0].contentTitle).toBe('Modul 1')
  })

  it('renders the Avsnitt chips, titles, links and durations in an open panel', async () => {
    const wrapper = mount(CourseContentEditor)
    await flushPromises()
    wrapper.vm.selectedInstanceId = 'i1'
    await wrapper.vm.loadContent()
    wrapper.vm.openPanels = [0]
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Avsnitt 1')
    expect(text).toContain('Planerat inlämningsdatum: 2026-11-23')
    expect(text).toContain('Lektion')
    expect(text).toContain('Läsning')
    expect(text).toContain('12 min')
    expect(text).toContain('ca 8 min')
    expect(text).toContain('Dölj för elever')
    const links = wrapper.findAll('a[target="_blank"]')
    expect(links).toHaveLength(2)
    expect(links[0].attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).not.toContain('Uppgift 1')
    wrapper.unmount()
  })
})
