import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationManager from '@/views/Admin/NotificationManager.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

const mockToast = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => mockToast,
}))

import client from '@/api/client.js'

const notification = (overrides = {}) => ({
    _id: 'notification-1',
    type: 'grades_pending',
    message: 'Betyg väntar för Anna',
    resolved: false,
    ...overrides,
})

const mountPage = async () => {
    const wrapper = mount(NotificationManager)
    await flushPromises()
    return wrapper
}

describe('NotificationManager.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('loads notifications and displays their message, type, and status', async () => {
        client.get.mockResolvedValueOnce({
            data: [
                notification(),
                notification({
                    _id: 'notification-2',
                    message: 'Intyg klart',
                    resolved: true,
                }),
            ],
        })

        const wrapper = await mountPage()

        expect(client.get).toHaveBeenCalledWith('/notifications')
        expect(wrapper.text()).toContain('Betyg väntar för Anna')
        expect(wrapper.text()).toContain('grades_pending')
        expect(wrapper.text()).toContain('Ohanterad')
        expect(wrapper.text()).toContain('Hanterad')
    })

    it('shows an empty state when the API returns no notifications', async () => {
        client.get.mockResolvedValueOnce({ data: { notifications: [] } })

        const wrapper = await mountPage()

        expect(wrapper.text()).toContain('Inga notifieringar.')
    })

    it('shows a loading indicator until the request finishes', async () => {
        let resolveRequest
        client.get.mockReturnValueOnce(new Promise((resolve) => {
            resolveRequest = resolve
        }))

        const wrapper = mount(NotificationManager)
        expect(wrapper.find('.v-progress-linear').exists()).toBe(true)

        resolveRequest({ data: [] })
        await flushPromises()

        expect(wrapper.vm.loading).toBe(false)
        expect(wrapper.text()).toContain('Inga notifieringar.')
    })

    it('shows an error and notifies the user when loading fails', async () => {
        client.get.mockRejectedValueOnce(new Error('network failure'))

        const wrapper = await mountPage()

        expect(wrapper.text()).toContain('Kunde inte hämta notifieringar.')
        expect(mockToast.error).toHaveBeenCalledWith('Kunde inte hämta notifieringar.')
    })

    it('reloads notifications when the refresh button is clicked', async () => {
        client.get.mockResolvedValueOnce({ data: [] })
        const wrapper = await mountPage()
        client.get.mockResolvedValueOnce({ data: [notification()] })

        await wrapper.find('button').trigger('click')
        await flushPromises()

        expect(client.get).toHaveBeenCalledTimes(2)
        expect(wrapper.text()).toContain('Betyg väntar för Anna')
    })

    it('resets a resolved notification and reloads the list', async () => {
        client.get
            .mockResolvedValueOnce({ data: [notification({ resolved: true })] })
            .mockResolvedValueOnce({ data: [] })
        client.put.mockResolvedValueOnce({ data: { message: 'ok' } })

        const wrapper = await mountPage()
        const resetButton = wrapper.findAll('button').find((button) =>
            button.text().includes('Återställ')
        )

        await resetButton.trigger('click')
        await flushPromises()

        expect(client.put).toHaveBeenCalledWith('/notifications/notification-1/reset')
        expect(client.get).toHaveBeenCalledTimes(2)
        expect(mockToast.success).toHaveBeenCalledWith('Notifiering återställd.')
        expect(wrapper.text()).toContain('Inga notifieringar.')
    })

    it('reports an error when resetting a notification fails', async () => {
        client.get.mockResolvedValueOnce({
            data: [notification({ resolved: true })],
        })
        client.put.mockRejectedValueOnce(new Error('network failure'))

        const wrapper = await mountPage()
        const resetButton = wrapper.findAll('button').find((button) =>
            button.text().includes('Återställ')
        )

        await resetButton.trigger('click')
        await flushPromises()

        expect(mockToast.error).toHaveBeenCalledWith('Kunde inte återställa notifiering.')
    })
})
