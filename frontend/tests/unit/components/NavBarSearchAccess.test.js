import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import NavBar from '@/components/NavBar.vue'
import client from '@/api/client.js'
import { userCanAccess } from '@/store/store.js'
import { buildRouter, buildStore } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/composables/useToast.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

const detailRoles = ['teacher', 'syv', 'specped', 'admin', 'systemadmin']
const studentRoles = ['student', 'teacher', 'syv', 'specped', 'admin', 'systemadmin']
const teacherRoles = ['teacher', 'admin', 'systemadmin', 'coordinator', 'syv', 'specped']

const buildTestRouter = () =>
  buildRouter([
    { path: '/education/:id', meta: { role: detailRoles }, component: { template: '<div />' } },
    { path: '/student/:id', meta: { role: studentRoles }, component: { template: '<div />' } },
    { path: '/teacher/:id', meta: { role: teacherRoles }, component: { template: '<div />' } },
    {
      path: '/detaljer/:type/:id',
      meta: { role: detailRoles },
      component: { template: '<div />' },
    },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ])

const mountAs = (role) => {
  const user = { _id: 'u1', name: 'Test User', role, roles: [role] }
  const store = buildStore({
    state: { user },
    getters: {
      isLoggedIn: true,
      userRole: role,
      userRoles: [role],
      userId: 'u1',
      isAdmin: ['admin', 'systemadmin'].includes(role),
      hasPermission: (state) => (required) =>
        (Array.isArray(required) ? required : [required]).some((r) =>
          (state.user?.roles || []).includes(r)
        ),
      canAccess: (state) => (meta) => userCanAccess(state.user, meta),
    },
  })

  return shallowMount(NavBar, {
    global: { plugins: [store, buildTestRouter()] },
  })
}

const RESULTS = [
  { id: 'course-1', type: 'Kurs', name: 'Matematik' },
  { id: 'student-1', type: 'Elev', name: 'Anna' },
  { id: 'teacher-1', type: 'Lärare', name: 'Lärare Karlsson' },
]

describe('NavBar search results honour target route roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockResolvedValue({ data: [] })
  })

  it('hides coordinator-visible links to routes coordinators cannot open', async () => {
    const wrapper = mountAs('coordinator')
    wrapper.vm.searchResults = RESULTS
    wrapper.vm.showResults = true
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.navigableResults.map((r) => r.id)).toEqual(['teacher-1'])
    expect(wrapper.text()).not.toContain('Matematik')
    expect(wrapper.text()).not.toContain('Anna')
    expect(wrapper.text()).toContain('Lärare Karlsson')
  })

  it('keeps the links a teacher is allowed to open', async () => {
    const wrapper = mountAs('teacher')
    wrapper.vm.searchResults = RESULTS
    wrapper.vm.showResults = true
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.navigableResults.map((r) => r.id)).toEqual(RESULTS.map((r) => r.id))
  })
})
