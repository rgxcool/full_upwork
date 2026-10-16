import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import APLBoard from '@/components/APLBoard.vue'
import { renderWithVuetify, ok, httpError } from '../helpers/render.js'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

import client from '@/api/client.js'

const CP = { type: 'CoursePackage', name: 'Handledarprogrammet' }

const STUDENT = (overrides = {}) => ({
    _id: '1',
    name: 'Anna Andersson',
    email: 'anna@example.se',
    aplStatus: 'YELLOW',
    dropout: false,
    education: [CP],
    commentHistory: [],
    ...overrides,
})

const ALL_STATUSES = ['GRAY', 'BLUE', 'YELLOW', 'PURPLE', 'RED', 'GREEN']

async function mountBoard(students) {
    // The board fetches file counts on mount (skipped for an empty list).
    client.get.mockResolvedValue(ok({}))
    const result = await renderWithVuetify(APLBoard, { props: { students } })
    await waitFor(() => expect(result.container.querySelector('.apl-board')).toBeTruthy())
    return result
}

describe('Feature: APL board (status columns, filters, drag-and-drop)', () => {
    beforeEach(() => vi.resetAllMocks())

    it('renders all six APL status columns in order', async () => {
        await mountBoard([])

        const headings = screen.getAllByRole('heading', { level: 3 })
            .map((h) => h.textContent.trim())
            .filter((t) => ALL_STATUSES.some((s) => labelFor(s) && t.startsWith(labelFor(s))))

        for (const key of ALL_STATUSES) {
            expect(headings.some((h) => h.startsWith(labelFor(key)))).toBe(true)
        }
    })

    it('places each student in the column matching their aplStatus', async () => {
        await mountBoard([
            STUDENT(),
            STUDENT({ _id: '2', name: 'Bengt Johansson', aplStatus: 'GRAY' }),
        ])

        expect(await screen.findByText('Anna Andersson')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'APL på gång (1)' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Ny elev (1)' })).toBeInTheDocument()
    })

    it('links each student card to their student detail page', async () => {
        await mountBoard([STUDENT({ _id: '42' })])

        const link = await screen.findByRole('link', { name: 'Anna Andersson' })
        expect(link).toHaveAttribute('href', '/student/42')
    })

    it('excludes students who have dropped out', async () => {
        await mountBoard([
            STUDENT(),
            STUDENT({ _id: '2', name: 'Chasse Cecilia', dropout: true }),
        ])

        expect(await screen.findByText('Anna Andersson')).toBeInTheDocument()
        expect(screen.queryByText('Chasse Cecilia')).not.toBeInTheDocument()
    })

    it('excludes students without a CoursePackage education entry', async () => {
        await mountBoard([
            STUDENT(),
            STUDENT({ _id: '2', name: 'Doris Dorisson', education: [{ type: 'Kurspaket' }] }),
        ])

        expect(await screen.findByText('Anna Andersson')).toBeInTheDocument()
        expect(screen.queryByText('Doris Dorisson')).not.toBeInTheDocument()
    })

    it('filters students by name as the user types', async () => {
        const user = userEvent.setup()
        await mountBoard([
            STUDENT(),
            STUDENT({ _id: '2', name: 'Bengt Johansson', aplStatus: 'GRAY' }),
        ])

        await screen.findByText('Anna Andersson')
        await user.type(screen.getByLabelText('Filtrera elever:'), 'bengt')

        await waitFor(() => expect(screen.queryByText('Anna Andersson')).not.toBeInTheDocument())
        expect(screen.getByText('Bengt Johansson')).toBeInTheDocument()
    })

    it('matches the student filter case-insensitively', async () => {
        const user = userEvent.setup()
        await mountBoard([
            STUDENT(),
            STUDENT({
                _id: '2',
                name: 'Bengt Johansson',
                email: 'bengt@example.se',
                aplStatus: 'GRAY',
            }),
        ])

        await screen.findByText('Anna Andersson')
        await user.type(screen.getByLabelText('Filtrera elever:'), 'ANNA')

        await waitFor(() =>
            expect(screen.queryByText('Bengt Johansson')).not.toBeInTheDocument()
        )
        expect(screen.getByText('Anna Andersson')).toBeInTheDocument()
    })

    it('filters students by email', async () => {
        const user = userEvent.setup()
        await mountBoard([
            STUDENT(),
            STUDENT({ _id: '2', name: 'Bengt Johansson', email: 'bengt@example.se', aplStatus: 'GRAY' }),
        ])

        await screen.findByText('Anna Andersson')
        await user.type(screen.getByLabelText('Filtrera elever:'), 'bengt@example.se')

        await waitFor(() => expect(screen.queryByText('Anna Andersson')).not.toBeInTheDocument())
        expect(screen.getByText('Bengt Johansson')).toBeInTheDocument()
    })

    it('narrows the board to a single status via the colour filter', async () => {
        const user = userEvent.setup()
        await mountBoard([
            STUDENT(),
            STUDENT({ _id: '2', name: 'Bengt Johansson', aplStatus: 'GRAY' }),
        ])

        await screen.findByText('Anna Andersson')
        await user.selectOptions(screen.getByLabelText('Filtrera efter färg:'), 'GRAY')

        await waitFor(() => expect(screen.queryByText('Anna Andersson')).not.toBeInTheDocument())
        expect(screen.getByText('Bengt Johansson')).toBeInTheDocument()
    })

    it('shows a total count that follows the student filter', async () => {
        const user = userEvent.setup()
        await mountBoard([
            STUDENT(),
            STUDENT({ _id: '2', name: 'Bengt Johansson', aplStatus: 'GRAY' }),
        ])

        await screen.findByText('Anna Andersson')
        expect(screen.getByText('Totalt antal studenter:').closest('td').textContent).toContain('2')

        await user.type(screen.getByLabelText('Filtrera elever:'), 'bengt')
        await waitFor(() =>
            expect(screen.getByText('Totalt antal studenter:').closest('td').textContent).toContain('1')
        )
    })

    it('shows an empty board without crashing when there are no students', async () => {
        await mountBoard([])

        expect(screen.getByText('Totalt antal studenter:').closest('td').textContent).toContain('0')
        expect(screen.queryByText('Laddar pågående APL...')).not.toBeInTheDocument()
    })

    it('persists a status change made by dragging a card onto another column', async () => {
        client.patch.mockResolvedValueOnce(ok({}))
        const { container } = await mountBoard([STUDENT()])
        await screen.findByText('Anna Andersson')

        const card = screen.getByText('Anna Andersson').closest('.student-card')
        const target = container.querySelector('.column.red')

        // jsdom has no DataTransfer, and handleDragStart ignores it anyway.
        card.dispatchEvent(new Event('dragstart', { bubbles: true }))
        target.dispatchEvent(new Event('dragover', { bubbles: true }))
        target.dispatchEvent(new Event('drop', { bubbles: true }))

        await waitFor(() =>
            expect(client.patch).toHaveBeenCalledWith('/students/1', { aplStatus: 'RED' })
        )
    })
})

function labelFor(key) {
    return {
        GRAY: 'Ny elev',
        BLUE: 'Kontaktad',
        YELLOW: 'APL på gång',
        PURPLE: 'Behöver uppföljning',
        RED: 'Snart slut',
        GREEN: 'Klar praktik',
    }[key]
}
