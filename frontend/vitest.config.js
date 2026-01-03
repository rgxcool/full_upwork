import vue from '@vitejs/plugin-vue'
import crypto from 'node:crypto'
import path from 'path'
import { defineConfig } from 'vite'
import removeMissingSourceMapPlugin from './removeMissingSourceMapPlugin.js'

if (typeof crypto.getRandomValues !== 'function') {
    crypto.getRandomValues = (array) => crypto.randomFillSync(array)
}
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = crypto
}

export default defineConfig({
    plugins: [
        removeMissingSourceMapPlugin(),
        vue({
            template: {
                transformAssetUrls: {
                    // for Vuetify image support
                    img: ['src'],
                    image: ['xlink:href', 'href'],
                },
            },
        }),
    ],
    ssr: {
        noExternal: ['vuetify'],
    },

    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        sourcemapIgnoreList: (path) => path.includes('node_modules'),
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        transformMode: {
            web: [/\.vue$/],
        },
        maxWorkers: 12,
        silent: true
    },
    server: {
        sourcemapIgnoreList: (relativePath) => relativePath.includes('node_modules'),
        proxy: {
            '/api': {
                target: 'http://localhost:5001',
                changeOrigin: true,
                secure: false,
            },
        },
    },
})
