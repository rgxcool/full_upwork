import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CourseCards from '@/views/Student/CourseCards.vue'

vi.mock('vue-router', () => ({
    useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

import client from '@/api/client.js'

let vuetify

const sampleCard = {
    courseInstanceId: '111111111111111111111111',
    enrollmentId: 'enrA',
    courseName: 'Svenska 1',
    courseCode: 'SVEENG01',
    coursePoints: '100',
    courseExtent: '5',
    responsibleTeacher: 'Mirsada',
    startDate: '2026-01-05T00:00:00.000Z',
    endDate: '2026-02-09T00:00:00.000Z',
    weeks: 5,
    studyPeriod: 1,
    status: 'active',
    isCurrentlyActive: true,
    modules: [
        {
            moduleNumber: 3,
            title: 'Delprov',
            isPartialExam: true,
            isCaseStudy: false,
            sections: [{ title: 'Sektion 1', description: 'Innehåll' }],
        },
    ],
}

const mountView = async (options = {}) => {
    const wrapper = mount(CourseCards, {
        global: { plugins: [vuetify] },
        ...options,
    })
    await flushPromises()
    return wrapper
}

describe('CourseCards.vue', () => {
    beforeEach(async () => {
        const { createVuetify } = await import('vuetify')
        const components = await import('vuetify/components')
        const directives = await import('vuetify/directives')
        vuetify = createVuetify({ components, directives })

        vi.clearAllMocks()
        client.get.mockResolvedValue({
            data: {
                student: { _id: '000000000000000000000001', name: 'Anna Andersson' },
                cards: [sampleCard],
            },
        })
    })

    it('renders the student name and course card fields', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Mina kurser')
        expect(wrapper.text()).toContain('Anna Andersson')
        expect(wrapper.text()).toContain('Svenska 1')
        expect(wrapper.text()).toContain('SVEENG01')
        expect(wrapper.text()).toContain('Period 1')
        expect(wrapper.text()).toContain('Veckor: 5')
        expect(wrapper.text()).toContain('Pågående')
        expect(wrapper.text()).toContain('Mirsada')
        expect(wrapper.text()).toContain('Delprov')
        expect(client.get).toHaveBeenCalledWith('/course-cards/mine')
        wrapper.unmount()
    })

    it('shows the active/ongoing counter', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('1')
        expect(wrapper.text()).toContain('pågående')
        wrapper.unmount()
    })

    it('shows the empty state when there are no cards', async () => {
        client.get.mockResolvedValue({
            data: { student: null, cards: [] },
        })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Inga kurser ännu')
        wrapper.unmount()
    })

    it('shows an activity error with retry instead of an empty feed', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-cards/mine') {
                return Promise.resolve({ data: { student: { _id: 'student-1', name: 'Anna' }, cards: [sampleCard] } })
            }
            if (url.includes('/modules')) return Promise.resolve({ data: { submissions: {}, enrollmentId: 'enrA' } })
            if (url.includes('/activity-feed')) return Promise.reject(new Error('offline'))
            return Promise.resolve({ data: {} })
        })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Kunde inte hämta meddelanden.')
        expect(wrapper.text()).toContain('Försök igen')
        wrapper.unmount()
    })

    it('shows a learning error when document data cannot be fetched', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/course-cards/mine') {
                return Promise.resolve({ data: { student: { _id: 'student-1', name: 'Anna' }, cards: [sampleCard] } })
            }
            if (url.includes('/modules')) return Promise.reject(new Error('offline'))
            return Promise.resolve({ data: {} })
        })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Kunde inte hämta studiedokument.')
        wrapper.unmount()
    })

    it('shows the backend error message on failure', async () => {
        client.get.mockRejectedValue({
            response: { data: { error: 'Konto saknar e-postadress' } },
        })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Konto saknar e-postadress')
        wrapper.unmount()
    })

    it('retries loading courses from the error state without a reload', async () => {
        let attempts = 0
        client.get.mockImplementation((url) => {
            if (url === '/course-cards/mine') {
                attempts += 1
                if (attempts === 1) return Promise.reject(new Error('offline'))
                return Promise.resolve({
                    data: {
                        student: { _id: 'student-1', name: 'Anna' },
                        cards: [sampleCard],
                    },
                })
            }
            return Promise.resolve({ data: { submissions: {}, enrollmentId: 'enrA' } })
        })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Kunde inte hämta kurserna.')

        const retry = wrapper.find('div.error-state button.refresh-btn')
        expect(retry.exists()).toBe(true)
        expect(retry.text()).toBe('Försök igen')
        await retry.trigger('click')
        await flushPromises()

        expect(attempts).toBe(2)
        expect(wrapper.text()).not.toContain('Kunde inte hämta kurserna.')
        expect(wrapper.text()).toContain('Svenska 1')
        wrapper.unmount()
    })

    it('falls back to a generic message when the error has no payload', async () => {
        client.get.mockRejectedValue(new Error('network'))
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Kunde inte hämta kurserna.')
        wrapper.unmount()
    })

    const cardWithAssignment = {
        ...sampleCard,
        modules: [
            {
                moduleNumber: 1,
                title: 'Modul 1',
                isPartialExam: false,
                isCaseStudy: false,
                sections: [
                    {
                        title: 'Sektion 1',
                        description: 'Innehåll',
                        instructions: 'Läs texten på sidan 5.',
                    },
                ],
                assignment: { title: 'Inlämning 1', description: 'Skriv en reflektion.' },
            },
        ],
    }

    const studentData = { student: { _id: '000000000000000000000001', name: 'Anna Andersson' } }

    it('renders section instructions and the assignment form', async () => {
        client.get.mockResolvedValue({ data: { ...studentData, cards: [cardWithAssignment] } })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Läs texten på sidan 5.')
        expect(wrapper.text()).toContain('Inlämning 1')
        expect(wrapper.text()).toContain('Skriv en reflektion.')
        expect(wrapper.find('textarea.submission-textarea').exists()).toBe(true)
        wrapper.unmount()
    })

    it('submits an assignment and shows the pending status', async () => {
        client.get.mockResolvedValue({ data: { ...studentData, cards: [cardWithAssignment] } })
        client.post.mockResolvedValue({
            data: { submission: { submittedAt: '2026-08-13T10:00:00.000Z', feedback: null } },
        })
        const wrapper = await mountView()
        await wrapper.find('textarea.submission-textarea').setValue('Min reflektion...')
        await wrapper.find('button.submit-btn').trigger('click')
        await flushPromises()
        expect(client.post).toHaveBeenCalledWith(
            '/learning/instances/111111111111111111111111/modules/1/submissions',
            expect.objectContaining({ submittedText: 'Min reflektion...' })
        )
        expect(wrapper.text()).toContain('Väntar på återkoppling')
        expect(wrapper.text()).toContain('Inlämnat')
        wrapper.unmount()
    })

    it('shows feedback on an existing submission', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/learning/instances/')) {
                return Promise.resolve({
                    data: {
                        submissions: {
                            1: {
                                submittedAt: '2026-08-01T09:00:00.000Z',
                                feedback: { status: 'godkänd', comment: 'Bra jobbat!' },
                            },
                        },
                        enrollmentId: 'enrA',
                    },
                })
            }
            return Promise.resolve({ data: { ...studentData, cards: [cardWithAssignment] } })
        })
        const wrapper = await mountView()
        await flushPromises()
        expect(wrapper.text()).toContain('Godkänd')
        expect(wrapper.text()).toContain('Bra jobbat!')
        wrapper.unmount()
    })

    it('renders course progress', async () => {
        const card = { ...sampleCard, progress: { completed: 1, total: 2, percent: 50 } }
        client.get.mockResolvedValue({ data: { ...studentData, cards: [card] } })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Framsteg: 1/2 (50%)')
        wrapper.unmount()
    })

    const mountCard = async (card) => {
        client.get.mockImplementation((url) => {
            if (url === '/course-cards/mine') {
                return Promise.resolve({ data: { ...studentData, cards: [card] } })
            }
            return Promise.resolve({ data: { submissions: {}, enrollmentId: 'enrA' } })
        })
        return mountView()
    }

    it('shows the current module with its number and highlights the matching chip and detail', async () => {
        const card = {
            ...sampleCard,
            currentModule: { moduleNumber: 3, title: 'Delprov', status: 'Pågår' },
            currentModuleNumber: 3,
            progress: { completed: 2, total: 4, percent: 50 },
        }
        const wrapper = await mountCard(card)

        const block = wrapper.find('.current-module')
        expect(block.exists()).toBe(true)
        expect(block.text()).toContain('Aktuell modul')
        expect(block.text()).toContain('Modul 3 · Delprov')
        expect(block.text()).toContain('Pågår')
        expect(wrapper.findAll('.module-chip-current')).toHaveLength(1)
        expect(wrapper.find('.module-chip-current').text()).toContain('Aktuell')
        expect(wrapper.find('.module-details-current summary').text()).toContain('Aktuell')
        wrapper.unmount()
    })

    it('shows the completed fallback when every assignment is accepted', async () => {
        const card = {
            ...sampleCard,
            currentModule: null,
            currentModuleNumber: null,
            progress: { completed: 2, total: 2, percent: 100 },
        }
        const wrapper = await mountCard(card)

        const block = wrapper.find('.current-module')
        expect(block.exists()).toBe(true)
        expect(block.classes()).toContain('current-module--complete')
        expect(block.text()).toContain('Kursen är klar')
        expect(block.text()).toContain('Alla moduler klara')
        expect(block.text()).not.toContain('Aktuell modul')
        expect(wrapper.findAll('.module-chip-current')).toHaveLength(0)
        wrapper.unmount()
    })

    it('hides the module block for cards without assignment modules', async () => {
        const card = { ...sampleCard, currentModule: null, currentModuleNumber: null, progress: null }
        const wrapper = await mountCard(card)

        expect(wrapper.find('.current-module').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('Alla moduler klara')
        wrapper.unmount()
    })

    const moduleWithAvSnitt = {
        moduleNumber: 1,
        title: 'Modul 1',
        sections: [],
        assignment: { title: 'Inlämning 1', description: 'Skriv en reflektion.' },
        avsnitt: [
            {
                avsnittId: 'm1-a1',
                title: 'Avsnitt 1',
                order: 1,
                plannedDate: '2026-11-23T00:00:00.000Z',
                contentItems: [
                    { contentId: 'c0', type: 'uppgift', title: 'Inlämning 1' },
                    {
                        contentId: 'c1',
                        type: 'lektion',
                        title: 'Introduktion',
                        order: 1,
                        lektion: { videoUrl: 'https://example.se/video', durationMinutes: 12 },
                    },
                    {
                        contentId: 'c2',
                        type: 'lasning',
                        title: 'Kapitel 1',
                        order: 2,
                        lasning: { resourceUrl: 'https://example.se/text', estimatedMinutes: 8 },
                    },
                ],
            },
        ],
    }

    it('renders nothing new for a legacy module with an empty avsnitt array', async () => {
        const card = {
            ...sampleCard,
            modules: [{ ...moduleWithAvSnitt, avsnitt: [] }],
        }
        const wrapper = await mountCard(card)

        expect(wrapper.find('.avsnitt-block').exists()).toBe(false)
        expect(wrapper.find('.content-item-list').exists()).toBe(false)
        expect(wrapper.text()).toContain('Inlämning 1')
        wrapper.unmount()
    })

    it('renders lektion and lasning items inside the module details without duplicating uppgift', async () => {
        const card = { ...sampleCard, modules: [moduleWithAvSnitt] }
        const wrapper = await mountCard(card)

        expect(wrapper.find('.avsnitt-title').text()).toBe('Avsnitt 1')
        expect(wrapper.text()).toContain('Planerat inlämningsdatum: 2026-11-23')
        expect(wrapper.findAll('.content-item')).toHaveLength(2)
        expect(wrapper.text()).toContain('Lektion')
        expect(wrapper.text()).toContain('Läsning')
        expect(wrapper.text()).toContain('Introduktion')
        expect(wrapper.text()).toContain('Kapitel 1')
        expect(wrapper.text()).toContain('12 min')
        expect(wrapper.text()).toContain('ca 8 min')

        const list = wrapper.find('.content-item-list')
        expect(list.text()).not.toContain('Inlämning 1')
        // The interactive assignment block remains the single uppgift representation.
        expect(wrapper.find('.assignment-block').text()).toContain('Inlämning 1')
        expect(wrapper.find('textarea.submission-textarea').exists()).toBe(true)

        const links = wrapper.findAll('a.content-link')
        expect(links).toHaveLength(2)
        expect(links[0].attributes('href')).toBe('https://example.se/video')
        expect(links[0].attributes('target')).toBe('_blank')
        expect(links[0].attributes('rel')).toBe('noopener noreferrer')
        expect(links[0].text()).toBe('Visa video')
        expect(links[1].attributes('href')).toBe('https://example.se/text')
        expect(links[1].text()).toBe('Öppna text')
        wrapper.unmount()
    })

    it('suppresses the avsnitt block for hidden modules', async () => {
        const card = {
            ...sampleCard,
            modules: [{ ...moduleWithAvSnitt, isHiddenFromStudent: true }],
        }
        const wrapper = await mountCard(card)

        expect(wrapper.find('.avsnitt-block').exists()).toBe(false)
        expect(wrapper.find('.content-item-list').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('Planerat inlämningsdatum')
        wrapper.unmount()
    })

    it('shows no avsnitt list when the only content item is an uppgift', async () => {
        const card = {
            ...sampleCard,
            modules: [{
                ...moduleWithAvSnitt,
                avsnitt: [{
                    avsnittId: 'm1-a1',
                    title: 'Avsnitt 1',
                    order: 1,
                    contentItems: [{ contentId: 'c0', type: 'uppgift', title: 'Inlämning 1' }],
                }],
            }],
        }
        const wrapper = await mountCard(card)

        expect(wrapper.find('.avsnitt-block').exists()).toBe(false)
        expect(wrapper.find('.content-item-list').exists()).toBe(false)
        expect(wrapper.find('.assignment-block').text()).toContain('Inlämning 1')
        wrapper.unmount()
    })
})
