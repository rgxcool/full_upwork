import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import NavBar from '@/components/NavBar.vue'
import client from '@/api/client.js'
import { buildRouter, buildStore } from '../../helpers/render.js'

vi.mock('@/api/client.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/composables/useToast.js', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

const DatePickerStub = {
  name: 'DatePicker',
  props: ['modelValue', 'format', 'placeholder'],
  emits: ['update:modelValue', 'change'],
  template: '<div class="date-picker-stub" />',
}

// shallowMount's default RouterLink stub drops slot content, including the badge.
const RouterLinkStub = {
  name: 'RouterLinkStub',
  props: ['to'],
  template: '<a><slot /></a>',
}

const mountNavBar = (userRole) =>
  shallowMount(NavBar, {
    global: {
      plugins: [
        buildStore({
          getters: {
            isLoggedIn: true,
            userRole,
            userRoles: [userRole],
            userId: 'user-1',
            isAdmin: false,
            hasPermission: () => false,
          },
        }),
        buildRouter(),
      ],
      stubs: { DatePicker: DatePickerStub, RouterLink: RouterLinkStub, 'router-link': RouterLinkStub },
    },
  })

describe('NavBar unread message badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockImplementation((url) => {
      if (url === '/notifications') return Promise.resolve({ data: [] })
      if (url === '/unread-count') {
        return Promise.resolve({ data: { unreadCount: 3 } })
      }
      return Promise.resolve({ data: [] })
    })
  })

  it('shows the unread count returned by /unread-count', async () => {
    const wrapper = mountNavBar('teacher')
    await flushPromises()

    expect(client.get).toHaveBeenCalledWith('/unread-count')
    expect(wrapper.find('.notis-badge').text()).toBe('3')
  })

  it('fetches the unread count for messaging roles without notifications', async () => {
    const wrapper = mountNavBar('syv')
    await flushPromises()

    expect(client.get).toHaveBeenCalledWith('/unread-count')
    expect(client.get).not.toHaveBeenCalledWith('/notifications')
    expect(wrapper.find('.notis-badge').text()).toBe('3')
  })

  it('hides the badge when there are no unread messages', async () => {
    client.get.mockImplementation((url) => {
      if (url === '/unread-count') {
        return Promise.resolve({ data: { unreadCount: 0 } })
      }
      return Promise.resolve({ data: [] })
    })

    const wrapper = mountNavBar('student')
    await flushPromises()

    expect(wrapper.find('.notis-badge').exists()).toBe(false)
  })
})
