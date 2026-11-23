import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CourseOverview from '@/components/Teacher/CourseOverview.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    }),
}))

import client from '@/api/client.js'
import { PLANNED_DATE_LABEL } from '@/utils/courseContent.js'

const makeCourse = (overrides = {}) => ({
    _id: overrides._id || 'ci-1',
    courseName: 'Matematik 1',
    courseCode: 'MAT100',
    startDate: '2026-09-21',
    endDate: '2026-10-26',
    slutprovDate: '2026-10-23',
    enrollmentCount: 3,
    responsibleTeacher: { userId: { username: 'Allan' } },
    ...overrides,
})

const makeDetails = () => ({
    _id: 'ci-1',
    courseName: 'Matematik 1',
    courseCode: 'MAT100',
    startDate: '2026-09-21',
    endDate: '2026-10-26',
    slutprovDate: '2026-10-23',
    isCourseInstance: true,
    modules: [
        {
            moduleNumber: 2,
            title: 'Modul 2',
            startDate: '2026-10-05T00:00:00.000Z',
            avsnitt: [],
        },
        {
            moduleNumber: 1,
            title: 'Modul 1',
            startDate: '2026-09-21T00:00:00.000Z',
            avsnitt: [
                {
                    avsnittId: 'm1-a2',
                    title: 'Avsnitt 2',
                    order: 2,
                    plannedDate: null,
                },
                {
                    avsnittId: 'm1-a1',
                    title: 'Avsnitt 1',
                    order: 1,
                    plannedDate: '2026-09-28T00:00:00.000Z',
                },
            ],
        },
    ],
    content: {
        '1': { title: 'Startmodul', isHiddenFromStudent: true },
    },
    students: [
        {
            _id: 's1',
            name: 'Anna Elev',
            examTime: '09:00',
            examMunicipality: 'Solna',
            examLocation: 'Solna gymnasium',
            examRoom: '12',
            attended: false,
        },
        {
            _id: 's2',
            name: 'Erik Elev',
            examTime: '10:00',
            examMunicipality: 'Solna',
            examLocation: 'Solna gymnasium',
            examRoom: '13',
            attended: true,
        },
    ],
})

const makeBatch = () => ({
    activityResults: [
        {
            studentId: 's1',
            overallStatus: 'on schedule',
            moduleStatuses: [
                {
                    moduleNumber: 1,
                    completed: true,
                    behind: false,
                    sectionDate: '2026-08-01',
                },
                { moduleNumber: 2, completed: false, behind: false },
            ],
        },
        {
            studentId: 's2',
            overallStatus: 'behind',
            moduleStatuses: [
                { moduleNumber: 1, completed: false, behind: true },
                { moduleNumber: 2, completed: false, behind: false },
            ],
        },
    ],
})

const mountPage = async (courses) => {
    const wrapper = mount(CourseOverview)
    await flushPromises()
    wrapper.vm.courses = courses
    await wrapper.vm.$nextTick()
    return wrapper
}

describe('CourseOverview.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        client.get.mockResolvedValue({ data: { instances: [] } })
        client.post.mockResolvedValue({ data: { activityResults: [] } })
    })

    it('filters by course name, code and responsible teacher', async () => {
        const wrapper = await mountPage([
            makeCourse(),
            makeCourse({
                _id: 'ci-2',
                courseName: 'Engelska 5',
                courseCode: 'ENG500',
                responsibleTeacher: { userId: { username: 'Mirsada' } },
            }),
        ])

        wrapper.vm.searchQuery = 'mat'
        expect(wrapper.vm.filteredCourses.map((c) => c._id)).toEqual(['ci-1'])

        wrapper.vm.searchQuery = 'eng500'
        expect(wrapper.vm.filteredCourses.map((c) => c._id)).toEqual(['ci-2'])

        wrapper.vm.searchQuery = 'mirsada'
        expect(wrapper.vm.filteredCourses.map((c) => c._id)).toEqual(['ci-2'])
    })

    it('filters by slutprov, start and end date using local calendar days', async () => {
        const wrapper = await mountPage([
            makeCourse(),
            makeCourse({
                _id: 'ci-2',
                startDate: '2026-10-05',
                endDate: '2026-11-09',
                slutprovDate: '2026-11-06',
            }),
        ])

        wrapper.vm.finalExamDateFilter = '2026-10-23'
        expect(wrapper.vm.filteredCourses.map((c) => c._id)).toEqual(['ci-1'])

        wrapper.vm.finalExamDateFilter = ''
        wrapper.vm.startDateFilter = '2026-10-05'
        expect(wrapper.vm.filteredCourses.map((c) => c._id)).toEqual(['ci-2'])

        wrapper.vm.startDateFilter = ''
        wrapper.vm.endDateFilter = '2026-11-09'
        expect(wrapper.vm.filteredCourses.map((c) => c._id)).toEqual(['ci-2'])
    })

    it('clears all filters', async () => {
        const wrapper = await mountPage([makeCourse()])

        wrapper.vm.searchQuery = 'mat'
        wrapper.vm.finalExamDateFilter = '2026-10-23'
        wrapper.vm.startDateFilter = '2026-09-21'
        wrapper.vm.endDateFilter = '2026-10-26'

        wrapper.vm.clearFilters()

        expect(wrapper.vm.searchQuery).toBe('')
        expect(wrapper.vm.finalExamDateFilter).toBe('')
        expect(wrapper.vm.startDateFilter).toBe('')
        expect(wrapper.vm.endDateFilter).toBe('')
        expect(wrapper.vm.filteredCourses).toHaveLength(1)
    })

    it('loads course details including per-student exam information', async () => {
        const wrapper = await mountPage([makeCourse()])
        client.get.mockResolvedValueOnce({ data: makeDetails() })

        await wrapper.vm.showCourseDetails('ci-1')

        expect(client.get).toHaveBeenCalledWith('/details/Kursinstans/ci-1')
        expect(wrapper.vm.showModal).toBe(true)
        expect(wrapper.vm.courseDetails.students[0]).toMatchObject({
            examTime: '09:00',
            examMunicipality: 'Solna',
            examLocation: 'Solna gymnasium',
            examRoom: '12',
        })
        expect(wrapper.vm.courseDetails.slutprovDate).toBe('2026-10-23')
        // The details payload already carries the module/Avsnitt structure.
        expect(wrapper.vm.courseDetails.modules).toHaveLength(2)
        expect(
            wrapper.vm.courseDetails.modules[1].avsnitt.find(
                (av) => av.avsnittId === 'm1-a1'
            ).plannedDate
        ).toBe('2026-09-28T00:00:00.000Z')
    })

    it('fetches batch status lazily once when the Moduler tab is first opened', async () => {
        const wrapper = await mountPage([makeCourse()])
        client.get.mockResolvedValueOnce({ data: makeDetails() })
        client.post.mockResolvedValueOnce({ data: makeBatch() })

        await wrapper.vm.showCourseDetails('ci-1')
        expect(wrapper.vm.detailsTab).toBe('students')
        expect(client.post).not.toHaveBeenCalled()

        await wrapper.vm.onDetailsTabChange('modules')
        await flushPromises()

        expect(client.post).toHaveBeenCalledWith(
            '/learning/instances/ci-1/activity-status/batch',
            {}
        )
        expect(client.post).toHaveBeenCalledTimes(1)
        // D5: date comes from details, not the batch sectionDate fixture.
        expect(wrapper.vm.moduleRows[0].plannedDate).toBe('2026-09-21')
        expect(wrapper.vm.moduleRows[0].students[0]).toMatchObject({
            studentId: 's1',
            hasStatus: true,
            completed: true,
            behind: false,
            overallStatus: 'on schedule',
        })
        expect(wrapper.vm.moduleRows[0].students[1]).toMatchObject({
            studentId: 's2',
            behind: true,
        })

        await wrapper.vm.onDetailsTabChange('students')
        await wrapper.vm.onDetailsTabChange('modules')
        expect(client.post).toHaveBeenCalledTimes(1)
        wrapper.unmount()
    })

    it('keeps exam details usable when batch status fails', async () => {
        const wrapper = await mountPage([makeCourse()])
        client.get.mockResolvedValueOnce({ data: makeDetails() })
        client.post.mockRejectedValueOnce(new Error('batch failed'))

        await wrapper.vm.showCourseDetails('ci-1')
        wrapper.vm.detailsTab = 'modules'
        await wrapper.vm.onDetailsTabChange('modules')
        await flushPromises()

        expect(wrapper.vm.showModal).toBe(true)
        expect(wrapper.vm.moduleStatusError).toContain(
            'Kunde inte hämta modulstatus'
        )
        expect(wrapper.vm.moduleRows).toHaveLength(2)
        expect(wrapper.vm.moduleRows[0].students[0].hasStatus).toBe(false)

        wrapper.vm.detailsTab = 'students'
        await flushPromises()
        expect(document.body.textContent).toContain('Anna Elev')
        wrapper.unmount()
    })

    it('renders module rows with Avsnitt planned dates and student status chips', async () => {
        const wrapper = await mountPage([makeCourse()])
        client.get.mockResolvedValueOnce({ data: makeDetails() })
        client.post.mockResolvedValueOnce({ data: makeBatch() })

        await wrapper.vm.showCourseDetails('ci-1')
        wrapper.vm.detailsTab = 'modules'
        await wrapper.vm.onDetailsTabChange('modules')
        await flushPromises()

        const text = document.body.textContent || ''
        expect(text).toContain('Modul 1 · Startmodul')
        expect(text).toContain('Dold för elever')
        expect(text).toContain('2026-09-21')
        expect(text).toContain('Avsnitt 1')
        expect(text).toContain(`${PLANNED_DATE_LABEL}: 2026-09-28`)
        expect(text).toContain('Anna Elev · Klar')
        expect(text).toContain('Erik Elev · Bakom')
        expect(text).not.toContain('2026-08-01')
        wrapper.unmount()
    })
})
