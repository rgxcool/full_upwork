import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { useToast } from '@/composables/useToast.js'

beforeEach(() => {
  vi.useFakeTimers()
  const toast = useToast()
  toast.dismiss()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function mountToast() {
  const { default: ToastNotification } = await import('@/components/ToastNotification.vue')
  return mount(ToastNotification, {
    attachTo: document.body,
  })
}

describe('ToastNotification', () => {
  it('renders nothing when toast is hidden', async () => {
    const wrapper = await mountToast()
    expect(wrapper.find('.toast-notification').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows toast when useToast().success is called', async () => {
    const toast = useToast()
    const wrapper = await mountToast()

    toast.success('Sparat!')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.toast-notification').exists()).toBe(true)
    expect(wrapper.find('.toast-notification__message').text()).toBe('Sparat!')
    wrapper.unmount()
  })

  it('displays error type with correct accent color', async () => {
    const toast = useToast()
    const wrapper = await mountToast()

    toast.error('Fel!')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const toastEl = wrapper.find('.toast-notification')
    expect(toastEl.exists()).toBe(true)
    expect(toastEl.attributes('style')).toContain('var(--status-danger)')
    wrapper.unmount()
  })

  it('close button calls toast.dismiss()', async () => {
    const toast = useToast()
    const wrapper = await mountToast()

    toast.success('Klicka bort')
    await wrapper.vm.$nextTick()

    const btn = wrapper.find('.toast-notification__close')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(toast.state.show).toBe(false)
    wrapper.unmount()
  })
})