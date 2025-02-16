import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()], // ✅ Ensures Vue is correctly processed
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // ✅ Ensures alias resolution
    },
  },
  test: {
    environment: 'jsdom', // ✅ Use JSDOM for Vue component testing
    globals: true,
    setupFiles: './tests/setup.js', // ✅ Ensure test setup is correct
    transformMode: {
      web: [/\.vue$/], // ✅ Ensure Vite processes Vue files
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5001',
    },
  },
})
