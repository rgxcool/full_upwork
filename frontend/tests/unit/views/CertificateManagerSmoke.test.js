import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import CertificateManager from '@/views/Admin/CertificateManager.vue'
import client from '@/api/client.js'
import { buildStore, buildRouter } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('CertificateManager smoke', () => {
  it('renders', async () => {
    const store = buildStore({ getters: { isAdmin: true } })
    const w = shallowMount(CertificateManager, { global: { plugins: [store, buildRouter()] } })
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
})
