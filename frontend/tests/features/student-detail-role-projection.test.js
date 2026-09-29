import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/vue'
import GeneralTab from '@/views/Student/tabs/GeneralTab.vue'
import { renderWithVuetify, buildStore, ok, httpError } from '../helpers/render.js'

const { toast } = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
}))

vi.mock('@/composables/useToast.js', () => ({ useToast: () => toast }))

import client from '@/api/client.js'

const ROUTES = [
    { path: '/', component: { template: '<div />' } },
    { path: '/student/:id', component: { template: '<div />' } },
]

const STUDENT = (overrides = {}) => ({
    _id: 'stu-1',
    name: 'Anna Andersson',
    email: 'anna@example.se',
    personalNumber: '19900101-0000',
    aplStatus: 'YELLOW',
    municipality: { type: 'Stockholm' },
    supportInfo: [],
    education: [],
    commentHistory: [],
    deviations: [],
    ...overrides,
})

/** Getters mirror the real store: `isAdmin` covers systemadmin + admin. */
function storeFor(role) {
    const admin = role === 'admin' || role === 'systemadmin'
    return buildStore({
        getters: {
            isAdmin: admin,
            isSystemAdmin: role === 'systemadmin',
            isTeacher: role === 'teacher',
            isCoordinator: role === 'coordinator',
            isSyv: role === 'syv',
            isSpecped: role === 'specped',
            isStudent: role === 'student',
            userRole: role,
        },
    })
}

async function mountTab({ role = 'admin', student = STUDENT() } = {}) {
    client.get.mockResolvedValue(ok({}))
    const result = await renderWithVuetify(GeneralTab, {
        props: { student, changeHistory: [] },
        store: storeFor(role),
        routes: ROUTES,
    })
    await result.router.push('/student/stu-1')
    await result.router.isReady()
    return result
}

const SUPPORT_HEADING = 'Stödkontakter'
const DEVIATION_HEADING = 'Avvikelser & Undantag'

describe('Feature: student detail role projection (AV-2)', () => {
    beforeEach(() => vi.resetAllMocks())

    describe.each(['admin', 'systemadmin', 'syv', 'specped'])(
        'roles allowed by the API policy: %s',
        (role) => {
            it('sees the support and deviation cards', async () => {
                await mountTab({ role })

                expect(await screen.findByText(SUPPORT_HEADING)).toBeInTheDocument()
                expect(screen.getByText(DEVIATION_HEADING)).toBeInTheDocument()
            })
        }
    )

    // A teacher may file a deviation but the API denies read access, so the
    // deviation card is shown create-only. See "teacher create-only affordance".
    it('hides the support card from a teacher', async () => {
        await mountTab({ role: 'teacher' })

        await screen.findByText(DEVIATION_HEADING)
        expect(screen.queryByText(SUPPORT_HEADING)).not.toBeInTheDocument()
    })

    it('hides both cards from a coordinator', async () => {
        await mountTab({ role: 'coordinator' })

        // The basic-information card always renders, so wait for that first.
        await screen.findByText('Grundläggande Information')
        expect(screen.queryByText(SUPPORT_HEADING)).not.toBeInTheDocument()
        expect(screen.queryByText(DEVIATION_HEADING)).not.toBeInTheDocument()
    })

    it('fetches support data for an allowed role', async () => {
        client.get.mockImplementation((url) => {
            if (String(url).includes('/support')) return Promise.resolve(ok({}))
            return Promise.resolve(ok({}))
        })

        await mountTab({ role: 'admin' })
        await screen.findByText(SUPPORT_HEADING)

        await waitFor(() =>
            expect(
                client.get.mock.calls.some(([url]) => String(url).includes('/support'))
            ).toBe(true)
        )
    })

    it('never exposes the admin edit control to a syv user', async () => {        await mountTab({ role: 'syv' })

        await screen.findByText(SUPPORT_HEADING)
        expect(screen.queryByRole('button', { name: 'Redigera' })).not.toBeInTheDocument()
    })

    it('exposes the admin edit control to an admin', async () => {
        await mountTab({ role: 'admin' })

        expect(await screen.findByRole('button', { name: 'Redigera' })).toBeInTheDocument()
    })

    it('hides support data from a teacher even when the student has support contacts', async () => {
        const student = STUDENT({
            supportInfo: [{ name: 'Handledare Eva', phone: '070-1234567' }],
        })

        await mountTab({ role: 'teacher', student })

        await screen.findByText('Grundläggande Information')
        expect(screen.queryByText('Handledare Eva')).not.toBeInTheDocument()
    })

    it('makes no support/deviation request for a denied role', async () => {
        client.get.mockRejectedValue(httpError(403, 'Forbidden'))

        await mountTab({ role: 'teacher' })
        await screen.findByText('Grundläggande Information')

        const detailCalls = client.get.mock.calls.filter(([url]) =>
            String(url).includes('/student-details/')
        )
        expect(detailCalls).toEqual([])
    })

    it('loads support contacts for an allowed role', async () => {
        await mountTab({ role: 'admin' })
        await screen.findByText(SUPPORT_HEADING)

        await waitFor(() =>
            expect(
                client.get.mock.calls.some(([url]) => String(url).includes('/support'))
            ).toBe(true)
        )
    })

    it('loads deviations for an allowed role', async () => {
        await mountTab({ role: 'syv' })
        await screen.findByText(DEVIATION_HEADING)

        await waitFor(() =>
            expect(
                client.get.mock.calls.some(([url]) => String(url).includes('/deviations'))
            ).toBe(true)
        )
    })

    describe('teacher create-only affordance', () => {
        it('keeps the "+ Ny avvikelse" button for a teacher', async () => {
            await mountTab({ role: 'teacher' })
            await screen.findByText(DEVIATION_HEADING)
            expect(screen.getByRole('button', { name: '+ Ny avvikelse' })).toBeInTheDocument()
        })

        it('does not let a teacher read the existing deviation list', async () => {
            await mountTab({
                role: 'teacher',
                student: STUDENT({
                    deviations: [{ _id: 'd1', title: 'Kommunal avvikelse', status: 'pending' }],
                }),
            })

            await screen.findByText(DEVIATION_HEADING)
            expect(screen.queryByText('Kommunal avvikelse')).not.toBeInTheDocument()
            expect(
                screen.getByText('Du kan rapportera en avvikelse, men inte se tidigare avvikelser.')
            ).toBeInTheDocument()
        })

        it('does not offer the support card to a teacher', async () => {
            await mountTab({ role: 'teacher' })
            await screen.findByText(DEVIATION_HEADING)
            expect(screen.queryByText(SUPPORT_HEADING)).not.toBeInTheDocument()
        })

        it('does not offer a create button to a coordinator', async () => {
            await mountTab({ role: 'coordinator' })
            await screen.findByText('Grundläggande Information')
            expect(screen.queryByRole('button', { name: '+ Ny avvikelse' })).not.toBeInTheDocument()
        })
    })
})
