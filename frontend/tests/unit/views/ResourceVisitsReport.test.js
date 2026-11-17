import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ResourceVisitsReport from '@/views/Admin/ResourceVisitsReport.vue'
import client from '@/api/client.js'

vi.mock('@/api/client.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

const report = {
  generatedAt: '2026-11-17T12:00:00.000Z',
  total: 2,
  page: 1,
  limit: 20,
  summary: {
    totalVisits: 2,
    uniqueStudents: 1,
    byResource: { 'Mina kurser': 1, Matematik: 1 },
  },
  visits: [
    {
      _id: 'v1',
      studentName: 'Elev Ett',
      resourceName: 'Mina kurser',
      resourceId: 'course-cards',
      resourceType: 'course_card',
      municipality: 'Stockholm',
      visitedAt: '2026-11-17T10:00:00.000Z',
    },
    {
      _id: 'v2',
      studentName: 'Elev Ett',
      resourceName: 'Matematik',
      resourceId: 'instance-1',
      resourceType: 'lesson',
      municipality: 'Stockholm',
      visitedAt: '2026-11-17T11:00:00.000Z',
    },
  ],
}

describe('ResourceVisitsReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockResolvedValue({ data: report })
  })

  const mountView = async () => {
    const wrapper = shallowMount(ResourceVisitsReport)
    await flushPromises()
    return wrapper
  }

  it('loads the report and renders visits and summary', async () => {
    const wrapper = await mountView()

    expect(client.get).toHaveBeenCalledWith('/resource-visits/report', {
      params: { page: 1, limit: 20 },
    })
    expect(wrapper.text()).toContain('Elev Ett')
    expect(wrapper.text()).toContain('Mina kurser')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.text()).toContain('Unika elever')
  })

  it('applies resource type and date filters from page 1', async () => {
    const wrapper = await mountView()
    wrapper.vm.page = 3
    wrapper.vm.resourceType = 'lesson'
    wrapper.vm.from = '2026-11-01'
    wrapper.vm.to = '2026-11-30'
    await wrapper.vm.applyFilters()
    await flushPromises()

    expect(client.get).toHaveBeenLastCalledWith('/resource-visits/report', {
      params: {
        page: 1,
        limit: 20,
        resourceType: 'lesson',
        from: '2026-11-01',
        to: '2026-11-30',
      },
    })
  })

  it('navigates to the next page', async () => {
    const wrapper = await mountView()
    await wrapper.vm.nextPage()
    await flushPromises()

    expect(client.get).toHaveBeenLastCalledWith('/resource-visits/report', {
      params: { page: 2, limit: 20 },
    })
  })

  it('shows an API error instead of a report', async () => {
    client.get.mockRejectedValue({
      response: { data: { error: { message: 'Åtkomst nekad' } } },
    })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Åtkomst nekad')
    expect(wrapper.find('tbody').exists()).toBe(false)
  })
})
