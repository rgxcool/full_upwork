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
        client.post.mockResolvedValue({ data: { success: true, activityResults: [] } })
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

    const participantRows = [
        {
            participantId: 'stu-1',
            name: 'Anna Andersson',
            role: 'student',
            lastActivity: { type: 'submission', at: '2026-02-10T10:00:00.000Z' },
        },
        {
            participantId: 'stu-2',
            name: 'Erik Eriksson',
            role: 'student',
            lastActivity: { type: 'login', at: '2026-02-11T09:00:00.000Z' },
        },
        { participantId: 'stu-3', name: 'Ingen aktiv', role: 'student', lastActivity: null },
        { participantId: 'tea-1', name: 'Lärare', role: 'staff', lastActivity: { type: 'login', at: '2026-02-12T08:00:00.000Z' } },
    ]

    it('renders backend lastActivity directly without per-participant access-last requests', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url.endsWith('/participants')) return Promise.resolve({ data: { participants: participantRows } })
            return Promise.resolve({ data: [] })
        })

        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadParticipants()
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('Senast aktivitet')
        expect(text).not.toContain('Senast aktiv på kurskort')
        expect(text).toContain('Inlämning')
        expect(text).toContain('Inloggning')
        expect(text).toContain('2026-02-10')
        expect(text).toContain('Aldrig')
        expect(client.get.mock.calls.map(([url]) => url).some((url) => url.includes('/access-last/'))).toBe(false)
        expect(wrapper.vm.participants).toEqual(participantRows)
        wrapper.unmount()
    })

    it('removes a participant using participantId and reloads the list', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url.endsWith('/participants')) return Promise.resolve({ data: { participants: participantRows } })
            return Promise.resolve({ data: [] })
        })

        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadParticipants()
        await flushPromises()

        const removeButtons = wrapper.findAll('button').filter((b) => b.text().includes('Ta bort'))
        expect(removeButtons).toHaveLength(3)
        await removeButtons[0].trigger('click')
        await flushPromises()

        expect(client.delete).toHaveBeenCalledWith('/learning/instances/inst-1/participants/stu-1')
        wrapper.unmount()
    })

    const batchResults = [
        {
            studentId: 'stu-1',
            overallStatus: 'on schedule',
            totalModules: 2,
            completedModules: 1,
            moduleStatuses: [
                { moduleNumber: 1, title: 'Läsning', completed: true },
                { moduleNumber: 2, title: 'Delprov', completed: false },
            ],
        },
        {
            studentId: 'stu-2',
            overallStatus: 'behind',
            totalModules: 2,
            completedModules: 0,
            moduleStatuses: [
                { moduleNumber: 1, title: 'Läsning', completed: false, behind: true },
                { moduleNumber: 2, title: 'Delprov', completed: false },
            ],
        },
        {
            studentId: 'stu-3',
            overallStatus: 'completed',
            totalModules: 2,
            completedModules: 2,
            moduleStatuses: [
                { moduleNumber: 1, title: 'Läsning', completed: true },
                { moduleNumber: 2, title: 'Delprov', completed: true },
            ],
        },
    ]

    const mockParticipantsAndBatch = () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url.endsWith('/participants')) return Promise.resolve({ data: { participants: participantRows } })
            return Promise.resolve({ data: [] })
        })
        client.post.mockResolvedValue({ data: { success: true, activityResults: batchResults } })
    }

    it('does not request module status until a course instance is selected', async () => {
        const wrapper = await mountView()
        expect(client.post).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('Modulstatus')
        wrapper.unmount()
    })

    it('loads class-wide module status from the batch endpoint and renders the summary column', async () => {
        mockParticipantsAndBatch()
        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadAll()
        await flushPromises()

        expect(client.post).toHaveBeenCalledWith('/learning/instances/inst-1/activity-status/batch', {})
        expect(wrapper.vm.activityResults).toEqual(batchResults)
        expect(wrapper.text()).toContain('Modulstatus')
        expect(wrapper.text()).toContain('Modul 2 · Delprov')
        expect(wrapper.text()).toContain('Pågår')
        expect(wrapper.text()).toContain('Bakom')
        expect(wrapper.text()).toContain('Alla moduler klara')
        expect(wrapper.text()).toContain('Klar')
        wrapper.unmount()
    })

    it('shows an error state when the batch request fails', async () => {
        mockParticipantsAndBatch()
        client.post.mockRejectedValue(new Error('network'))
        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadAll()
        await flushPromises()

        expect(wrapper.vm.activityError).toBe('Kunde inte hämta modulstatus.')
        expect(wrapper.text()).toContain('Kunde inte hämta modulstatus.')
        wrapper.unmount()
    })

    it('shows an empty state when the batch returns no students', async () => {
        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadAll()
        await flushPromises()

        expect(wrapper.text()).toContain('Ingen modulstatus tillgänglig för den här kursinstansen.')
        wrapper.unmount()
    })

    it('clears module status when the selected instance changes', async () => {
        mockParticipantsAndBatch()
        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadAll()
        await flushPromises()
        expect(wrapper.vm.activityResults).toHaveLength(3)

        wrapper.vm.selectedInstanceId = ''
        await wrapper.vm.loadAll()
        await flushPromises()
        expect(wrapper.vm.activityResults).toEqual([])
        expect(wrapper.vm.activityLoaded).toBe(false)
        expect(wrapper.text()).not.toContain('Modul 2 · Delprov')
        wrapper.unmount()
    })

    it('ignores a batch response that arrives after the instance changed', async () => {
        const resolvers = []
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url.endsWith('/participants')) return Promise.resolve({ data: { participants: participantRows } })
            return Promise.resolve({ data: [] })
        })
        client.post.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))

        const wrapper = await mountView()
        wrapper.vm.selectedInstanceId = 'inst-1'
        await wrapper.vm.loadAll()
        wrapper.vm.selectedInstanceId = 'inst-2'
        await wrapper.vm.loadAll()

        resolvers[0]({ data: { success: true, activityResults: batchResults } })
        await flushPromises()
        expect(wrapper.vm.activityResults).toEqual([])

        resolvers[1]({ data: { success: true, activityResults: [] } })
        await flushPromises()
        expect(wrapper.vm.activityLoading).toBe(false)
        expect(wrapper.vm.activityLoaded).toBe(true)
        wrapper.unmount()
    })
})
