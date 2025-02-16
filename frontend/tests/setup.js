import { vi } from 'vitest'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { config } from '@vue/test-utils'

global.confirm = vi.fn(() => true) // Always return "true" for confirm dialogs

// Mock `ResizeObserver` to prevent crashes
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock `window.alert` to avoid JSDOM errors
global.alert = vi.fn()

// Suppress Vuetify duplicate registration warnings
vi.spyOn(console, 'warn').mockImplementation((msg) => {
  if (msg.includes('App already provides property with key "Symbol(vuetify:')) {
    return
  }
  console.warn(msg) // Keep other warnings visible
})

// Ensure Vuetify is initialized **only once** globally
if (!global.__vuetify) {
  global.__vuetify = createVuetify({
    components,
    directives,
  })
}
config.global.plugins = [global.__vuetify]
