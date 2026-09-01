import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationManager from '@/views/Admin/NotificationManager.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
    normalizeError: (err) => ({
        status: err?.status ?? null,
        message: err?.message || 'Ett fel uppstod.',
        code: 'HTTP_500',
    }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    }),
}))

import client from '@/api/client.js'

const adminPageResponse = ({ notifications = [], total = 0, page = 1, limit = 20, totalPages = 0 } = {}) =>
    Promise.resolve({
        data: { notifications, total, page, limit, totalPages },
    })

const note = (overrides = {}) => ({
    _id: 'note-1',
    type: 'grades_pending',
    message: 'Betyg väntar för Anna',
    resolved: false,
    resolvedByUsers: [],
    resolvedByMe: false,
    meta: { studentId: 'stu-1', studentName: 'Anna Elev' },
    createdAt: '2026-01-01T10:00:00Z',
    ...overrides,
})

describe('NotificationManager.vue - Notifikationer', () => {
    let wrapper

    const mountPage = async (responder) => {
        if (responder) {
            client.get.mockImplementation(responder)
        }
        wrapper = mount(NotificationManager)
        await wrapper.vm.$nextTick()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.$nextTick()
    }

    beforeEach(() => {
        vi.resetAllMocks()
        client.get.mockResolvedValue(adminPageResponse())
        client.post.mockResolvedValue({ data: { success: true } })
        client.put.mockResolvedValue({ data: { message: 'ok' } })
    })

    it('loads the admin list with default params and renders rows', async () => {
        const grades = note()
        const handled = note({
            _id: 'note-2',
            type: 'inactivity_action',
            message: 'Inaktiv elev',
            resolvedByMe: true,
            resolvedByUsers: ['me'],
        })
        const responder = vi.fn().mockResolvedValue(
            adminPageResponse({ notifications: [grades, handled], total: 2, totalPages: 1 })
        )

        await mountPage(responder)

        expect(client.get).toHaveBeenCalledWith('/notifications/admin', {
            params: {
                status: 'open',
                page: 1,
                limit: 20,
                type: undefined,
                search: undefined,
            },
        })
        expect(wrapper.text()).toContain('Betyg väntar')
        expect(wrapper.text()).toContain('Betyg väntar för Anna')
        expect(wrapper.text()).toContain('Anna Elev')
        expect(wrapper.text()).toContain('Obehandlad')
        expect(wrapper.text()).toContain('Hanterad')
        expect(wrapper.text()).toContain('Inaktivitetsärende')
    })

    it('shows the inactivity action buttons for inactivity notifications', async () => {
        const responder = vi.fn().mockResolvedValue(
            adminPageResponse({
                notifications: [
                    note({ _id: 'act-1', type: 'inactivity_action', meta: { studentId: 'stu-1' } }),
                ],
                total: 1,
                totalPages: 1,
            })
        )

        await mountPage(responder)

        expect(wrapper.text()).toContain('Varningsmail')
        expect(wrapper.text()).toContain('Avsluta')
    })

    it('shows an empty state when there are no notifications', async () => {
        await mountPage()

        expect(wrapper.text()).toContain('Inga notifieringar.')
    })

    it('reloads with the selected status filter', async () => {
        const responder = vi.fn().mockResolvedValue(adminPageResponse({ total: 0 }))
        await mountPage(responder)

        wrapper.vm.status = 'resolved_by_me'
        await wrapper.vm.$nextTick()

        expect(responder).toHaveBeenLastCalledWith('/notifications/admin', {
            params: {
                status: 'resolved_by_me',
                page: 1,
                limit: 20,
                type: undefined,
                search: undefined,
            },
        })
    })

    it('resolves a notification with a per-user resolve call', async () => {
        const responder = vi.fn().mockResolvedValue(
            adminPageResponse({
                notifications: [note()],
                total: 1,
                totalPages: 1,
            })
        )
        await mountPage(responder)

        await wrapper.vm.resolveNotification('note-1')

        expect(client.put).toHaveBeenCalledWith('/notifications/note-1/resolve')
        expect(responder).toHaveBeenCalledTimes(2)
    })

    it('resets a resolved notification', async () => {
        const responder = vi.fn().mockResolvedValue(
            adminPageResponse({
                notifications: [note({ resolvedByMe: true, resolvedByUsers: ['me'] })],
                total: 1,
                totalPages: 1,
            })
        )
        await mountPage(responder)

        await wrapper.vm.resetNotification('note-1')

        expect(client.put).toHaveBeenCalledWith('/notifications/note-1/reset')
    })

    it('resets all notifications after confirmation', async () => {
        await mountPage()

        wrapper.vm.resetAllDialog = true
        await wrapper.vm.resetAllNotifications()

        expect(client.put).toHaveBeenCalledWith('/notifications/reset-all')
        expect(wrapper.vm.resetAllDialog).toBe(false)
    })

    it('sends a warning email for inactivity notifications', async () => {
        const responder = vi.fn().mockResolvedValue(
            adminPageResponse({
                notifications: [note({ _id: 'act-1', type: 'inactivity_action' })],
                total: 1,
                totalPages: 1,
            })
        )
        await mountPage(responder)

        await wrapper.vm.performInactivityAction(note({ _id: 'act-1', type: 'inactivity_action' }), 'warning')

        expect(client.post).toHaveBeenCalledWith('/inactivity/notifications/act-1/action', {
            action: 'warning',
        })
    })

    it('withdraws a student through the confirm dialog', async () => {
        const responder = vi.fn().mockResolvedValue(
            adminPageResponse({
                notifications: [note({ _id: 'act-1', type: 'inactivity_action' })],
                total: 1,
                totalPages: 1,
            })
        )
        await mountPage(responder)

        wrapper.vm.openWithdrawDialog(note({ _id: 'act-1', type: 'inactivity_action' }))

        await wrapper.vm.confirmWithdraw()

        expect(client.post).toHaveBeenCalledWith('/inactivity/notifications/act-1/action', {
            action: 'withdraw',
        })
        expect(wrapper.vm.withdrawDialog).toBe(false)
    })
})