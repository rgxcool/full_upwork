import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import APLView from '@/views/APLView.vue'
import { renderWithVuetify, ok, httpError } from '../helpers/render.js'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

import client from '@/api/client.js'

const STUDENT = (overrides = {}) => ({
    _id: '1',
    name: 'Anna Andersson',
    email: 'anna@example.se',
    aplStatus: 'YELLOW',
    dropout: false,
    education: [{ type: 'CoursePackage', name: 'Handledarprogrammet' }],
    ...overrides,
})

const STUDENTS = [
    STUDENT(),
    STUDENT({ _id: '2', name: 'Bengt Johansson', aplStatus: 'GRAY' }),
]

describe('Feature: APL view (APL-status board)', () => {
    beforeEach(() => vi.resetAllMocks())

    it('requests the student list on mount', async () => {
        client.get.mockResolvedValueOnce(ok(STUDENTS))
        await renderWithVuetify(APLView)

        expect(client.get).toHaveBeenCalledWith('/students')
    })

    it('renders the APL view heading and the two status tabs', async () => {
        client.get.mockResolvedValueOnce(ok(STUDENTS))
        await renderWithVuetify(APLView)

        expect(screen.getByText('APL-status')).toBeInTheDocument()
        expect(screen.getByText('Pågående')).toBeInTheDocument()
        expect(screen.getByText('Avslutad')).toBeInTheDocument()
        expect(screen.queryByText('APL-kontrakt')).not.toBeInTheDocument()
    })

    it('renders every APL status column with its student count', async () => {
        client.get.mockResolvedValueOnce(ok(STUDENTS))
        await renderWithVuetify(APLView)

        expect(await screen.findByText('Anna Andersson')).toBeInTheDocument()
        expect(screen.getByText('Bengt Johansson')).toBeInTheDocument()

        // Column headers carry the per-status count: "<label> (<n>)".
        expect(screen.getByRole('heading', { name: 'APL på gång (1)' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Ny elev (1)' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Klar praktik (0)' })).toBeInTheDocument()
    })

    it('shows a loading message while the student list is in flight', async () => {
        let release
        client.get.mockReturnValueOnce(
            new Promise((resolve) => { release = () => resolve(ok(STUDENTS)) })
        )

        await renderWithVuetify(APLView)
        expect(screen.getByText('Laddar pågående APL...')).toBeInTheDocument()

        release()
        await waitFor(() =>
            expect(screen.queryByText('Laddar pågående APL...')).not.toBeInTheDocument()
        )
    })

    it('shows a user-facing error when the request fails', async () => {
        client.get.mockRejectedValueOnce(httpError(500, 'Serverfel'))
        await renderWithVuetify(APLView)

        expect(
            await screen.findByText('Kunde inte hämta APL-elever.')
        ).toBeInTheDocument()
    })

    it('stops claiming to be loading once a request has failed', async () => {
        client.get.mockRejectedValueOnce(httpError(500, 'Serverfel'))
        await renderWithVuetify(APLView)

        await screen.findByText('Kunde inte hämta APL-elever.')
        expect(screen.queryByText('Laddar pågående APL...')).not.toBeInTheDocument()
        expect(screen.getByText('Kunde inte visa pågående APL.')).toBeInTheDocument()
    })

    it('distinguishes an empty result from a failure', async () => {
        client.get.mockResolvedValueOnce(ok([]))
        await renderWithVuetify(APLView)

        expect(await screen.findByText('Inga pågående APL-elever.')).toBeInTheDocument()
        expect(
            screen.queryByText('Kunde inte hämta APL-elever.')
        ).not.toBeInTheDocument()
    })

    it('offers a working retry control after a failed request', async () => {
        const user = userEvent.setup()
        client.get.mockRejectedValueOnce(httpError(500, 'Serverfel'))
        await renderWithVuetify(APLView)

        await screen.findByText('Kunde inte hämta APL-elever.')
        expect(client.get).toHaveBeenCalledTimes(1)

        client.get.mockResolvedValueOnce(ok(STUDENTS))
        await user.click(screen.getByRole('button', { name: 'Försök igen' }))

        expect(await screen.findByText('Anna Andersson')).toBeInTheDocument()
        expect(
            screen.queryByText('Kunde inte hämta APL-elever.')
        ).not.toBeInTheDocument()
    })

    it('treats a non-array response as an empty list rather than crashing', async () => {
        client.get.mockResolvedValueOnce(ok({ unexpected: 'shape' }))

        const { container } = await renderWithVuetify(APLView)

        await waitFor(() =>
            expect(
                screen.queryByText('Kunde inte hämta APL-elever.')
            ).not.toBeInTheDocument()
        )
        expect(container).toBeTruthy()
    })
})
