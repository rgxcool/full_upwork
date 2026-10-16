import { render } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createStore } from 'vuex'
import { vi } from 'vitest'

/**
 * Shared Testing Library harness.
 *
 * Testing Library (unlike @vue/test-utils) is user-observable by design: tests
 * query the rendered DOM the way a person would (role/label/text), so they fail
 * when the UI breaks rather than when an internal ref changes.
 *
 * Every feature suite mounts through `renderWithVuetify` so the app's real
 * plugins (Vuetify from tests/setup.js, a Vuex store, a memory router) are wired
 * exactly as in production.
 */

const DEFAULT_GETTERS = {
    isAdmin: false,
    isTeacher: false,
    isCoordinator: false,
    isSyv: false,
    isSpecped: false,
    isStudent: false,
    userRole: 'teacher',
    user: { _id: 'u1', name: 'Test User', email: 'test@example.se' },
}

/**
 * Builds a Vuex store with sane defaults that a suite can override.
 * Getters may be passed as plain values — Vuex 4 wants functions, so they are
 * wrapped here to keep the call sites readable.
 */
export function buildStore({ getters = {}, state = {}, actions = {}, mutations = {} } = {}) {
    const merged = { ...DEFAULT_GETTERS, ...getters }
    return createStore({
        state: {
            user: { _id: 'u1', name: 'Test User', email: 'test@example.se' },
            role: 'teacher',
            ...state,
        },
        getters: Object.fromEntries(
            Object.entries(merged).map(([key, value]) => [
                key,
                typeof value === 'function' ? value : () => value,
            ])
        ),
        mutations: {
            SET_USER: (s, u) => { s.user = u },
            SET_ROLE: (s, r) => { s.role = r },
            ...mutations,
        },
        actions,
    })
}

/** Minimal catch-all router so `router-link` / `router.push` never blow up. */
export function buildRouter(routes = []) {
    return createRouter({
        history: createMemoryHistory(),
        routes: routes.length
            ? routes
            : [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
}

/**
 * Render a component with Vuetify + Vuex + a memory router.
 * @returns the Testing Library result plus `{ router, store }` for assertions.
 */
export async function renderWithVuetify(Component, {
    props = {},
    store = buildStore(),
    router = buildRouter(),
    routes,
    global = {},
    ...options
} = {}) {
    const r = routes ? buildRouter(routes) : router

    // Merge rather than replace, so a suite can add plugins (toast spies,
    // stubs) without silently dropping the store and router.
    const { plugins: extraPlugins = [], ...restGlobal } = global

    const result = render(Component, {
        props,
        global: {
            ...restGlobal,
            plugins: [r, store, ...extraPlugins],
        },
        ...options,
    })

    await r.isReady()
    return { ...result, router: r, store }
}

/** Renders a component that only needs the global store, with no router. */
export async function renderWithStore(Component, {
    props = {},
    getters = {},
    state = {},
    global = {},
} = {}) {
    return renderWithVuetify(Component, {
        props,
        store: buildStore({ getters, state }),
        global,
    })
}

/** A resolved value, for mocking an API client method. */
export const ok = (data) => ({ data, status: 200 })

/** A rejected response, for mocking a role-gated or failing API call. */
export const httpError = (status, message = 'Forbidden') =>
    Object.assign(new Error(message), { response: { status, data: { message } } })

/**
 * Vuetify plugin that captures snackbar/toast calls, so assertions stay on the
 * real UI instead of transient notifications. Returns `{ plugin, toast }`.
 */
export function mockToast() {
    const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
    const plugin = { install: (app) => app.provide('toast', toast) }
    return { plugin, toast }
}
