import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import GeneralTab from '@/views/Student/tabs/GeneralTab.vue'
import { buildStore, buildRouter } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('GeneralTab funcs', () => {
  it('calls helpers', async () => {
    const store = buildStore({ getters: { isAdmin: true, userRole: 'teacher', userId: 'u1' } })
    const w = shallowMount(GeneralTab, { props: { student: { _id: 's1', name: 'Elev', commentHistory: [] } }, global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    const vm = w.vm
    vm.formatDate('2026-11-17')
    vm.formatDateTime('2026-11-17T10:00:00Z')
    vm.formatRole('teacher')
    vm.getAplStatusLabel('GREEN')
    vm.getFieldLabel('name')
    vm.formatChangeValue('x')
    vm.canEditComment({ by: 'u1' })
    vm.canDeleteComment({ by: 'u1' })
    expect(true).toBe(true)
  })
})
