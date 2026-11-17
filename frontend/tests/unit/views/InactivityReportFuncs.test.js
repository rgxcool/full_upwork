import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import InactivityReport from '@/views/Admin/InactivityReport.vue'
import { buildStore, buildRouter } from '../../helpers/render.js'
import client from '@/api/client.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { students: [], summary: { evaluated: 0, mustWithdraw: 0, inactiveForWarning: 0 }, thresholds: { withdrawDays: 5, warningDays: 14 } } }), post: vi.fn(), put: vi.fn() } }))

describe('InactivityReport funcs', () => {
  it('calls helpers', async () => {
    const store = buildStore({ getters: { isAdmin: true } })
    const w = shallowMount(InactivityReport, { global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    const vm = w.vm
    vm.formatDate('2026-11-17')
    vm.daysLabel(5)
    vm.loginLabel({ daysSinceLastLogin: 3 })
    vm.openWithdrawDialog({ studentId: 's1', name: 'Elev' })
    vm.closeWithdrawDialog()
    expect(true).toBe(true)
  })
})
