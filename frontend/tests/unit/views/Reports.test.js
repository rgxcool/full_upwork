import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Reports from '@/views/Admin/Reports.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

vi.mock('@/utils/exportUtils.js', () => ({
    exportToCSV: vi.fn(),
    exportToPDF: vi.fn(),
}))

import client from '@/api/client.js'
import { exportToCSV, exportToPDF } from '@/utils/exportUtils.js'

let vuetify

const instance = { _id: 'inst-1', courseName: 'Svenska 1' }
const participants = [
    { participantId: 'stu-1', name: 'Anna Andersson', role: 'student' },
    { participantId: 'stu-2', name: 'Erik Eriksson', role: 'student' },
    { participantId: 'tea-1', name: 'Lärare', role: 'staff' },
]

const reportPayload = {
    success: true,
    totalModules: 2,
    completedModules: 1,
    completionRate: '50.0',
    modules: [
        {
            moduleNumber: 2,
            title: 'Delprov',
            completed: false,
            scheduled: true,
            scheduleDate: '2026-02-10',
            submissionDate: null,
            avsnitt: [
                { avsnittId: 'm2-a1', title: 'Avsnitt 1', order: 1, plannedDate: null },
            ],
        },
        {
            moduleNumber: 1,
            title: 'Läsning',
            completed: true,
            scheduled: true,
            scheduleDate: null,
            submissionDate: '2026-01-20T10:00:00.000Z',
            avsnitt: [
                { avsnittId: 'm1-a1', title: 'Avsnitt 1', order: 1, plannedDate: '2026-11-16' },
                { avsnittId: 'm1-a2', title: 'Avsnitt 2', order: 2, plannedDate: '2026-11-23' },
            ],
        },
    ],
    scheduledDates: [{ moduleIndex: 0, date: '2026-01-05' }],
}

const mountView = async () => {
    const wrapper = mount(Reports, { global: { plugins: [vuetify] } })
    await flushPromises()
    return wrapper
}

const selectInstance = async (wrapper, id = 'inst-1') => {
    wrapper.vm.selectedInstance = id
    await flushPromises()
    await flushPromises()
}

describe('Reports.vue', () => {
    beforeEach(async () => {
        const { createVuetify } = await import('vuetify')
        const components = await import('vuetify/components')
        const directives = await import('vuetify/directives')
        vuetify = createVuetify({ components, directives })

        vi.clearAllMocks()
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url === '/learning/instances/inst-1/participants') {
                return Promise.resolve({ data: { participants } })
            }
            if (url.includes('/report/')) return Promise.resolve({ data: reportPayload })
            return Promise.resolve({ data: [] })
        })
    })

    it('loads students from the instance participants endpoint without a Vuex students module', async () => {
        const wrapper = await mountView()
        await selectInstance(wrapper)

        expect(client.get).toHaveBeenCalledWith('/learning/instances/inst-1/participants')
        expect(wrapper.vm.participants).toEqual([
            { _id: 'stu-1', name: 'Anna Andersson' },
            { _id: 'stu-2', name: 'Erik Eriksson' },
        ])
        expect(wrapper.vm.selectedInstanceName).toBe('Svenska 1')
        expect(wrapper.text()).not.toContain('Inga elever i den här kursinstansen.')
        wrapper.unmount()
    })

    it('shows a normalized error message instead of a generic Nätverksfel', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url.includes('/participants')) return Promise.resolve({ data: [] })
            if (url.includes('/report/')) return Promise.reject(new Error('Resursen hittades inte.'))
            return Promise.resolve({ data: [] })
        })

        const wrapper = await mountView()
        await selectInstance(wrapper)
        wrapper.vm.selectedStudent = 'stu-1'
        await flushPromises()
        await wrapper.vm.loadReport()
        await flushPromises()

        expect(wrapper.text()).toContain('Kunde inte ladda rapport: Resursen hittades inte.')
        wrapper.unmount()
    })

    it('renders sorted module rows with Swedish status labels and an empty state', async () => {
        const wrapper = await mountView()
        await selectInstance(wrapper)
        wrapper.vm.selectedStudent = 'stu-1'
        await flushPromises()
        await wrapper.vm.loadReport()
        await flushPromises()

        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(2)
        expect(rows[0].text()).toContain('Modul 1 · Läsning')
        expect(rows[0].text()).toContain('Klar')
        expect(rows[0].text()).toContain('2026-01-05')
        expect(rows[0].text()).toContain('2026-01-20')
        expect(wrapper.text()).toContain('Planerat inlämningsdatum')
        expect(rows[0].text()).toContain('Avsnitt 1: 2026-11-16')
        expect(rows[0].text()).toContain('Avsnitt 2: 2026-11-23')
        expect(rows[1].text()).toContain('Modul 2 · Delprov')
        expect(rows[1].text()).toContain('Ej klar')
        expect(rows[1].text()).toContain('2026-02-10')
        expect(rows[1].text()).toContain('Avsnitt 1: –')
        expect(wrapper.text()).not.toContain('✓')
        expect(wrapper.text()).not.toContain('✗')
        wrapper.unmount()
    })

    it('keeps nested Avsnitt dates from the report payload in table data', async () => {
        const wrapper = await mountView()
        await selectInstance(wrapper)
        wrapper.vm.selectedStudent = 'stu-1'
        await flushPromises()
        await wrapper.vm.loadReport()
        await flushPromises()

        expect(wrapper.vm.tableData[0].avsnitt).toEqual([
            { avsnittId: 'm1-a1', title: 'Avsnitt 1', order: 1, plannedDate: '2026-11-16' },
            { avsnittId: 'm1-a2', title: 'Avsnitt 2', order: 2, plannedDate: '2026-11-23' },
        ])
        expect(wrapper.vm.tableData[1].avsnitt).toHaveLength(1)
        wrapper.unmount()
    })

    it('shows an empty-row message when the report has no modules', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-instances') return Promise.resolve({ data: [instance] })
            if (url.includes('/participants')) return Promise.resolve({ data: { participants } })
            if (url.includes('/report/')) {
                return Promise.resolve({
                    data: { success: true, totalModules: 0, completedModules: 0, completionRate: 0, modules: [] },
                })
            }
            return Promise.resolve({ data: [] })
        })

        const wrapper = await mountView()
        await selectInstance(wrapper)
        wrapper.vm.selectedStudent = 'stu-1'
        await flushPromises()
        await wrapper.vm.loadReport()
        await flushPromises()

        expect(wrapper.find('tbody tr').text()).toContain('Inga moduler hittades')
        wrapper.unmount()
    })

    it('clears stale report data when the instance or student changes', async () => {
        const wrapper = await mountView()
        await selectInstance(wrapper)
        wrapper.vm.selectedStudent = 'stu-1'
        await flushPromises()
        await wrapper.vm.loadReport()
        await flushPromises()
        expect(wrapper.vm.hasReport).toBe(true)
        expect(wrapper.vm.tableData).toHaveLength(2)

        wrapper.vm.selectedStudent = 'stu-2'
        await flushPromises()
        expect(wrapper.vm.hasReport).toBe(false)
        expect(wrapper.vm.tableData).toEqual([])
        expect(wrapper.text()).toContain('Välj kursinstans och elev och ladda sedan rapporten.')

        await selectInstance(wrapper, 'inst-2')
        expect(wrapper.vm.selectedStudent).toBe('')
        expect(wrapper.vm.participants).toEqual([])
        wrapper.unmount()
    })

    it('keeps CSV and PDF export behaviour with Swedish status labels', async () => {
        const wrapper = await mountView()
        await selectInstance(wrapper)
        wrapper.vm.selectedStudent = 'stu-1'
        await flushPromises()
        await wrapper.vm.loadReport()
        await flushPromises()
        await wrapper.vm.downloadReport()

        expect(exportToCSV).toHaveBeenCalledWith(
            'rapport-Anna Andersson.csv',
            ['Modul', 'Status', 'Planerat datum', 'Planerat inlämningsdatum', 'Inlämnat'],
            [
                [1, 'Klar', '2026-01-05', 'Avsnitt 1: 2026-11-16; Avsnitt 2: 2026-11-23', '2026-01-20'],
                [2, 'Ej klar', '2026-02-10', 'Avsnitt 1: –', 'Ej uppfört'],
            ]
        )
        expect(exportToPDF).toHaveBeenCalledWith(
            'rapport-Anna Andersson.pdf',
            'Kompletionsrapport – Anna Andersson',
            ['Modul', 'Status', 'Planerat datum', 'Planerat inlämningsdatum', 'Inlämnat'],
            [
                [1, 'Klar', '2026-01-05', 'Avsnitt 1: 2026-11-16; Avsnitt 2: 2026-11-23', '2026-01-20'],
                [2, 'Ej klar', '2026-02-10', 'Avsnitt 1: –', 'Ej uppfört'],
            ]
        )
        wrapper.unmount()
    })

    it('formats missing and invalid dates without NaN', async () => {
        const wrapper = await mountView()
        expect(wrapper.vm.formatDate(null)).toBe('–')
        expect(wrapper.vm.formatDate('not-a-date')).toBe('–')
        expect(wrapper.vm.formatDate('2026-03-04')).toContain('2026-03-04')
        wrapper.unmount()
    })
})
