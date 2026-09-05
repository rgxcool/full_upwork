import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudyPlanRevisionModal from '../../src/views/Student/StudyPlanRevisionModal.vue'

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

import client from '@/api/client.js'

const mockToast = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => mockToast,
}))

const enrollments = [
    {
        enrollmentId: 'enroll-1',
        name: 'Matematik 1',
        startDate: '2025-01-06T00:00:00.000Z',
        endDate: '2025-01-31T00:00:00.000Z',
    },
    {
        enrollmentId: 'enroll-2',
        name: 'Svenska 1',
        startDate: '',
        endDate: '',
    },
]

const VDialogStub = {
    name: 'VDialog',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="v-dialog-stub"><slot /></div>',
}

const props = {
    modelValue: true,
    student: { _id: 'stu-1', name: 'Anna Elev' },
    activeEnrollments: enrollments,
    currentTempo: 5,
}

describe('StudyPlanRevisionModal.vue', () => {
    let wrapper

    const mountModal = async (overrides = {}) => {
        wrapper = mount(StudyPlanRevisionModal, {
            props: { ...props, ...overrides },
            global: {
                stubs: { VDialog: VDialogStub },
            },
        })
        await wrapper.vm.$nextTick()
    }

    const reasonSelect = () => wrapper.find('select.revision-select')
    const tempoSelect = () => wrapper.findAll('select.revision-select')[1]
    const submitButton = () => {
        const buttons = wrapper.findAll('.revision-modal__actions button')
        return buttons[buttons.length - 1]
    }

    beforeEach(() => {
        vi.resetAllMocks()
        client.post.mockResolvedValue({ data: { success: true } })
    })

    it('renders reason options and formats enrollment dates', async () => {
        await mountModal()

        expect(wrapper.findAll('select.revision-select option')).toHaveLength(7)
        expect(reasonSelect().element.value).toBe('')
        expect(wrapper.find('.revision-summary').exists()).toBe(false)
    })

    it('resetForm runs when the dialog opens', async () => {
        await mountModal({ modelValue: false })
        reasonSelect().setValue('pace_change')
        await wrapper.vm.$nextTick()
        tempoSelect().setValue(20)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.revision-summary').exists()).toBe(true)

        await wrapper.setProps({ modelValue: true })
        await wrapper.vm.$nextTick()

        expect(reasonSelect().element.value).toBe('')
        expect(wrapper.find('.revision-summary').exists()).toBe(false)
    })

    it('pace_change requires a different tempo and submits tempoWeeks', async () => {
        await mountModal()

        reasonSelect().setValue('pace_change')
        await wrapper.vm.$nextTick()

        expect(wrapper.find('.revision-summary').exists()).toBe(false)
        tempoSelect().setValue(20)
        await wrapper.vm.$nextTick()

        expect(wrapper.text()).toContain('Tempo ändras från 5v till 20v')

        await submitButton().trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(client.post).toHaveBeenCalledTimes(1)
        expect(client.post).toHaveBeenCalledWith('/student-details/stu-1/revise-studyplan', {
            revisionReason: 'pace_change',
            description: '',
            changes: { tempoWeeks: 20 },
        })
        expect(mockToast.success).toHaveBeenCalledWith('Studieplanen har reviderats!')
        expect(wrapper.emitted('revised')).toHaveLength(1)
        expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
        expect(reasonSelect().element.value).toBe('')
    })

    it('course_removed collects checked enrollments and submits with description', async () => {
        await mountModal()
        client.post.mockResolvedValue({ data: { success: true } })

        reasonSelect().setValue('course_removed')
        await wrapper.vm.$nextTick()

        await wrapper.find('.revision-textarea').setValue('Kursen utgår')
        const boxes = wrapper.findAll('.revision-course-option input[type="checkbox"]')
        expect(boxes).toHaveLength(2)
        await boxes[0].setValue(true)
        expect(wrapper.text()).toContain('1 kurs tas bort')

        await submitButton().trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(client.post).toHaveBeenCalledWith('/student-details/stu-1/revise-studyplan', {
            revisionReason: 'course_removed',
            description: 'Kursen utgår',
            changes: { removeEnrollmentIds: ['enroll-1'] },
        })
    })

    it('date_adjustment submits adjusted start/end dates', async () => {
        await mountModal()
        client.post.mockResolvedValue({ data: { success: true } })

        reasonSelect().setValue('date_adjustment')
        await wrapper.vm.$nextTick()

        expect(wrapper.find('.revision-summary').exists()).toBe(false)
        const inputs = wrapper.findAll('.revision-date-input')
        expect(inputs).toHaveLength(4)
        await inputs[0].setValue('2025-02-01')
        await inputs[1].setValue('2025-02-28')
        expect(wrapper.text()).toContain('Datum justeras för 1 kurs')

        await submitButton().trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(client.post).toHaveBeenCalledWith('/student-details/stu-1/revise-studyplan', {
            revisionReason: 'date_adjustment',
            description: '',
            changes: {
                dateAdjustments: [
                    { enrollmentId: 'enroll-1', startDate: '2025-02-01', endDate: '2025-02-28' },
                ],
            },
        })
    })

    it('manual reasons never enable changes and never submit', async () => {
        await mountModal()

for (const reason of ['course_added', 'package_swap', 'other']) {
            reasonSelect().setValue(reason)
            await wrapper.vm.$nextTick()
            expect(wrapper.find('.revision-summary').exists()).toBe(false)
            expect(wrapper.text()).toContain('systemadmin')
        }

        await submitButton().trigger('click')
        await wrapper.vm.$nextTick()
        expect(client.post).not.toHaveBeenCalled()
    })

    it('reports backend errors and keeps the dialog open', async () => {
        await mountModal()
        client.post.mockRejectedValue({ response: { data: { error: 'Något gick fel' } } })

        reasonSelect().setValue('pace_change')
        await wrapper.vm.$nextTick()
        tempoSelect().setValue(10)
        await wrapper.vm.$nextTick()

        await submitButton().trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(mockToast.error).toHaveBeenCalledWith('Något gick fel')
        expect(wrapper.emitted('revised')).toBeUndefined()
        expect(reasonSelect().element.value).toBe('pace_change')
    })

    it('falls back to the generic error message when the server sends none', async () => {
        await mountModal()
        client.post.mockRejectedValue(new Error('boom'))

        reasonSelect().setValue('pace_change')
        await wrapper.vm.$nextTick()
        tempoSelect().setValue(10)
        await wrapper.vm.$nextTick()

        await submitButton().trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(mockToast.error).toHaveBeenCalledWith('Kunde inte revidera studieplanen')
    })

    it('cancel button closes the dialog', async () => {
        await mountModal()

        const buttons = wrapper.findAll('.revision-modal__actions button')
        await buttons[0].trigger('click')

        expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
        expect(client.post).not.toHaveBeenCalled()
    })
})