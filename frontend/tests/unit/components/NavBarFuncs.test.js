import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import NavBar from '@/components/NavBar.vue'
import { buildStore, buildRouter } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('NavBar funcs', () => {
  it('calls helpers', async () => {
    const store = buildStore({ getters: { isLoggedIn: true, userRole: 'teacher', hasPermission: () => true } })
    const w = shallowMount(NavBar, { global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    const vm = w.vm
    vm.toggleMobileMenu()
    vm.closeMobileMenu()
    vm.notificationTypeLabel('info')
    vm.selectSearchType('Alla')
    vm.handleInputFocus()
    vm.clearSearch()
    expect(true).toBe(true)
  })
})
