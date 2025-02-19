import { defineConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default defineConfig({
  ...viteConfig,
  test: {
    ...viteConfig.test,
    environment: 'jsdom',
    server: {
      deps: {
        inline: ['vuetify'], // Use server.deps.inline to avoid deprecation warning
      },
    },
    alias: {
      '^.+\\.css$': './tests/__mocks__/styleMock.js', // Redirect CSS imports to a mock file
    },
  },
})
