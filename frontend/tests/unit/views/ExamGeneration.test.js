import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExamGeneration from '@/views/Admin/QuestionBank/ExamGeneration.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

import client from '@/api/client.js'

const course = { _id: 'course-1', courseName: 'Matematik 1' }
const questions = [
    { _id: 'q-1', questionText: 'Vad är 2+2?', subject: 'Matematik', questionType: 'multipleChoice', difficulty: 'easy' },
    { _id: 'q-2', questionText: 'Är jorden rund?', subject: 'Naturkunskap', questionType: 'trueFalse', difficulty: 'medium' },
]

const mountView = async () => {
    const wrapper = mount(ExamGeneration)
    await new Promise((r) => setTimeout(r, 0))
    return wrapper
}

describe('ExamGeneration.vue – question-bank integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        client.get.mockImplementation((url) => {
            if (url === '/course-bank/courses') {
                return Promise.resolve({ data: { courses: [course] } })
            }
            if (url.startsWith('/question-bank/by-course/')) {
                return Promise.resolve({ data: { questions } })
            }
            return Promise.resolve({ data: {} })
        })
        client.post.mockResolvedValue({
            data: { examAttemptId: 'attempt-1', title: 'Prov 1', courseId: 'course-1', totalAvailable: 2 },
        })
        client.put.mockResolvedValue({ data: { examAttempt: { _id: 'attempt-1' } } })
    })

    it('loads available courses on mount', async () => {
        const wrapper = await mountView()
        expect(client.get).toHaveBeenCalledWith('/course-bank/courses')
        expect(wrapper.vm.availableCourses).toEqual([course])
        wrapper.unmount()
    })

    it('loads questions with the by-course endpoint and applies the selected filters', async () => {
        const wrapper = await mountView()
        wrapper.vm.selectedCourse = 'course-1'
        wrapper.vm.selectedSubject = 'Matematik'
        wrapper.vm.selectedType = 'multipleChoice'
        await wrapper.vm.loadQuestions()
        await new Promise((r) => setTimeout(r, 0))
        expect(client.get).toHaveBeenCalledWith(
            '/question-bank/by-course/course-1?subject=Matematik&questionType=multipleChoice'
        )
        expect(wrapper.vm.availableQuestions).toEqual(questions)
        expect(wrapper.vm.selectedQuestions['q-1']).toBe(false)
        wrapper.unmount()
    })

    it('clears questions when no course is selected', async () => {
        const wrapper = await mountView()
        wrapper.vm.availableQuestions = [questions[0]]
        await wrapper.vm.loadQuestions()
        expect(wrapper.vm.availableQuestions).toEqual([])
        expect(wrapper.vm.selectedQuestions).toEqual({})
        wrapper.unmount()
    })

    it('generates an exam and persists the exact question selection', async () => {
        const wrapper = await mountView()
        wrapper.vm.selectedCourse = 'course-1'
        wrapper.vm.selectedSubject = 'Matematik'
        wrapper.vm.selectedType = 'Alla'
        wrapper.vm.examTitle = 'Prov 1'
        await wrapper.vm.loadQuestions()
        await new Promise((r) => setTimeout(r, 0))
        wrapper.vm.selectedQuestions['q-1'] = true
        wrapper.vm.selectedQuestions['q-2'] = false

        await wrapper.vm.generateExam()

        expect(client.post).toHaveBeenCalledWith('/question-bank/generate-exam', {
            courseId: 'course-1',
            subject: 'Matematik',
            questionType: 'Alla',
            numberOfQuestions: 1,
        })
        expect(client.put).toHaveBeenCalledWith('/question-bank/exam-attempts/attempt-1/questions', {
            questionIds: ['q-1'],
        })
        expect(wrapper.vm.generatedExam).toMatchObject({
            examAttemptId: 'attempt-1',
            questions: ['q-1'],
            questionTexts: ['Vad är 2+2?'],
            questionTypes: ['multipleChoice'],
        })
        wrapper.unmount()
    })

    it('shows an error when no questions are selected', async () => {
        const wrapper = await mountView()
        await wrapper.vm.generateExam()
        expect(client.post).not.toHaveBeenCalled()
        expect(wrapper.vm.generatedExam).toBeNull()
        wrapper.unmount()
    })

    it('clears the preview when saving the exam', async () => {
        const wrapper = await mountView()
        wrapper.vm.selectedCourse = 'course-1'
        await wrapper.vm.loadQuestions()
        await new Promise((r) => setTimeout(r, 0))
        wrapper.vm.selectedQuestions['q-1'] = true
        await wrapper.vm.generateExam()
        expect(wrapper.vm.generatedExam).not.toBeNull()

        await wrapper.vm.saveExam()
        expect(wrapper.vm.generatedExam).toBeNull()
        expect(wrapper.vm.selectedQuestions['q-1']).toBe(false)
        wrapper.unmount()
    })

    it('uses the selected question text for the preview labels', async () => {
        const wrapper = await mountView()
        expect(wrapper.vm.typeLabel('essay')).toBe('Essayfråga')
        expect(wrapper.vm.difficultyLabel('hard')).toBe('Svår')
        expect(wrapper.vm.difficultyColor('easy')).toBe('green')
        wrapper.unmount()
    })
})