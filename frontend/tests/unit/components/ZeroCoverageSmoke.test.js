import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { buildStore, buildRouter } from '../../helpers/render.js'
import PageHeader from '@/components/base/PageHeader.vue'
import ActionPlan from '@/views/Admin/SearchTabs/ActionPlanQuestions.vue'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('Zero coverage smoke', () => {
  it('renders PageHeader', async () => {
    const w = shallowMount(PageHeader, { props: { title: 'T', subtitle: 'S' } })
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
  it('renders ActionPlanQuestions', async () => {
    const w = shallowMount(ActionPlan)
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
})

import GeneralTab from '@/views/Student/tabs/GeneralTab.vue'
import APLBoard from '@/components/APLBoard.vue'

describe('More coverage', () => {
  it('renders GeneralTab', async () => {
    const store = buildStore()
    const w = shallowMount(GeneralTab, { props: { student: { _id: 's1', name: 'Elev' } }, global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
  it('renders APLBoard', async () => {
    const w = shallowMount(APLBoard)
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
})
