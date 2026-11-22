import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PermissionsTab from '@/views/Student/tabs/PermissionsTab.vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'
import { buildStore } from '../../helpers/render.js'

// Student profile → "Behörigheter": admin-only view of a student's account, custom feature grants
// and password reset. Guards that role defaults and explicit grants/denials are shown and saved
// exactly as set.

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

const toast = useToast().state

const studentWithoutUser = { _id: 'stu-1', name: 'Test Elev', email: 'test.elev@example.invalid' }
const studentWithUser = (permissions = {}) => ({
  ...studentWithoutUser,
  user: { _id: 'user-1', roles: ['student'], permissions },
})

const mountTab = (student, { isAdmin = true } = {}) =>
  mount(PermissionsTab, {
    props: { student },
    global: { plugins: [buildStore({ getters: { isAdmin } })] },
  })

const button = (wrapper, text) => wrapper.findAll('button').find((b) => b.text().trim() === text)
const checkboxFor = (wrapper, label) =>
  wrapper
    .findAll('tbody tr')
    .find((tr) => tr.find('.feature-name').text() === label)
    .find('input[type="checkbox"]')

describe('Student PermissionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toast.show = false
    toast.message = ''
    client.get.mockRejectedValue(new Error('offline')) // catalog falls back to the built-in list
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('is hidden from non-admins and never loads the catalog', async () => {
    const wrapper = mountTab(studentWithUser(), { isAdmin: false })
    await flushPromises()
    expect(wrapper.text()).toContain('Du har inte behörighet att se denna sida.')
    expect(client.get).not.toHaveBeenCalled()
  })

  it('creates a user for a student without one and shows the temporary password', async () => {
    client.post.mockResolvedValue({ data: { tempPassword: 'Temp-1234' } })
    const wrapper = mountTab(studentWithoutUser)
    await flushPromises()

    await button(wrapper, 'Skapa användare för elev').trigger('click')
    await flushPromises()

    expect(client.post).toHaveBeenCalledWith('/users/create-for-student', {
      studentId: 'stu-1',
      email: 'test.elev@example.invalid',
      name: 'Test Elev',
    })
    expect(wrapper.emitted('user-created')).toHaveLength(1)
    expect(wrapper.text()).toContain('Användare skapad!')
    const pwd = wrapper.find('#temporary-password')
    expect(pwd.element.value).toBe('Temp-1234')
    expect(pwd.attributes('type')).toBe('password')
    await wrapper.find('.alert button').trigger('click')
    expect(wrapper.find('#temporary-password').attributes('type')).toBe('text')
  })

  it('reports a failed user creation', async () => {
    client.post.mockRejectedValue(new Error('Konflikt'))
    const wrapper = mountTab(studentWithoutUser)
    await flushPromises()
    await button(wrapper, 'Skapa användare för elev').trigger('click')
    await flushPromises()
    expect(toast.message).toBe('Kunde inte skapa användare. Konflikt')
    expect(toast.type).toBe('error')
    expect(wrapper.emitted('user-created')).toBeUndefined()
  })

  it('shows role defaults, and an explicit denial overrides the role', async () => {
    const wrapper = mountTab(studentWithUser({ own_settings: false }))
    await flushPromises()
    // Students may not search users by role default…
    expect(checkboxFor(wrapper, 'Söka efter användare').element.checked).toBe(false)
    // …and may edit own settings by default, but this student was explicitly denied.
    expect(checkboxFor(wrapper, 'Egna inställningar (ex profilbild)').element.checked).toBe(false)
  })

  it('saves only after a change, sends the exact grants, and resets the dirty state', async () => {
    client.put.mockResolvedValue({ data: {} })
    const wrapper = mountTab(studentWithUser())
    await flushPromises()

    const save = () => button(wrapper, 'Spara behörigheter')
    expect(save().attributes('disabled')).toBeDefined()

    await checkboxFor(wrapper, 'Söka efter användare').setValue(true)
    expect(save().attributes('disabled')).toBeUndefined()
    await save().trigger('click')
    await flushPromises()

    expect(client.put).toHaveBeenCalledWith('/users/user-1/permissions', {
      permissions: { search_users: true },
    })
    expect(toast.message).toBe('Behörigheterna har uppdaterats!')
    expect(save().attributes('disabled')).toBeDefined()
  })

  it('reports a failed save and keeps the change', async () => {
    client.put.mockRejectedValue(new Error('500'))
    const wrapper = mountTab(studentWithUser())
    await flushPromises()
    await checkboxFor(wrapper, 'Statistik').setValue(true)
    await button(wrapper, 'Spara behörigheter').trigger('click')
    await flushPromises()
    expect(toast.message).toBe('Kunde inte spara behörigheter.')
    expect(button(wrapper, 'Spara behörigheter').attributes('disabled')).toBeUndefined()
  })

  it('uses the feature catalog from the backend when it is available', async () => {
    client.get.mockResolvedValue({
      data: {
        features: [{ key: 'reports', label: 'Rapporter' }],
        permissionMatrix: { reports: { student: 'Ja' } },
      },
    })
    const wrapper = mountTab(studentWithUser())
    await flushPromises()
    expect(client.get).toHaveBeenCalledWith('/permissions')
    expect(wrapper.findAll('.feature-name').map((td) => td.text())).toEqual(['Rapporter'])
    expect(checkboxFor(wrapper, 'Rapporter').element.checked).toBe(true)
  })

  it('reloads the grants when a different student is shown', async () => {
    const wrapper = mountTab(studentWithUser())
    await flushPromises()
    expect(checkboxFor(wrapper, 'Statistik').element.checked).toBe(false)
    await wrapper.setProps({ student: { ...studentWithUser({ statistics: true }), _id: 'stu-2' } })
    await flushPromises()
    expect(checkboxFor(wrapper, 'Statistik').element.checked).toBe(true)
  })

  it('resets the password and shows the new temporary password', async () => {
    client.post.mockResolvedValue({ data: { tempPassword: 'Ny-5678' } })
    const wrapper = mountTab(studentWithUser())
    await flushPromises()

    await button(wrapper, 'Återställ lösenord').trigger('click')
    await flushPromises()

    expect(client.post).toHaveBeenCalledWith('/users/user-1/reset-password')
    expect(wrapper.find('#temp-password-display').element.value).toBe('Ny-5678')
    expect(toast.message).toBe('Lösenordet har återställts! Det nya lösenordet visas nedan.')
    expect(button(wrapper, 'Återställ lösenord igen')).toBeDefined()
    await wrapper.findAll('.alert button').at(-1).trigger('click')
    expect(wrapper.find('#temp-password-display').attributes('type')).toBe('text')
  })

  it('reports a failed password reset', async () => {
    client.post.mockRejectedValue(new Error('Nätverksfel'))
    const wrapper = mountTab(studentWithUser())
    await flushPromises()
    await button(wrapper, 'Återställ lösenord').trigger('click')
    await flushPromises()
    expect(toast.message).toBe('Kunde inte återställa lösenord. Nätverksfel')
    expect(wrapper.find('#temp-password-display').exists()).toBe(false)
  })
})
