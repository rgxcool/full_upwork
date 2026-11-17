import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import GradingScaleAdmin from '@/views/Admin/GradingScaleAdmin.vue'
import CourseOverview from '@/components/Teacher/CourseOverview.vue'
import PermissionsTab from '@/views/Student/tabs/PermissionsTab.vue'
import ChangeActionPlan from '@/views/Admin/SearchTabs/ChangeActionPlan.vue'
import ActionPlanTab from '@/views/Admin/SearchTabs/ActionPlanTab.vue'
import AplCompletedTab from '@/views/Admin/AplCompletedTab.vue'
import DocumentSection from '@/views/Admin/SearchTabs/DocumentSection.vue'
import { buildStore, buildRouter } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('Even more smoke', () => {
  const mount = async (Comp, props = {}) => {
    const store = buildStore({ getters: { isAdmin: true, isTeacher: true } })
    const w = shallowMount(Comp, { props, global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    return w
  }
  it('GradingScaleAdmin', async () => { expect((await mount(GradingScaleAdmin)).exists()).toBe(true) })
  it('CourseOverview', async () => { expect((await mount(CourseOverview)).exists()).toBe(true) })
  it('PermissionsTab', async () => { expect((await mount(PermissionsTab, { student: { _id: 's1', name: 'Elev' } })).exists()).toBe(true) })
  it('ChangeActionPlan', async () => { expect((await mount(ChangeActionPlan)).exists()).toBe(true) })
  it('ActionPlanTab', async () => { expect((await mount(ActionPlanTab)).exists()).toBe(true) })
  it('AplCompletedTab', async () => { expect((await mount(AplCompletedTab)).exists()).toBe(true) })
  it('DocumentSection', async () => { expect((await mount(DocumentSection)).exists()).toBe(true) })
})
