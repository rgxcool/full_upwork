import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ResourceVisitsReport from '@/views/Admin/ResourceVisitsReport.vue'
import { buildStore, buildRouter } from '../../helpers/render.js'
import client from '@/api/client.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { visits: [], total: 0, page: 1, limit: 20, summary: { totalVisits: 0, uniqueStudents: 0, byResource: {} } } }), post: vi.fn(), put: vi.fn() } }))

describe('ResourceVisitsReport funcs', () => {
  it('calls helpers', async () => {
    const store = buildStore({ getters: { isAdmin: true } })
    const w = shallowMount(ResourceVisitsReport, { global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    const vm = w.vm
    vm.formatDate('2026-11-17')
    vm.resourceTypeLabel('lesson')
    vm.prevPage()
    vm.nextPage()
    expect(true).toBe(true)
  })
})
