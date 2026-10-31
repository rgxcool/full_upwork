import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CourseOverview from '@/components/Teacher/CourseOverview.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
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
        client.get.mockResolvedValueOnce({
            data: {
                courseName: 'Matematik 1',
                startDate: '2026-09-21',
                endDate: '2026-10-26',
                slutprovDate: '2026-10-23',
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
                ],
            },
        })

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
    })
})
