import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LearningManagement from '@/views/Admin/LearningManagement.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

import client from '@/api/client.js'

let vuetify

const instance = { _id: 'inst-1', courseName: 'Svenska 1', courseCode: 'SVEENG01' }
const reportData = {
    totalEnrollments: 3,
    totalCompletedStudents: 1,
    totalCompletedModules: 4,
    overallCompletionRate: 33,
}

const mountView = async () => {
    const wrapper = mount(LearningManagement, { global: { plugins: [vuetify] } })
    await flushPromises()
    return wrapper
}

describe('LearningManagement.vue', () => {
    beforeEach(async () => {
        const { createVuetify } = await import('vuetify')
        const components = await import('vuetify/components')
        const directives = await import('vuetify/directives')
        vuetify = createVuetify({ components, directives })

        vi.clearAllMocks()
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url.endsWith('/submissions')) return Promise.resolve({ data: [] })
            if (url.endsWith('/participants')) return Promise.resolve({ data: [] })
            if (url.endsWith('/reports')) return Promise.resolve({ data: reportData })
            return Promise.resolve({ data: {} })
        })
    })

    it('disables the selector while instances are loading', async () => {
        let resolveInstances
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') {
                return new Promise((resolve) => { resolveInstances = resolve })
            }
            return Promise.resolve({ data: [] })
        })
        const wrapper = mount(LearningManagement, { global: { plugins: [vuetify] } })
        await flushPromises()
        expect(wrapper.vm.instancesLoading).toBe(true)
        expect(wrapper.find('input').attributes('disabled')).toBeDefined()

        resolveInstances({ data: [instance] })
        await flushPromises()
        expect(wrapper.vm.instancesLoading).toBe(false)
        wrapper.unmount()
    })

    it('shows an error alert when instances cannot be fetched', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.reject(new Error('network'))
            return Promise.resolve({ data: [] })
        })
        const wrapper = await mountView()
        expect(wrapper.vm.instancesError).toBe('Kunde inte hämta kursinstanser.')
        expect(wrapper.text()).toContain('Kunde inte hämta kursinstanser.')
        wrapper.unmount()
    })

    it('shows the no-instance prompt until a course instance is selected', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Välj en kursinstans ovan för att se inlämningar, deltagare och rapport.')
        wrapper.unmount()
    })

    it('shows an info alert when there is no report data', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url.endsWith('/reports')) return Promise.resolve({ data: null })
            return Promise.resolve({ data: [] })
        })
        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadAll()
        await flushPromises()
        expect(wrapper.text()).toContain('Ingen rapport tillgänglig för den här kursinstansen.')
        wrapper.unmount()
    })

    it('renders the existing report summary when data is available', async () => {
        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadAll()
        await flushPromises()
        expect(wrapper.text()).toContain('Totalt')
        expect(wrapper.text()).toContain('3')
        expect(wrapper.text()).not.toContain('Ingen rapport tillgänglig')
        wrapper.unmount()
    })

    it('formats missing and invalid timestamps as Aldrig', () => {
        const wrapper = mount(LearningManagement, { global: { plugins: [vuetify] } })
        expect(wrapper.vm.formatDateTime(null)).toBe('Aldrig')
        expect(wrapper.vm.formatDateTime('not-a-date')).toBe('Aldrig')
        wrapper.unmount()
    })
})
