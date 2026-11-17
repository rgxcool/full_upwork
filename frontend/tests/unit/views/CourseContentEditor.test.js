import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import CourseContentEditor from '@/views/Admin/CourseContentEditor.vue'
import client from '@/api/client.js'

vi.mock('@/api/client.js', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

describe('CourseContentEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockImplementation((url) => {
      if (url === '/course-instances') {
        return Promise.resolve({ data: [{ _id: 'i1', courseName: 'Matte', courseCode: 'M1' }] })
      }
      if (url.startsWith('/course-instances/')) {
        return Promise.resolve({ data: { modules: [{ moduleNumber: 1, title: 'Modul 1', sections: [{ title: 'S1' }], assignment: { title: 'Uppgift' } }] } })
      }
      return Promise.resolve({ data: {} })
    })
    client.put.mockResolvedValue({ data: {} })
  })

  it('loads instances and content, then saves', async () => {
    const wrapper = shallowMount(CourseContentEditor)
    await flushPromises()
    wrapper.vm.selectedInstanceId = 'i1'
    await wrapper.vm.loadContent()
    await flushPromises()
    expect(client.get).toHaveBeenCalled()
    await wrapper.vm.saveContent()
    await flushPromises()
    expect(client.put).toHaveBeenCalledWith('/course-instances/i1/content', expect.any(Object))
  })
})
