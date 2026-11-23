import { createApp } from 'vue'
import App from './App.vue'

import client from '@/api/client.js'
import router from './router/router.js'
import store from './store/store.js'

import '@mdi/font/css/materialdesignicons.css'
import './assets/styles/tokens.css'
import './assets/main.css'

import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import './assets/styles/global.css'
import './assets/styles/bootstrap-bridge.css'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

document.documentElement.lang = 'sv'

if (import.meta.env.DEV) {
  const baseURL = client.defaults.baseURL
  const proxyTarget = typeof __DEV_API_PROXY_TARGET__ !== 'undefined' ? __DEV_API_PROXY_TARGET__ : ''
  const target = baseURL && !baseURL.startsWith('http')
    ? `${window.location.origin}${baseURL} (Vite proxy → ${proxyTarget})`
    : baseURL
  console.info(`[API] Connecting to: ${target}`)
}

// Vuetify theme maps to the design tokens in assets/styles/tokens.css.
// Named status colors (red/green/yellow/blue/purple/grey/gray/orange) are
// registered so existing `color="…"` usage resolves to the shared status
// hue families instead of the Material defaults.
const theme = {
  defaultTheme: 'light',
  themes: {
    light: {
      dark: false,
      colors: {
        primary: '#0284C7',   // himmel
        secondary: '#0369A1', // djup himmel
        info: '#0284C7',      // himmel
        success: '#2E7D57',   // gran
        warning: '#B77A0A',   // bärnsten
        error: '#B3261E',     // signalröd
        background: '#F6F7F8',
        surface: '#FFFFFF',
        red: '#B3261E',
        green: '#2E7D57',
        yellow: '#B77A0A',
        blue: '#0284C7',
        purple: '#6D4FA8',
        orange: '#B77A0A',
        grey: '#6B7480',
        gray: '#6B7480',
        'on-primary': '#FFFFFF',
        'on-secondary': '#FFFFFF',
        'on-info': '#FFFFFF',
        'on-success': '#FFFFFF',
        'on-warning': '#FFFFFF',
        'on-error': '#FFFFFF',
        'on-surface': '#22272E',
        'on-background': '#22272E',
      },
    },
  },
}

const vuetify = createVuetify({
  components,
  directives,
  theme,
  icons: {
    defaultSet: 'mdi',
  },
})

/**
 * Sentry for local development (org mindful-9h, EU region, project mindful-frontend).
 * No request bodies, cookies, query strings, IPs or replays; every event passes
 * through utils/sentryScrub.js. Never loaded in production builds.
 */
async function initDevSentry(app) {
  try {
    const [Sentry, { scrubEvent, scrubBreadcrumb }] = await Promise.all([
      import('@sentry/vue'),
      import('@/utils/sentryScrub.js'),
    ])
    Sentry.init({
      app,
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: 'development',
      sendDefaultPii: false,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
      integrations: [Sentry.browserTracingIntegration({ router })],
      tracesSampleRate: 1.0,
      tracePropagationTargets: [/^\/api\//],
      beforeSend: (event) => scrubEvent(event),
      beforeSendTransaction: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    })
    router.afterEach(() => {
      const user = store.state.user
      Sentry.setUser(
        user
          ? { id: String(user._id ?? user.id ?? user.userId ?? ''), segment: store.getters.userRole || '' }
          : null
      )
    })
    console.info('[sentry] development error monitoring enabled (mindful-frontend)')
  } catch (e) {
    console.warn('[sentry] not started:', e?.message)
  }
}

async function bootstrap() {
  const user = store.state.user
  if (user && user.token) {
    client.defaults.headers.common['Authorization'] = `Bearer ${user.token}`
  }

  try {
    await store.dispatch('fetchUser')
  } catch (e) {
    console.error('Error during fetchUser:', e)
  }

  const app = createApp(App)

  app.config.errorHandler = (err, instance, info) => {
    console.error('Unhandled Vue error:', { err, info })
  }

  // DEVELOPMENT ONLY. `import.meta.env.DEV` is false in `vite build`, so this
  // branch — and the @sentry/vue import — is removed from the production bundle.
  // Must run after the errorHandler above so Sentry wraps it.
  if (import.meta.env.DEV && import.meta.env.VITE_SENTRY_DSN) {
    await initDevSentry(app)
  }

  app.use(router)
  app.use(store)
  app.use(vuetify)
  app.mount('#app')
}

bootstrap()
