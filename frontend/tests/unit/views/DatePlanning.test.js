import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import DatePlanning from '@/views/Admin/DatePlanning.vue'
import client from '@/api/client.js'

vi.mock('@/api/client.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const plan = {
  lengthWeeks: 10,
  startDate: '2026-11-16',
  endDate: '2027-01-25',
  sectionOffsets: [0, 2, 4, 6, 8],
  sectionDates: [
    '2026-11-16',
    '2026-11-30',
    '2026-12-14',
    '2026-12-28',
    '2027-01-11',
  ],
  moduleDates: [
    { startDate: '2026-11-16', endDate: '2026-11-30' },
    { startDate: '2026-11-30', endDate: '2026-12-14' },
    { startDate: '2026-12-14', endDate: '2026-12-28' },
    { startDate: '2026-12-28', endDate: '2027-01-11' },
    { startDate: '2027-01-11', endDate: '2027-01-25' },
  ],
  source: 'default',
}

const mountView = async () => {
  const wrapper = shallowMount(DatePlanning)
  await flushPromises()
  wrapper.vm.instanceId = 'instance-1'
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('DatePlanning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockResolvedValue({
      data: {
        instances: [
          {
            _id: 'instance-1',
            courseName: 'Matematik 1',
            startDate: '2026-11-16T00:00:00.000Z',
            endDate: '2026-12-18T00:00:00.000Z',
          },
        ],
      },
    })
    client.post.mockResolvedValue({ data: { datePlan: plan } })
    client.put.mockResolvedValue({
      data: { success: true, message: 'Date plan applied', datePlan: plan },
    })
  })

  it('loads course instances into the selector', async () => {
    const wrapper = await mountView()

    expect(client.get).toHaveBeenCalledWith('/course-instances')
    expect(wrapper.text()).toContain('Matematik 1')
    expect(wrapper.findAll('option')).toHaveLength(6)
  })

  it('previews a 10-week plan and renders its module dates', async () => {
    const wrapper = await mountView()
    wrapper.vm.lengthWeeks = '10'
    await wrapper.findAll('button')[0].trigger('click')
    await flushPromises()

    expect(client.post).toHaveBeenCalledWith('/date-plan/preview', {
      instanceId: 'instance-1',
      lengthWeeks: 10,
    })
    expect(wrapper.text()).toContain('2026-11-30')
    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
  })

  it('applies the plan and shows the success message', async () => {
    const wrapper = await mountView()
    wrapper.vm.lengthWeeks = '20'
    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()

    expect(client.put).toHaveBeenCalledWith('/date-plan/apply', {
      instanceId: 'instance-1',
      lengthWeeks: 20,
    })
    expect(wrapper.text()).toContain('Date plan applied')
  })

  it('shows an API error instead of a plan', async () => {
    client.post.mockRejectedValue({
      response: { data: { error: { message: 'Ogiltigt datum' } } },
    })

    const wrapper = await mountView()
    await wrapper.findAll('button')[0].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Ogiltigt datum')
    expect(wrapper.find('.card').exists()).toBe(false)
  })
})
