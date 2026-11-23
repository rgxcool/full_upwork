import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ProfilePage from '@/views/Teacher/ProfilePage.vue'
import StaffProfile from '@/views/Teacher/StaffProfile.vue'
import client from '@/api/client.js'
import { buildRouter, buildStore } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/composables/useToast.js', () => ({ useToast: () => toast }))

const Stub = (name) => ({ name, template: `<div class="${name}" />` })

const storeFor = (roles) =>
  buildStore({
    getters: { isLoggedIn: true, userRole: roles[0], userRoles: roles, tasks: [] },
    actions: { fetchTasks: vi.fn() },
  })

const routerWithStaffPage = () =>
  buildRouter([
    { path: '/profile', component: { template: '<div />' } },
    { path: '/teacher/:id', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ])

const menuLabels = (wrapper) => wrapper.findAll('.sidebar-menu li').map((li) => li.text())

describe('Min profil → "Mitt filarkiv"', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockImplementation((url) => {
      if (url === '/me/teacher') return Promise.resolve({ data: { _id: 'teacher-42' } })
      return Promise.resolve({ data: [] })
    })
  })

  it('takes a teacher to their own staff profile on the Filarkiv tab', async () => {
    const router = routerWithStaffPage()
    await router.push('/profile')
    const wrapper = mount(ProfilePage, { global: { plugins: [storeFor(['teacher']), router] } })
    await flushPromises()

    const item = wrapper.findAll('.sidebar-menu li').find((li) => li.text().includes('Mitt filarkiv'))
    expect(item).toBeTruthy()
    await item.trigger('click')
    await flushPromises()

    expect(client.get).toHaveBeenCalledWith('/me/teacher')
    expect(router.currentRoute.value.path).toBe('/teacher/teacher-42')
    expect(router.currentRoute.value.query.tab).toBe('Filarkiv')
    wrapper.unmount()
  })

  it('shows an error and stays put when the own teacher profile cannot be loaded', async () => {
    client.get.mockImplementation((url) =>
      url === '/me/teacher' ? Promise.reject(new Error('404')) : Promise.resolve({ data: [] })
    )
    const router = routerWithStaffPage()
    await router.push('/profile')
    const wrapper = mount(ProfilePage, { global: { plugins: [storeFor(['teacher']), router] } })
    await flushPromises()

    await wrapper.findAll('.sidebar-menu li').find((li) => li.text().includes('Mitt filarkiv')).trigger('click')
    await flushPromises()

    expect(toast.error).toHaveBeenCalledWith('Kunde inte öppna ditt filarkiv. Försök igen.')
    expect(router.currentRoute.value.path).toBe('/profile')
    wrapper.unmount()
  })

  it('switches between the in-page sections for the other menu items', async () => {
    const router = routerWithStaffPage()
    const wrapper = mount(ProfilePage, { global: { plugins: [storeFor(['teacher']), router] } })
    await flushPromises()

    await wrapper.findAll('.sidebar-menu li').find((li) => li.text().includes('Delade dokument')).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Inga dokument har delats med dig.')
    wrapper.unmount()
  })

  it('is not offered to staff without the teacher role', async () => {
    const router = routerWithStaffPage()
    const wrapper = mount(ProfilePage, { global: { plugins: [storeFor(['syv']), router] } })
    await flushPromises()

    expect(menuLabels(wrapper).some((l) => l.includes('Mitt filarkiv'))).toBe(false)
    wrapper.unmount()
  })
})

describe('StaffProfile ?tab= deep link', () => {
  it('opens the Filarkiv tab when asked to', async () => {
    client.get.mockResolvedValue({
      data: { teacher: { _id: 'teacher-42', userId: { username: 'Test Lärare' } }, activeCourses: [], completedCourses: [], totalStudents: 0 },
    })
    const router = routerWithStaffPage()
    await router.push('/teacher/teacher-42?tab=Filarkiv')
    const wrapper = mount(StaffProfile, {
      global: {
        plugins: [storeFor(['teacher']), router],
        stubs: {
          StaffGeneralTab: Stub('general-tab'),
          StaffCoursesTab: Stub('courses-tab'),
          StaffStudentsTab: Stub('students-tab'),
          StaffDocumentsTab: Stub('documents-tab'),
          StaffPermissionsTab: Stub('permissions-tab'),
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.documents-tab').exists()).toBe(true)
    expect(wrapper.find('.general-tab').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('Min profil → "Att göra"', () => {
  const taskStore = (tasks) => {
    const actions = { fetchTasks: vi.fn(), addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn(), deleteAllTasks: vi.fn() }
    const store = buildStore({
      getters: { isLoggedIn: true, userRole: 'teacher', userRoles: ['teacher'], tasks },
      actions,
    })
    return { store, actions }
  }

  const openTasks = async (store) => {
    const wrapper = mount(ProfilePage, { global: { plugins: [store, routerWithStaffPage()] } })
    await flushPromises()
    await wrapper.findAll('.sidebar-menu li').find((li) => li.text().includes('Att göra')).trigger('click')
    return wrapper
  }

  it('adds a task with its due date and ignores an empty one', async () => {
    const { store, actions } = taskStore([])
    const wrapper = await openTasks(store)

    await wrapper.find('button.btn-primary').trigger('click') // empty: nothing happens
    expect(actions.addTask).not.toHaveBeenCalled()

    await wrapper.find('input[placeholder="Lägg till en uppgift..."]').setValue('Rätta prov')
    await wrapper.find('input[type="date"]').setValue('2026-12-01')
    await wrapper.find('button.btn-primary').trigger('click')

    expect(actions.addTask).toHaveBeenCalledWith(expect.anything(), {
      description: 'Rätta prov', dueDate: '2026-12-01', dueTime: null,
    })
    wrapper.unmount()
  })

  it('ticks off and deletes a task', async () => {
    const task = { _id: 't1', description: 'Rätta prov', isDone: false, dueDate: null, dueTime: null }
    const { store, actions } = taskStore([task])
    const wrapper = await openTasks(store)

    await wrapper.find('.task-check').trigger('change')
    expect(actions.updateTask).toHaveBeenCalledWith(expect.anything(), { ...task, isDone: true })

    await wrapper.find('.btn-delete').trigger('click')
    expect(actions.deleteTask).toHaveBeenCalledWith(expect.anything(), 't1')
    wrapper.unmount()
  })
})

