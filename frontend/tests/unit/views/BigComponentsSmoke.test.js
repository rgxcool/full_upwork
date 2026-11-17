import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import GeneralTab from '@/views/Student/tabs/GeneralTab.vue'
import APLBoard from '@/components/APLBoard.vue'
import BetygSattning from '@/views/Teacher/BetygSattning.vue'
import AplTab from '@/views/Student/tabs/AplTab.vue'
import ManualAddStudent from '@/views/Admin/ManualAddStudent.vue'
import FaqManagement from '@/views/Admin/FaqManagement.vue'
import ExcelUpload from '@/views/Admin/ExcelUpload.vue'
import { buildStore, buildRouter } from '../../helpers/render.js'
import client from '@/api/client.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('Big components smoke', () => {
  const mount = async (Comp, props = {}) => {
    const store = buildStore({ getters: { isAdmin: true, isTeacher: true } })
    const w = shallowMount(Comp, { props, global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    return w
  }
  it('GeneralTab', async () => { expect((await mount(GeneralTab, { student: { _id: 's1', name: 'Elev' } })).exists()).toBe(true) })
  it('APLBoard', async () => { expect((await mount(APLBoard)).exists()).toBe(true) })
  it('BetygSattning', async () => { expect((await mount(BetygSattning)).exists()).toBe(true) })
  it('AplTab', async () => { expect((await mount(AplTab, { student: { _id: 's1', name: 'Elev' } })).exists()).toBe(true) })
  it('ManualAddStudent', async () => { expect((await mount(ManualAddStudent)).exists()).toBe(true) })
  it('FaqManagement', async () => { expect((await mount(FaqManagement)).exists()).toBe(true) })
  it('ExcelUpload', async () => { expect((await mount(ExcelUpload)).exists()).toBe(true) })
})
