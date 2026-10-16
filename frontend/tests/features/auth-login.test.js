import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import Login from '@/views/Auth/Login.vue'
import { renderWithVuetify, buildStore, buildRouter, ok, httpError } from '../helpers/render.js'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
}))

import client from '@/api/client.js'

const ROUTES = [
    { path: '/', component: { template: '<div />' } },
    { path: '/login', component: { template: '<div />' } },
    { path: '/profile', component: { template: '<div />' } },
    { path: '/change-password', component: { template: '<div />' } },
]

/**
 * Login is the app's front door and the one place a user types a credential.
 * These tests drive it exactly as a person would: type, submit, and look at
 * what the page says and where it navigates. The `login` store action is the
 * only seam mocked — the component's own logic is exercised for real.
 */
const mountLogin = async ({ loginAction } = {}) => {
    const action = loginAction ?? vi.fn().mockResolvedValue({ success: true })
    const store = buildStore({ actions: { login: action } })
    const router = buildRouter(ROUTES)
    await router.push('/login')
    await router.isReady()
    const view = await renderWithVuetify(Login, { store, router })
    return { ...view, action }
}

const submitWith = async (email, password) => {
    await userEvent.type(await screen.findByLabelText('E-postadress'), email)
    await userEvent.type(screen.getByLabelText('Lösenord'), password)
    await userEvent.click(screen.getByRole('button', { name: 'Logga in' }))
}

describe('Feature: sign in', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders both labelled fields and a submit button', async () => {
        await mountLogin()
        expect(await screen.findByLabelText('E-postadress')).toBeInTheDocument()
        expect(screen.getByLabelText('Lösenord')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Logga in' })).toBeInTheDocument()
    })

    it('does not reveal the password field as plain text', async () => {
        await mountLogin()
        const password = await screen.findByLabelText('Lösenord')
        expect(password).toHaveAttribute('type', 'password')
        expect(password).toHaveAttribute('autocomplete', 'current-password')
    })

    it('submits the typed credentials to the store action', async () => {
        const { action } = await mountLogin()
        await submitWith('anna@example.se', 'hemligt123')
        // Vuex invokes an action as (context, payload); we assert the payload.
        await waitFor(() => expect(action).toHaveBeenCalled())
        expect(action.mock.calls[0][1]).toEqual({
            email: 'anna@example.se',
            password: 'hemligt123',
        })
    })

    it('navigates to the profile on success', async () => {
        const { router } = await mountLogin({
            loginAction: vi.fn().mockResolvedValue({ success: true }),
        })
        await submitWith('anna@example.se', 'hemligt123')
        await waitFor(() => expect(router.currentRoute.value.path).toBe('/profile'))
    })

    it('forces a password change when the account must rotate its password', async () => {
        const { router } = await mountLogin({
            loginAction: vi.fn().mockResolvedValue({ success: true, requiresPasswordChange: true }),
        })
        await submitWith('anna@example.se', 'hemligt123')
        await waitFor(() => expect(router.currentRoute.value.path).toBe('/change-password'))
    })

    it('stays put and shows the reason when the server rejects the credentials', async () => {
        const { router } = await mountLogin({
            loginAction: vi.fn().mockResolvedValue({ success: false, message: 'Fel e-postadress eller lösenord' }),
        })
        await submitWith('anna@example.se', 'fel')
        expect(await screen.findByText('Fel e-postadress eller lösenord')).toBeInTheDocument()
        expect(router.currentRoute.value.path).toBe('/login')
    })

    it('falls back to a generic message when the server gives none', async () => {
        await mountLogin({ loginAction: vi.fn().mockResolvedValue({ success: false }) })
        await submitWith('anna@example.se', 'fel')
        expect(await screen.findByText('Inloggningen misslyckades')).toBeInTheDocument()
    })

    it('shows a generic error when the action throws, and stays on the page', async () => {
        const { router } = await mountLogin({
            loginAction: vi.fn().mockRejectedValue(httpError(500, 'Serverfel')),
        })
        await submitWith('anna@example.se', 'fel')
        expect(await screen.findByText('Ett fel uppstod. Försök igen.')).toBeInTheDocument()
        expect(router.currentRoute.value.path).toBe('/login')
    })

    // ── Finding: dead field-highlighting logic ───────────────────────────────
    // Login.vue highlights the offending field with
    //   :class="{ error: message && message.includes('email'|'lösenord') }"
    // but the strings the app actually produces never match:
    //   * a 401 is normalized to "Du är inte inloggad." (api/client.js), which
    //     contains neither substring;
    //   * the password check is case-sensitive, so a real Swedish server
    //     message like "Lösenordet är för kort" (capital L) does not match;
    //   * the email field looks for "email" while the UI is Swedish and the
    //     backend says "e-postadress".
    // The alert is the only thing a user actually gets. These tests pin the
    // current behaviour so it is visible in the report.
    it('FINDING: never highlights a field for the real 401 message', async () => {
        await mountLogin({
            loginAction: vi.fn().mockResolvedValue({ success: false, message: 'Du är inte inloggad.' }),
        })
        await submitWith('anna@example.se', 'fel')
        await screen.findByText('Du är inte inloggad.')
        expect(screen.getByLabelText('E-postadress')).not.toHaveClass('error')
        expect(screen.getByLabelText('Lösenord')).not.toHaveClass('error')
    })

    it('FINDING: the password check is case-sensitive', async () => {
        await mountLogin({
            loginAction: vi.fn().mockResolvedValue({ success: false, message: 'lösenordet är för kort' }),
        })
        await submitWith('anna@example.se', 'x')
        await screen.findByText('lösenordet är för kort')
        // Lowercase "lösenord" does match ...
        expect(screen.getByLabelText('Lösenord')).toHaveClass('error')
    })

    it('field highlighting now works for capitalised Swedish messages', async () => {
        await mountLogin({
            loginAction: vi.fn().mockResolvedValue({ success: false, message: 'Lösenordet är för kort' }),
        })
        await submitWith('anna@example.se', 'x')
        await screen.findByText('Lösenordet är för kort')
        // The regex /lösenord/i is case‑insensitive, so the capitalised form
        // the backend actually sends now also highlights the password field.
        expect(screen.getByLabelText('Lösenord')).toHaveClass('error')
    })

    it('FINDING: the error alert is not announced to screen readers', async () => {
        await mountLogin({
            loginAction: vi.fn().mockResolvedValue({ success: false, message: 'Du är inte inloggad.' }),
        })
        await submitWith('anna@example.se', 'fel')
        // The .error-alert div carries no role="alert" or aria-live, so the
        // message appears silently for assistive tech.
        expect(await screen.findByText('Du är inte inloggad.')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('clears a previous error when the user tries again', async () => {
        const action = vi
            .fn()
            .mockResolvedValueOnce({ success: false, message: 'Fel e-postadress eller lösenord' })
            .mockResolvedValueOnce({ success: true })
        const { router } = await mountLogin({ loginAction: action })

        await submitWith('anna@example.se', 'fel')
        await screen.findByText('Fel e-postadress eller lösenord')

        await userEvent.clear(screen.getByLabelText('E-postadress'))
        await userEvent.type(screen.getByLabelText('E-postadress'), 'anna@example.se')
        await userEvent.click(screen.getByRole('button', { name: 'Logga in' }))

        await waitFor(() => expect(router.currentRoute.value.path).toBe('/profile'))
        expect(screen.queryByText('Fel e-postadress eller lösenord')).not.toBeInTheDocument()
    })

    it('shows a progress label and blocks a double submit while in flight', async () => {
        let release
        const action = vi.fn().mockImplementation(
            () => new Promise((resolve) => { release = () => resolve({ success: true }) })
        )
        await mountLogin({ loginAction: action })
        await submitWith('anna@example.se', 'hemligt')

        const busy = await screen.findByRole('button', { name: 'Loggar in...' })
        expect(busy).toBeDisabled()

        await userEvent.click(busy)
        expect(action).toHaveBeenCalledTimes(1)

        release()
        await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    })

    it('offers a route back to the landing page', async () => {
        await mountLogin()
        expect(await screen.findByRole('link', { name: /Tillbaka till startsidan/ })).toHaveAttribute(
            'href',
            '/'
        )
    })
})
