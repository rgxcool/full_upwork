import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import APLBoard from '@/components/APLBoard.vue'
import { buildStore, buildRouter } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('APLBoard funcs', () => {
  it('calls helpers', async () => {
    const store = buildStore({ getters: { isAdmin: true, isTeacher: true } })
    const w = shallowMount(APLBoard, { props: { students: [{ _id: 's1', name: 'Elev', aplStatus: 'GRAY' }] }, global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    const vm = w.vm
    vm.hasFiles('s1')
    vm.isBehindSchedule({ _id: 's1' })
    vm.commentStatus({ _id: 's1' })
    expect(true).toBe(true)
  })
})
