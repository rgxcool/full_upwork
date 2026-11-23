import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import PageHeader from '@/components/base/PageHeader.vue'
import { renderWithVuetify } from '../helpers/render.js'

/**
 * These four primitives are used across ~30 views. They are the app's shared
 * vocabulary for "nothing here yet", "something broke", and "here is a status",
 * so their accessible contract is worth locking down: a screen reader and a
 * keyboard user must be able to perceive and operate all three.
 */
describe('Feature: shared base UI components', () => {
    describe('ConfirmDialog', () => {
        it('renders nothing while closed', async () => {
            await renderWithVuetify(ConfirmDialog, {
                props: { modelValue: false, title: 'Radera eleven' },
            })
            expect(screen.queryByText('Radera eleven')).not.toBeInTheDocument()
        })

        it('shows the title, message and both actions when open', async () => {
            await renderWithVuetify(ConfirmDialog, {
                props: {
                    modelValue: true,
                    title: 'Radera eleven',
                    message: 'Detta går inte att ångra.',
                },
            })
            expect(await screen.findByText('Radera eleven')).toBeInTheDocument()
            expect(screen.getByText('Detta går inte att ångra.')).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Bekräfta' })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Avbryt' })).toBeInTheDocument()
        })

        it('emits confirm without closing itself, so the parent stays in charge', async () => {
            const onConfirm = vi.fn()
            const onUpdate = vi.fn()
            await renderWithVuetify(ConfirmDialog, {
                props: { modelValue: true, title: 'Avsluta', onConfirm, 'onUpdate:modelValue': onUpdate },
            })
            await userEvent.click(await screen.findByRole('button', { name: 'Bekräfta' }))
            expect(onConfirm).toHaveBeenCalledOnce()
            expect(onUpdate).not.toHaveBeenCalled()
        })

        it('closes on cancel', async () => {
            const onUpdate = vi.fn()
            await renderWithVuetify(ConfirmDialog, {
                props: { modelValue: true, title: 'Avsluta', 'onUpdate:modelValue': onUpdate },
            })
            await userEvent.click(await screen.findByRole('button', { name: 'Avbryt' }))
            expect(onUpdate).toHaveBeenCalledWith(false)
        })

        it('uses custom button labels', async () => {
            await renderWithVuetify(ConfirmDialog, {
                props: {
                    modelValue: true,
                    title: 'Spara',
                    confirmLabel: 'Ja, spara',
                    cancelLabel: 'Nej',
                },
            })
            expect(await screen.findByRole('button', { name: 'Ja, spara' })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Nej' })).toBeInTheDocument()
        })

        it('blocks cancel but allows confirm to be seen while loading', async () => {
            await renderWithVuetify(ConfirmDialog, {
                props: { modelValue: true, title: 'Sparar', loading: true },
            })
            expect(await screen.findByRole('button', { name: 'Avbryt' })).toBeDisabled()
        })
    })

    describe('EmptyState', () => {
        it('shows the title and description', async () => {
            await renderWithVuetify(EmptyState, {
                props: { title: 'Inga elever än', description: 'Börja med att lägga till en elev.' },
            })
            expect(await screen.findByRole('heading', { name: 'Inga elever än' })).toBeInTheDocument()
            expect(screen.getByText('Börja med att lägga till en elev.')).toBeInTheDocument()
        })

        it('omits the description element when none is given', async () => {
            await renderWithVuetify(EmptyState, { props: { title: 'Tomt' } })
            expect(await screen.findByRole('heading', { name: 'Tomt' })).toBeInTheDocument()
            expect(screen.queryByText('.empty-state__description')).not.toBeInTheDocument()
        })
    })

    describe('ErrorState', () => {
        it('announces itself as an alert so it is not missed', async () => {
            await renderWithVuetify(ErrorState, {
                props: { title: 'Kunde inte hämta data', message: 'Servern svarade 500.' },
            })
            const alert = await screen.findByRole('alert')
            expect(alert).toHaveTextContent('Kunde inte hämta data')
            expect(alert).toHaveTextContent('Servern svarade 500.')
        })

        it('falls back to a generic title', async () => {
            await renderWithVuetify(ErrorState, { props: {} })
            expect(await screen.findByText('Något gick fel')).toBeInTheDocument()
        })
    })

    describe('StatusBadge', () => {
        it('exposes the label as a status, not a heading', async () => {
            await renderWithVuetify(StatusBadge, {
                props: { label: 'Aktiv', hue: 'green' },
            })
            const status = await screen.findByRole('status')
            expect(status).toHaveTextContent('Aktiv')
            expect(status).toHaveClass('hue-green')
        })

        it('shows a lock icon when locked', async () => {
            const { container } = await renderWithVuetify(StatusBadge, {
                props: { label: 'Låst', locked: true },
            })
            expect(await screen.findByRole('status')).toHaveClass('is-locked')
            expect(container.querySelector('.status-lock')).toBeTruthy()
        })

        it('says "Ej låst" explicitly when unlocked', async () => {
            await renderWithVuetify(StatusBadge, {
                props: { label: 'Öppen', locked: false },
            })
            expect(await screen.findByText('Ej låst')).toBeInTheDocument()
        })

        it('omits lock state entirely when locked is unset', async () => {
            const { container } = await renderWithVuetify(StatusBadge, {
                props: { label: 'Neutral' },
            })
            expect(container.querySelector('.status-unlocked')).toBeNull()
            expect(container.querySelector('.status-lock')).toBeNull()
        })

        it('is not focusable or clickable when not interactive', async () => {
            await renderWithVuetify(StatusBadge, { props: { label: 'Aktiv' } })
            expect(await screen.findByRole('status')).toBeInTheDocument()
            expect(screen.queryByRole('button')).not.toBeInTheDocument()
        })

        it('becomes a labelled button that emits click when interactive', async () => {
            const onClick = vi.fn()
            await renderWithVuetify(StatusBadge, {
                props: { label: 'Grå', interactive: true, onClick },
            })
            const button = await screen.findByRole('button', { name: 'Ändra status: Grå' })
            expect(screen.queryByRole('status')).not.toBeInTheDocument()
            await userEvent.click(button)
            expect(onClick).toHaveBeenCalledOnce()
        })
    })

    describe('PageHeader', () => {
        it('renders a title, subtitle and action slot', async () => {
            const { container } = await renderWithVuetify(PageHeader, {
                props: { title: 'Elevöversikt', subtitle: 'Aktiva elever' },
                slots: { actions: '<button>Ny elev</button>' },
            })
            expect(container.querySelector('h1')).toHaveTextContent('Elevöversikt')
            expect(container.querySelector('.page-header__subtitle')).toHaveTextContent('Aktiva elever')
            expect(screen.getByRole('button', { name: 'Ny elev' })).toBeInTheDocument()
        })

        it('renders link and current crumb navigation', async () => {
            await renderWithVuetify(PageHeader, {
                props: {
                    title: 'Elevdetaljer',
                    crumbs: [
                        { label: 'Start', to: '/' },
                        { label: 'Elever' },
                    ],
                },
            })
            expect(screen.getByRole('navigation', { name: 'Brödsmulor' })).toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'Start' })).toBeInTheDocument()
        })
    })
})
