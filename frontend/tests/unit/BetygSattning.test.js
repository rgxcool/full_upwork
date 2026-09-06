import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BetygSattning from '../../src/views/Teacher/BetygSattning.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

vi.mock('vuex', () => ({
    useStore: () => ({
        getters: {
            isAdmin: true,
        },
    }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
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

const enrollmentItem = (overrides = {}) => ({
    student: { _id: 'stu-1', name: 'Anna Elev', email: 'a@b', teacherId: null },
    courseInstance: {
        _id: 'ci-1',
        courseCode: 'ENGENG05',
        mainCourseId: { _id: 'course-1', courseCode: 'ENGENG05', courseName: 'Engelska 5' },
        courseName: 'Engelska 5',
        responsibleTeacher: null,
    },
    endDate: '2025-03-15T00:00:00.000Z',
    grade: null,
    reason: '',
    comments: '',
    npScore: 80,
    enrollmentId: 'enroll-1',
    source: 'enrollment',
    ...overrides,
})

describe('BetygSattning.vue - national-test points (NP-poäng)', () => {
    let wrapper

    const mountPage = async (items) => {
        client.get.mockResolvedValue({ data: items })
        wrapper = mount(BetygSattning)
        await wrapper.vm.$nextTick()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.$nextTick()
    }

    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('loads npScore from the backend into the course row', async () => {
        await mountPage([enrollmentItem()])

        const rows = wrapper.vm.studentsToGrade
        expect(rows).toHaveLength(1)
        expect(rows[0].coursesToGrade[0].npScore).toBe(80)
    })

    it('renders an NP-poäng input for national courses and a dash otherwise', async () => {
        await mountPage([
            enrollmentItem(),
            enrollmentItem({
                student: { _id: 'stu-2', name: 'Bosse', email: 'b@b', teacherId: null },
                courseInstance: {
                    _id: 'ci-2',
                    courseCode: 'FYS01',
                    mainCourseId: { _id: 'course-2', courseCode: 'FYS01', courseName: 'Fysik' },
                    courseName: 'Fysik',
                    responsibleTeacher: null,
                },
                enrollmentId: 'enroll-2',
                npScore: null,
            }),
        ])

        const npCells = wrapper.findAll('.np-score-cell')
        expect(npCells.length).toBeGreaterThan(0)
        expect(npCells[0].find('input').exists()).toBe(true)
        expect(wrapper.text()).toContain('NP-poäng')
    })

    it('sends nationalTestPoints when saving an enrollment-based grade', async () => {
        await mountPage([enrollmentItem()])
        client.put.mockResolvedValue({ data: { success: true } })

        const course = wrapper.vm.studentsToGrade[0].coursesToGrade[0]
        course.grade = 'B'
        course.reason = 'Bra'
        course.npScore = 85

        await wrapper.vm.saveGrade('stu-1', course)

        expect(client.put).toHaveBeenCalledWith(
            '/update-grade/enroll-1',
            expect.objectContaining({
                grade: 'B',
                motivation: 'Bra',
                nationalTestPoints: 85,
            })
        )
    })

    it('sends npScore when saving a legacy education grade', async () => {
        await mountPage([
            enrollmentItem({
                student: { _id: 'stu-3', name: 'Cecilia', email: 'c@b', teacherId: null },
                courseInstance: null,
                source: 'student_education',
                courseRefId: 'course-9',
                courseCode: 'MA01',
                courseName: 'Matematik 1',
                enrollmentId: 'edu-9',
                npScore: 72,
            }),
        ])
        client.post.mockResolvedValue({ data: '✅ Betyg sparat!' })

        const course = wrapper.vm.studentsToGrade[0].coursesToGrade[0]
        course.grade = 'C'
        course.reason = 'Ok'

        await wrapper.vm.saveGrade('stu-3', course)

        expect(client.post).toHaveBeenCalledWith(
            '/teacher/save-grade/',
            expect.objectContaining({
                studentId: 'stu-3',
                courseId: 'course-9',
                npScore: 72,
                type: 'Course',
            })
        )
    })

    it('suggests a grade from the annual grading scale', async () => {
        client.get.mockResolvedValue({ data: [] })
        wrapper = mount(BetygSattning)
        await wrapper.vm.$nextTick()

        client.get.mockResolvedValue({ data: { grade: 'B', hasScale: true } })

        const course = {
            courseCode: 'ENGENG05',
            endDate: '2025-03-15T00:00:00.000Z',
            npScore: 82,
            suggestedGrade: null,
            suggestedChecked: false,
        }

        await wrapper.vm.suggestGrade(course)

        expect(client.get).toHaveBeenCalledWith('/grading-scale/suggest', {
            params: { term: 'VT25', subject: 'Engelska', points: 82 },
        })
        expect(course.suggestedGrade).toBe('B')
        expect(course.suggestChecked).toBe(true)
    })

    it('filters rows by search query and active filter', async () => {
        await mountPage([
            enrollmentItem({ student: { _id: 's1', name: 'Zara Andersson' }, grade: 'A' }),
            enrollmentItem({ student: { _id: 's2', name: 'Erik Blom' }, grade: null, locked: false }),
            enrollmentItem({ student: { _id: 's3', name: 'Fredrik Flink' }, grade: 'F' }),
            enrollmentItem({ student: { _id: 's4', name: 'Lars Låst' }, grade: 'C', locked: true }),
        ])

        wrapper.vm.searchQuery = 'Zara'
        expect(wrapper.vm.filteredRows).toHaveLength(1)
        expect(wrapper.vm.filteredRows[0].student.name).toBe('Zara Andersson')

        wrapper.vm.searchQuery = ''
        wrapper.vm.activeFilter = 'ungraded'
        expect(wrapper.vm.filteredRows).toHaveLength(1)
        expect(wrapper.vm.filteredRows[0].student.name).toBe('Erik Blom')

        wrapper.vm.activeFilter = 'graded'
        expect(wrapper.vm.filteredRows).toHaveLength(3)

        wrapper.vm.activeFilter = 'failing'
        expect(wrapper.vm.filteredRows).toHaveLength(1)
        expect(wrapper.vm.filteredRows[0].student.name).toBe('Fredrik Flink')

        wrapper.vm.activeFilter = 'locked'
        expect(wrapper.vm.filteredRows).toHaveLength(1)
        expect(wrapper.vm.filteredRows[0].student.name).toBe('Lars Låst')

        wrapper.vm.resetFilters()
        expect(wrapper.vm.activeFilter).toBe('all')
        expect(wrapper.vm.searchQuery).toBe('')
    })

    it('sorts rows correctly', async () => {
        await mountPage([
            enrollmentItem({ student: { _id: 's1', name: 'Zara' }, grade: 'C' }),
            enrollmentItem({ student: { _id: 's2', name: 'Adam' }, grade: 'A' }),
        ])

        wrapper.vm.sortBy = 'name-asc'
        expect(wrapper.vm.filteredRows[0].student.name).toBe('Adam')

        wrapper.vm.sortBy = 'name-desc'
        expect(wrapper.vm.filteredRows[0].student.name).toBe('Zara')

        wrapper.vm.sortBy = 'grade-asc'
        expect(wrapper.vm.filteredRows[0].student.name).toBe('Adam')

        wrapper.vm.sortBy = 'status'
        expect(wrapper.vm.filteredRows.length).toBe(2)
    })

    it('handles F grade motivation requirement', async () => {
        await mountPage([enrollmentItem()])
        const row = wrapper.vm.filteredRows[0]

        // Selecting F triggers modal
        wrapper.vm.handleGradeChange(row, 'F')
        expect(wrapper.vm.fModalOpen).toBe(true)

        // Confirming with empty motivation blocks
        wrapper.vm.currentFMotivation = ''
        wrapper.vm.confirmFModal()
        expect(wrapper.vm.fModalError).toContain('Motivering är obligatorisk')
        expect(wrapper.vm.fModalOpen).toBe(true)

        // Cancelling reverts grade
        wrapper.vm.cancelFModal()
        expect(wrapper.vm.fModalOpen).toBe(false)
        expect(row.course.grade).toBeFalsy()

        // Setting valid motivation sets F
        wrapper.vm.handleGradeChange(row, 'F')
        wrapper.vm.currentFMotivation = 'Underkänd på prov'
        wrapper.vm.currentFComments = 'Behöver stöd'
        wrapper.vm.confirmFModal()
        expect(wrapper.vm.fModalOpen).toBe(false)
        expect(row.course.grade).toBe('F')
        expect(row.course.reason).toBe('Underkänd på prov')
        expect(row.course.comments).toBe('Behöver stöd')
        expect(row.isDirty).toBe(true)
    })

    it('performs bulk save with partial success and failure reporting', async () => {
        await mountPage([
            enrollmentItem({ student: { _id: 's1', name: 'Anna' }, enrollmentId: 'e1' }),
            enrollmentItem({ student: { _id: 's2', name: 'Bertil' }, enrollmentId: 'e2' }),
        ])

        client.put.mockResolvedValueOnce({ data: { success: true } })

        const r1 = wrapper.vm.filteredRows[0]
        const r2 = wrapper.vm.filteredRows[1]

        r1.course.grade = 'B'
        r1.isDirty = true

        // r2 is F without motivation -> should fail
        r2.course.grade = 'F'
        r2.course.reason = ''
        r2.isDirty = true

        await wrapper.vm.saveAllChanges()

        expect(client.put).toHaveBeenCalledWith(
            '/update-grade/e1',
            expect.objectContaining({ grade: 'B' })
        )
        expect(r1.isDirty).toBe(false)
        expect(r2.isDirty).toBe(true)
        expect(r2.errorMessage).toContain('Motivering krävs')
    })

    it('handles custom result types and saveSingleRow', async () => {
        await mountPage([
            enrollmentItem({
                courseInstance: {
                    _id: 'ci-custom',
                    courseCode: 'ENG01',
                    courseName: 'Engelska',
                    mainCourseId: {
                        _id: 'c-custom',
                        resultTypes: [
                            { id: 'final_grade', label: 'Slutbetyg', type: 'grade' },
                            { id: 'speaking', label: 'Muntligt', type: 'grade' },
                        ],
                    },
                },
            }),
        ])

        expect(wrapper.vm.availableResultTypes).toHaveLength(2)
        wrapper.vm.activeResultTypeId = 'speaking'
        expect(wrapper.vm.activeResultType.id).toBe('speaking')

        const row = wrapper.vm.filteredRows[0]
        row.assessmentValues['speaking'] = 'A'
        row.isDirty = true

        client.put.mockResolvedValueOnce({ data: { success: true } })
        await wrapper.vm.saveSingleRow(row)

        expect(client.put).toHaveBeenCalledWith(
            '/update-grade/enroll-1',
            expect.objectContaining({
                resultType: 'speaking',
                value: 'A',
            })
        )
        expect(row.isDirty).toBe(false)
    })

    it('toggles lock on a grade', async () => {
        await mountPage([enrollmentItem()])
        client.post.mockResolvedValueOnce({ data: { success: true } })
        client.put.mockResolvedValueOnce({ data: { success: true } })

        const row = wrapper.vm.filteredRows[0]

        // Lock
        await wrapper.vm.toggleLock('stu-1', 'course-1', false, 'enroll-1', row)
        expect(client.post).toHaveBeenCalledWith('/teacher/lock-grade', {
            studentId: 'stu-1',
            courseId: 'course-1',
            enrollmentId: 'enroll-1',
        })
        expect(row.course.locked).toBe(true)

        // Unlock (admin)
        await wrapper.vm.toggleLock('stu-1', 'course-1', true, 'enroll-1', row)
        expect(client.put).toHaveBeenCalledWith('/admin/unlock-grade', {
            studentId: 'stu-1',
            courseId: 'course-1',
            enrollmentId: 'enroll-1',
        })
        expect(row.course.locked).toBe(false)
    })

    it('provides helper functions for display and formatting', async () => {
        await mountPage([
            enrollmentItem({
                student: { _id: 's1', name: 'Anna', teacherId: { userId: { username: 'TeacherBob' } } },
                courseInstance: {
                    _id: 'ci-1',
                    courseCode: 'ENGENG05',
                    courseName: 'Engelska 5',
                    responsibleTeacher: { userId: { username: 'TeacherAlice' } },
                },
                gradeDate: '2025-05-10T12:00:00.000Z',
            }),
        ])

        const row = wrapper.vm.filteredRows[0]
        expect(wrapper.vm.getTeacherDisplay(row)).toBe('TeacherAlice')
        expect(wrapper.vm.formatDateTime('2025-05-10T12:00:00.000Z')).toBe('2025-05-10')
        expect(wrapper.vm.formatDateTime(null)).toBe('–')

        // Teacher fallback
        expect(wrapper.vm.getTeacherDisplay({ course: { teacherName: 'Ej tilldelad' }, student: { teacherId: { userId: { username: 'TeacherBob' } } } })).toBe('TeacherBob')
        expect(wrapper.vm.getTeacherDisplay({ course: { teacherName: 'Ej tilldelad' }, student: {} })).toBe('Lärare')

        // Status labels & colors
        expect(wrapper.vm.getStatusLabel(row)).toBe('Saknas')
        expect(wrapper.vm.getStatusColor(row)).toBe('default')

        row.course.grade = 'A'
        expect(wrapper.vm.getStatusLabel(row)).toBe('✓ Sparat')
        expect(wrapper.vm.getStatusColor(row)).toBe('success')

        row.course.grade = 'F'
        expect(wrapper.vm.getStatusColor(row)).toBe('error')

        row.isDirty = true
        expect(wrapper.vm.getStatusLabel(row)).toBe('● Osparad')
        expect(wrapper.vm.getStatusColor(row)).toBe('amber-darken-3')

        row.course.locked = true
        expect(wrapper.vm.getStatusLabel(row)).toBe('🔒 Låst')
        expect(wrapper.vm.getStatusColor(row)).toBe('grey-darken-1')

        // getDisplayValue
        expect(wrapper.vm.getDisplayValue(row)).toBe('F')
        wrapper.vm.activeResultTypeId = 'national_test'
        row.assessmentValues = { national_test: 95 }
        expect(wrapper.vm.getDisplayValue(row)).toBe(95)
    })

    it('opens student detail and handles detail drawer interactions', async () => {
        await mountPage([enrollmentItem()])
        const row = wrapper.vm.filteredRows[0]

        wrapper.vm.openStudentDetail(row)
        expect(wrapper.vm.detailDrawerOpen).toBe(true)
        expect(wrapper.vm.activeDetailRow).toBe(row)

        wrapper.vm.closeDetailDrawer()
        expect(wrapper.vm.detailDrawerOpen).toBe(false)
        expect(wrapper.vm.activeDetailRow).toBeNull()
    })

    it('handles keyboard navigation and beforeunload guard', async () => {
        await mountPage([
            enrollmentItem({ student: { _id: 's1', name: 'A' } }),
            enrollmentItem({ student: { _id: 's2', name: 'B' } }),
        ])

        const fakeInput = document.createElement('input')
        fakeInput.id = 'input-grade-1'
        document.body.appendChild(fakeInput)
        const focusSpy = vi.spyOn(fakeInput, 'focus')

        wrapper.vm.handleEnterKey(wrapper.vm.filteredRows[0], 0)
        expect(focusSpy).toHaveBeenCalled()
        fakeInput.remove()

        // handleBeforeUnload when not dirty
        const e1 = { preventDefault: vi.fn(), returnValue: null }
        wrapper.vm.handleBeforeUnload(e1)
        expect(e1.preventDefault).not.toHaveBeenCalled()

        // handleBeforeUnload when dirty
        wrapper.vm.filteredRows[0].isDirty = true
        const e2 = { preventDefault: vi.fn(), returnValue: null }
        wrapper.vm.handleBeforeUnload(e2)
        expect(e2.preventDefault).toHaveBeenCalled()
    })

    it('handles term and course filter changes and npScore changes', async () => {
        await mountPage([enrollmentItem()])
        const row = wrapper.vm.filteredRows[0]

        // onNpScoreChange
        client.get.mockResolvedValueOnce({ data: { grade: 'B', hasScale: true } })
        row.course.npScore = 75
        await wrapper.vm.onNpScoreChange(row)
        expect(row.isDirty).toBe(true)

        // onTermChange and onCourseChange
        wrapper.vm.selectedTerm = 'VT25'
        wrapper.vm.onTermChange()
        expect(wrapper.vm.selectedCourseId).toBeDefined()

        wrapper.vm.onCourseChange()
        expect(wrapper.vm.activeResultTypeId).toBe('final_grade')
    })

    it('handles saveGrade validation errors and toggleLock errors', async () => {
        await mountPage([enrollmentItem()])
        const course = wrapper.vm.studentsToGrade[0].coursesToGrade[0]

        // Missing grade
        course.grade = ''
        await wrapper.vm.saveGrade('stu-1', course)

        // Missing reason
        course.grade = 'B'
        course.reason = ''
        await wrapper.vm.saveGrade('stu-1', course)

        // toggleLock failure
        client.post.mockRejectedValueOnce(new Error('Network error'))
        await wrapper.vm.toggleLock('stu-1', 'course-1', false, 'enroll-1', wrapper.vm.filteredRows[0])
    })
})

