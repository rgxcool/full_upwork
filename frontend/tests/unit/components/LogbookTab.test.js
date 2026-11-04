import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import LogbookTab from '@/views/Student/tabs/LogbookTab.vue'
import { renderWithVuetify, buildStore, ok, httpError } from '../../helpers/render.js'

const { toast } = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
}))

vi.mock('@/composables/useToast.js', () => ({ useToast: () => toast }))

import client from '@/api/client.js'

const STUDENT = { _id: 'stu-1', name: 'Anna Andersson' }

// Local-midnight dates keep the expected form values stable in every timezone.
const localDate = (year, month, day) => new Date(year, month - 1, day)

const KIT = {
    id: 'kit-1',
    title: 'Introduktionskit',
    description: 'Välkommen till praktiken',
    startDate: localDate(2026, 3, 1).toISOString(),
    endDate: localDate(2026, 5, 1).toISOString(),
    status: 'pending',
}

function storeFor(role = 'teacher') {
    return buildStore({
        getters: {
            userRole: role,
            isTeacher: role === 'teacher',
            isAdmin: role === 'admin' || role === 'systemadmin',
            isSystemAdmin: role === 'systemadmin',
        },
    })
}

async function mountTab({ role = 'teacher', kits = [KIT] } = {}) {
    client.get.mockResolvedValueOnce(ok({ success: true, logbook: kits }))
    return renderWithVuetify(LogbookTab, {
        props: { student: STUDENT },
        store: storeFor(role),
    })
}

/**
 * Opens the edit dialog and scopes queries to it. The add form on the page has
 * the same field labels, so a page-wide label query is ambiguous by design.
 */
const openEdit = async (user) => {
    await user.click(
        screen.getByRole('button', { name: `Redigera ${KIT.title}` })
    )
    const dialog = await screen.findByRole('dialog')
    const dialogQueries = within(dialog)
    return {
        dialog,
        title: await dialogQueries.findByLabelText('Titel *'),
        description: dialogQueries.getByLabelText('Beskrivning'),
        startDate: dialogQueries.getByLabelText('Startdatum'),
        endDate: dialogQueries.getByLabelText('Slutdatum'),
        save: dialogQueries.getByRole('button', { name: 'Spara' }),
    }
}

describe('LogbookTab — APL kits', () => {
    beforeEach(() => vi.resetAllMocks())

    it('loads and renders the student kits', async () => {
        await mountTab()

        expect(await screen.findByText(KIT.title)).toBeInTheDocument()
        expect(screen.getByText(KIT.description)).toBeInTheDocument()
        expect(client.get).toHaveBeenCalledWith('/students/stu-1/logbook')
    })

    it('shows an error instead of an empty table when loading fails', async () => {
        client.get.mockReset()
        client.get.mockRejectedValueOnce(httpError(403, 'Forbidden'))

        await mountTab()

        expect(
            await screen.findByText('Kunde inte hämta loggboken.')
        ).toBeInTheDocument()
    })

    it('opens the edit dialog with the kit values', async () => {
        const user = userEvent.setup()
        await mountTab()
        await screen.findByText(KIT.title)

        const edit = await openEdit(user)

        expect(edit.title).toHaveValue(KIT.title)
        expect(edit.description).toHaveValue(KIT.description)
        expect(edit.startDate).toHaveValue('2026-03-01')
        expect(edit.endDate).toHaveValue('2026-05-01')
    })

    it('saves an edited kit through the kit id and refreshes the row', async () => {
        const user = userEvent.setup()
        await mountTab()
        await screen.findByText(KIT.title)

        const edit = await openEdit(user)
        await user.clear(edit.title)
        await user.type(edit.title, 'Uppdaterat kit')

        client.patch.mockResolvedValueOnce(
            ok({ success: true, logbook: [{ ...KIT, title: 'Uppdaterat kit' }] })
        )
        await user.click(edit.save)

        await waitFor(() => expect(client.patch).toHaveBeenCalledTimes(1))
        expect(client.patch).toHaveBeenCalledWith('/students/stu-1/logbook/kit-1', {
            title: 'Uppdaterat kit',
            description: KIT.description,
            startDate: '2026-03-01',
            endDate: '2026-05-01',
        })
        expect(await screen.findByText('Uppdaterat kit')).toBeInTheDocument()
        expect(toast.success).toHaveBeenCalledWith('Kit uppdaterades.')
    })

    it('clears dates when the user empties them', async () => {
        const user = userEvent.setup()
        await mountTab()
        await screen.findByText(KIT.title)

        const edit = await openEdit(user)
        await user.clear(edit.startDate)
        await user.clear(edit.endDate)

        client.patch.mockResolvedValueOnce(
            ok({
                success: true,
                logbook: [{ ...KIT, startDate: null, endDate: null }],
            })
        )
        await user.click(edit.save)

        await waitFor(() =>
            expect(client.patch).toHaveBeenCalledWith(
                '/students/stu-1/logbook/kit-1',
                expect.objectContaining({ startDate: null, endDate: null })
            )
        )
    })

    it('shows the API error when an edit is rejected', async () => {
        const user = userEvent.setup()
        await mountTab()
        await screen.findByText(KIT.title)

        const edit = await openEdit(user)
        client.patch.mockRejectedValueOnce(httpError(400, 'Titel krävs.'))
        await user.click(edit.save)

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Titel krävs.')
        )
    })

    it('closes the edit dialog without saving when Avbryt is clicked', async () => {
        const user = userEvent.setup()
        await mountTab()
        await screen.findByText(KIT.title)

        const edit = await openEdit(user)
        await user.click(within(edit.dialog).getByRole('button', { name: 'Avbryt' }))

        // Vuetify keeps the closed overlay in the DOM but hides its content, so
        // assert the dialog's buttons are no longer reachable instead.
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Spara' })
            ).not.toBeInTheDocument()
        )
        expect(client.patch).not.toHaveBeenCalled()
        expect(screen.getByText(KIT.title)).toBeInTheDocument()
    })

    it('closes the delete dialog without deleting when Avbryt is clicked', async () => {
        const user = userEvent.setup()
        await mountTab()
        await screen.findByText(KIT.title)

        await user.click(
            screen.getByRole('button', { name: `Ta bort ${KIT.title}` })
        )
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Avbryt' }))

        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Ta bort' })
            ).not.toBeInTheDocument()
        )
        expect(client.delete).not.toHaveBeenCalled()
        expect(screen.getByText(KIT.title)).toBeInTheDocument()
    })

    it('deletes a kit after confirmation', async () => {
        const user = userEvent.setup()
        await mountTab()
        await screen.findByText(KIT.title)

        await user.click(
            screen.getByRole('button', { name: `Ta bort ${KIT.title}` })
        )
        expect(await screen.findByText('Ta bort kit?')).toBeInTheDocument()

        client.delete.mockResolvedValueOnce(ok({ success: true, logbook: [] }))
        await user.click(screen.getByRole('button', { name: 'Ta bort' }))

        await waitFor(() =>
            expect(client.delete).toHaveBeenCalledWith(
                '/students/stu-1/logbook/kit-1'
            )
        )
        expect(await screen.findByText('Inga kits i loggboken ännu.')).toBeInTheDocument()
        expect(toast.success).toHaveBeenCalledWith('Kit togs bort.')
    })

    it('adds a new kit and renders it', async () => {
        const user = userEvent.setup()
        await mountTab({ kits: [] })
        await screen.findByText('Inga kits i loggboken ännu.')

        await user.type(screen.getByLabelText('Titel *'), 'Nytt kit')
        await user.type(screen.getByLabelText('Beskrivning'), 'Ny beskrivning')

        client.post.mockResolvedValueOnce(
            ok({
                success: true,
                logbook: [{ ...KIT, title: 'Nytt kit', description: 'Ny beskrivning' }],
            })
        )
        await user.click(screen.getByRole('button', { name: 'Lägg till kit' }))

        await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1))
        expect(client.post).toHaveBeenCalledWith(
            '/students/stu-1/logbook',
            expect.objectContaining({ title: 'Nytt kit', description: 'Ny beskrivning' })
        )
        expect(await screen.findByText('Nytt kit')).toBeInTheDocument()
        expect(toast.success).toHaveBeenCalledWith('Kit lades till i loggboken.')
    })

    it('requires a title before adding a kit', async () => {
        const user = userEvent.setup()
        await mountTab({ kits: [] })
        await screen.findByText('Inga kits i loggboken ännu.')

        await user.click(screen.getByRole('button', { name: 'Lägg till kit' }))

        expect(await screen.findByText('Titel är obligatorisk.')).toBeInTheDocument()
        expect(client.post).not.toHaveBeenCalled()
    })

    it('shows the API error when adding a kit fails', async () => {
        const user = userEvent.setup()
        await mountTab({ kits: [] })
        await screen.findByText('Inga kits i loggboken ännu.')

        await user.type(screen.getByLabelText('Titel *'), 'Nytt kit')
        client.post.mockRejectedValueOnce(httpError(400, 'Ogiltigt startdatum.'))
        await user.click(screen.getByRole('button', { name: 'Lägg till kit' }))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('Ogiltigt startdatum.')
        )
    })

    it('hides kit management controls from roles without logbook access', async () => {
        await mountTab({ role: 'syv' })
        await screen.findByText(KIT.title)

        expect(
            screen.queryByRole('button', { name: `Redigera ${KIT.title}` })
        ).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: `Ta bort ${KIT.title}` })
        ).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Lägg till kit' })
        ).not.toBeInTheDocument()
    })
})
