import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentCourseCardsAdmin from '@/views/Admin/StudentCourseCardsAdmin.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

import client from '@/api/client.js'

let vuetify

const student = { _id: 'stu-1', name: 'Anna Andersson', personalNumber: '19900101-1234' }
const baseCard = {
    _id: 'card-1',
    courseName: 'Svenska 1',
    courseCode: 'SVEENG01',
    status: 'active',
    startDate: '2026-01-05T00:00:00.000Z',
    endDate: '2026-02-09T00:00:00.000Z',
}

const mountView = async () => {
    const wrapper = mount(StudentCourseCardsAdmin, { global: { plugins: [vuetify] } })
    await flushPromises()
    await wrapper.vm.loadCards()
    await flushPromises()
    return wrapper
}

describe('StudentCourseCardsAdmin.vue', () => {
    beforeEach(async () => {
        const { createVuetify } = await import('vuetify')
        const components = await import('vuetify/components')
        const directives = await import('vuetify/directives')
        vuetify = createVuetify({ components, directives })

        vi.clearAllMocks()
        client.get.mockImplementation((url) => {
            if (url === '/students') return Promise.resolve({ data: [student] })
            if (url === '/students/stu-1/course-cards') return Promise.resolve({ data: { cards: [] } })
            return Promise.resolve({ data: [] })
        })
    })

    it('surfaces the current module and progress for staff', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/students') return Promise.resolve({ data: [student] })
            if (url === '/students/stu-1/course-cards') {
                return Promise.resolve({
                    data: {
                        cards: [{
                            ...baseCard,
                            currentModule: { moduleNumber: 3, title: 'Delprov', status: 'Pågår' },
                            currentModuleNumber: 3,
                            progress: { completed: 2, total: 4, percent: 50 },
                        }],
                    },
                })
            }
            return Promise.resolve({ data: [] })
        })

        const wrapper = await mountView()
        wrapper.vm.selectedStudentId = 'stu-1'
        await wrapper.vm.loadCards()
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('Aktuell modul')
        expect(text).toContain('Modul 3 · Delprov')
        expect(text).toContain('Pågår')
        expect(text).toContain('Framsteg: 2/4 (50%)')
        wrapper.unmount()
    })

    it('shows the same completed copy as the student view', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/students') return Promise.resolve({ data: [student] })
            if (url === '/students/stu-1/course-cards') {
                return Promise.resolve({
                    data: {
                        cards: [{
                            ...baseCard,
                            currentModule: null,
                            currentModuleNumber: null,
                            progress: { completed: 2, total: 2, percent: 100 },
                        }],
                    },
                })
            }
            return Promise.resolve({ data: [] })
        })

        const wrapper = await mountView()
        wrapper.vm.selectedStudentId = 'stu-1'
        await wrapper.vm.loadCards()
        await flushPromises()

        const text = wrapper.text()
        expect(text).toContain('Kursen är klar')
        expect(text).toContain('Alla moduler klara')
        expect(text).toContain('Framsteg: 2/2 (100%)')
        wrapper.unmount()
    })

    it('omits the module block when the card has no assignment modules', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/students') return Promise.resolve({ data: [student] })
            if (url === '/students/stu-1/course-cards') {
                return Promise.resolve({
                    data: { cards: [{ ...baseCard, currentModule: null, progress: null }] },
                })
            }
            return Promise.resolve({ data: [] })
        })

        const wrapper = await mountView()
        wrapper.vm.selectedStudentId = 'stu-1'
        await wrapper.vm.loadCards()
        await flushPromises()

        expect(wrapper.text()).not.toContain('Aktuell modul')
        expect(wrapper.text()).not.toContain('Alla moduler klara')
        wrapper.unmount()
    })
})
