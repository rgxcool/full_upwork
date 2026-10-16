import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import GeneralTab from '@/views/Student/tabs/GeneralTab.vue'
import { renderWithVuetify, buildStore, ok, httpError } from '../helpers/render.js'

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

const { toast } = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
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
    ...overrides,
})

/**
 * The tab renders several cards, each with its own "Spara"/"Avbryt" pair, and the
 * header toggle repeats the "Avbryt" label, so every query is scoped to the
 * container that actually owns APL-status.
 */
function basicInfoCard(container) {
    const card = container.querySelector('.card')
    expect(card).toBeTruthy()
    return within(card)
}

/** The "APL-status:" info row, whose value span falls back to "Ej angivet". */
function aplStatusRow(container) {
    const row = [...container.querySelectorAll('.info-item')].find((el) =>
        el.querySelector('label')?.textContent.trim() === 'APL-status:'
    )
    expect(row).toBeTruthy()
    return within(row)
}

/** The save/cancel pair in the card's edit footer. */
function editActions(container) {
    const actions = container.querySelector('.edit-actions')
    expect(actions).toBeTruthy()
    return within(actions)
}

async function mountTab({ student = STUDENT(), role = 'admin' } = {}) {
    client.get.mockResolvedValue(ok({}))
    const result = await renderWithVuetify(GeneralTab, {
        props: { student, changeHistory: [] },
        store: buildStore({ getters: { isAdmin: role === 'admin', userRole: role } }),
        routes: ROUTES,
    })
    // Land on /student/stu-1 so `route.params.id` is populated.
    await result.router.push('/student/stu-1')
    await result.router.isReady()
    return result
}

describe('Feature: student APL status (GeneralTab)', () => {
    beforeEach(() => vi.resetAllMocks())

    it('shows the human-readable label for the current APL status', async () => {
        await mountTab({ student: STUDENT({ aplStatus: 'YELLOW' }) })
        expect(await screen.findByText('Gul - APL på gång')).toBeInTheDocument()
    })

    it('falls back to "Ej angivet" when the student has no APL status', async () => {
        const { container } = await mountTab({ student: STUDENT({ aplStatus: null }) })
        expect(aplStatusRow(container).getByText('Ej angivet')).toBeInTheDocument()
    })

    it('hides the edit control from non-admin roles', async () => {
        const { container } = await mountTab({ role: 'syv' })
        const card = basicInfoCard(container)
        expect(card.getByText('APL-status:')).toBeInTheDocument()
        expect(card.queryByRole('button', { name: 'Redigera' })).not.toBeInTheDocument()
    })

    it('offers the edit control to admins', async () => {
        const { container } = await mountTab({ role: 'admin' })
        expect(basicInfoCard(container).getByRole('button', { name: 'Redigera' })).toBeInTheDocument()
    })

    it('lets an admin change the APL status and persists it', async () => {
        const user = userEvent.setup()
        client.put.mockResolvedValueOnce(ok({ student: STUDENT({ aplStatus: 'GREEN' }) }))
        const { container } = await mountTab({ role: 'admin' })
        const card = basicInfoCard(container)

        await user.click(card.getByRole('button', { name: 'Redigera' }))
        await user.selectOptions(aplStatusRow(container).getByRole('combobox'), 'GREEN')
        await user.click(editActions(container).getByRole('button', { name: 'Spara ändringar' }))

        await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1))
        const [url, payload] = client.put.mock.calls[0]
        expect(url).toBe('/student-details/stu-1')
        expect(payload.aplStatus).toBe('GREEN')
    })

    it('offers every APL status in the edit dropdown', async () => {
        const user = userEvent.setup()
        const { container } = await mountTab({ role: 'admin' })
        const card = basicInfoCard(container)

        await user.click(card.getByRole('button', { name: 'Redigera' }))
        const options = aplStatusRow(container)
            .getAllByRole('option')
            .map((o) => o.value)

        expect(options).toEqual(
            expect.arrayContaining(['GRAY', 'BLUE', 'YELLOW', 'PURPLE', 'RED', 'GREEN'])
        )
    })

    it('returns to view mode after a successful save', async () => {
        const user = userEvent.setup()
        client.put.mockResolvedValueOnce(ok({ student: STUDENT() }))
        const { container } = await mountTab({ role: 'admin' })
        const card = basicInfoCard(container)

        await user.click(card.getByRole('button', { name: 'Redigera' }))
        await user.click(editActions(container).getByRole('button', { name: 'Spara ändringar' }))

        await waitFor(() =>
            expect(card.getByRole('button', { name: 'Redigera' })).toBeInTheDocument()
        )
    })

    it('keeps edit mode open and warns the user when the save fails', async () => {
        const user = userEvent.setup()
        client.put.mockRejectedValueOnce(httpError(500, 'Serverfel'))
        const { container } = await mountTab({ role: 'admin' })
        const card = basicInfoCard(container)

        await user.click(card.getByRole('button', { name: 'Redigera' }))
        await user.click(editActions(container).getByRole('button', { name: 'Spara ändringar' }))

        await waitFor(() =>
            expect(editActions(container).getByRole('button', { name: 'Avbryt' })).toBeInTheDocument()
        )
        expect(toast.error).toHaveBeenCalledWith('Kunde inte spara ändringar')
    })

    it('lets an admin cancel without saving', async () => {
        const user = userEvent.setup()
        const { container } = await mountTab({ role: 'admin' })
        const card = basicInfoCard(container)

        await user.click(card.getByRole('button', { name: 'Redigera' }))
        await user.click(editActions(container).getByRole('button', { name: 'Avbryt' }))

        await waitFor(() =>
            expect(card.getByRole('button', { name: 'Redigera' })).toBeInTheDocument()
        )
        expect(client.put).not.toHaveBeenCalled()
    })

    it('associates the APL-status label with the dropdown', async () => {
        const user = userEvent.setup()
        const { container } = await mountTab({ role: 'admin' })
        const card = basicInfoCard(container)

        await user.click(card.getByRole('button', { name: 'Redigera' }))
        expect(aplStatusRow(container).getByLabelText('APL-status:')).toBeInTheDocument()
    })

    it('re-initialises the form from prop changes', async () => {        const { rerender } = await mountTab({
            student: STUDENT({ aplStatus: 'GRAY', name: 'Anna Andersson' }),
            role: 'admin',
        })

        expect(await screen.findByText('Grå - Ny Elev')).toBeInTheDocument()

        await rerender({ student: STUDENT({ aplStatus: 'RED', name: 'Anna Andersson' }) })

        expect(await screen.findByText('Röd - Snart slut')).toBeInTheDocument()
    })
})
