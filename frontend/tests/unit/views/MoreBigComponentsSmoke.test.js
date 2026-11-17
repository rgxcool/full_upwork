import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import CourseTemplates from '@/views/Admin/CourseTemplates.vue'
import StudentDetails from '@/views/Student/StudentDetails.vue'
import StudyPlanTab from '@/views/Student/tabs/StudyPlanTab.vue'
import CoursePlacementWizard from '@/views/Student/CoursePlacementWizard.vue'
import StudentCourseCardsAdmin from '@/views/Admin/StudentCourseCardsAdmin.vue'
import CourseMatching from '@/views/Admin/CourseMatching.vue'
import { buildStore, buildRouter } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('More big components smoke', () => {
  const mount = async (Comp, props = {}) => {
    const store = buildStore({ getters: { isAdmin: true, isTeacher: true } })
    const w = shallowMount(Comp, { props, global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    return w
  }
  it('CourseTemplates', async () => { expect((await mount(CourseTemplates)).exists()).toBe(true) })
  it('StudentDetails', async () => { expect((await mount(StudentDetails, { id: 's1' })).exists()).toBe(true) })
  it('StudyPlanTab', async () => { expect((await mount(StudyPlanTab, { student: { _id: 's1', name: 'Elev' } })).exists()).toBe(true) })
  it('CourseMatching', async () => { expect((await mount(CourseMatching)).exists()).toBe(true) })
})
