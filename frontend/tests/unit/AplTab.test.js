import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'vuex'
import AplTab from '@/views/Student/tabs/AplTab.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        patch: vi.fn(),
        put: vi.fn(),
        post: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

const mockToast = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => mockToast,
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
}))

import client from '@/api/client.js'

const student = { _id: 'student-1', name: 'Anna Elev' }

const buildStore = (userRole = 'teacher') => createStore({
    state: { user: { role: userRole } },
    getters: { userRole: () => userRole },
})

const mountTab = async ({ userRole = 'teacher', studentProp = student } = {}) => {
    const wrapper = mount(AplTab, {
        props: { student: studentProp },
        global: { plugins: [buildStore(userRole)] },
    })
    await flushPromises()
    return wrapper
}

describe('AplTab.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('loads and displays the student APL record', async () => {
        client.get.mockResolvedValueOnce({
            data: {
                status: 'RED',
                aplStatusAuto: true,
                aplWeeksRemaining: 2,
                aplStartDate: '2026-05-01T00:00:00.000Z',
                aplEndDate: '2026-07-01T00:00:00.000Z',
            },
        })

        const wrapper = await mountTab()

        expect(client.get).toHaveBeenCalledWith('/apl/records/student-1')
        expect(wrapper.find('.apl-period-row').exists()).toBe(true)
        expect(wrapper.text()).toContain('APL-period')
        expect(wrapper.text()).toContain('2026-05-01')
        expect(wrapper.text()).toContain('2 veckor')
        expect(wrapper.find('.auto-red-note').exists()).toBe(true)
    })

    it('lets a coordinator change the status and reloads the record', async () => {
        client.get
            .mockResolvedValueOnce({ data: { status: 'GRAY' } })
            .mockResolvedValueOnce({ data: { status: 'BLUE' } })
        client.patch.mockResolvedValueOnce({ data: {} })

        const wrapper = await mountTab({ userRole: 'coordinator' })
        await wrapper.find('.status-select').setValue('BLUE')
        await flushPromises()

        expect(client.patch).toHaveBeenCalledWith('/apl/records/student-1/status', {
            status: 'BLUE',
        })
        expect(client.get).toHaveBeenCalledTimes(2)
        expect(mockToast.success).toHaveBeenCalledWith('APL-status uppdaterad')
        expect(wrapper.text()).toContain('Blå — Kontaktad')
    })

    it('filters the global record list by student name and placement', async () => {
        client.get.mockResolvedValueOnce({
            data: [
                {
                    status: 'GREEN',
                    studentId: { _id: 'student-1', name: 'Anna Elev' },
                    placementCompany: 'North Clinic',
                },
                {
                    status: 'RED',
                    studentId: { _id: 'student-2', name: 'Bengt Elev' },
                    placementCompany: 'South Clinic',
                },
            ],
        })

        const wrapper = await mountTab({ studentProp: null })
        expect(wrapper.vm.filteredRecords).toHaveLength(2)

        wrapper.vm.search = 'north'
        await wrapper.vm.$nextTick()

        expect(wrapper.vm.filteredRecords.map((record) => record.studentId.name)).toEqual([
            'Anna Elev',
        ])
    })

    it('toggles a status filter on the global record list', async () => {
        client.get.mockResolvedValueOnce({
            data: [
                { status: 'GREEN', studentId: { name: 'Anna Elev' } },
                { status: 'RED', studentId: { name: 'Bengt Elev' } },
            ],
        })

        const wrapper = await mountTab({ studentProp: null })
        wrapper.vm.toggleFilter('RED')
        await wrapper.vm.$nextTick()

        expect(wrapper.vm.filteredRecords.map((record) => record.status)).toEqual(['RED'])
        expect(wrapper.vm.statusCounts).toEqual({ GREEN: 1, RED: 1 })

        wrapper.vm.toggleFilter('RED')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.filteredRecords).toHaveLength(2)
    })

    it('shows the no-record state when the student record request fails', async () => {
        client.get.mockRejectedValueOnce(new Error('request failed'))

        const wrapper = await mountTab({ userRole: 'coordinator' })

        expect(wrapper.text()).toContain('Ingen APL-registrering hittades för denna elev.')
        expect(wrapper.text()).toContain('Skapa APL-registrering')
    })

    it('saves placement details and reports success', async () => {
        client.get
            .mockResolvedValueOnce({ data: { status: 'BLUE' } })
            .mockResolvedValueOnce({ data: { status: 'BLUE', placementCompany: 'North Clinic' } })
        client.put.mockResolvedValueOnce({ data: {} })

        const wrapper = await mountTab({ userRole: 'coordinator' })
        wrapper.vm.editForm.placementCompany = 'North Clinic'
        wrapper.vm.editForm.internshipStartDate = ''
        await wrapper.vm.saveRecordDetails()
        await flushPromises()

        expect(client.put).toHaveBeenCalledWith('/apl/records/student-1', {
            placementCompany: 'North Clinic',
            placementContact: '',
            placementAddress: '',
            internshipStartDate: null,
            internshipEndDate: null,
            notes: '',
            requirements: '',
        })
        expect(mockToast.success).toHaveBeenCalledWith('APL-detaljer sparade')
    })

    it('saves a student seeking-status change', async () => {
        client.get.mockResolvedValueOnce({ data: { status: 'BLUE', isSeeking: false } })
        client.patch.mockResolvedValueOnce({ data: {} })

        const wrapper = await mountTab({ userRole: 'student' })
        wrapper.vm.seeking = true
        await wrapper.vm.toggleSeeking()

        expect(client.patch).toHaveBeenCalledWith('/apl/my', { isSeeking: true })
        expect(mockToast.success).toHaveBeenCalledWith(
            'Du är registrerad som arbetssökande',
        )
    })

    it('runs auto-transition and reloads the global records', async () => {
        client.get
            .mockResolvedValueOnce({ data: [] })
            .mockResolvedValueOnce({ data: [] })
        client.post.mockResolvedValueOnce({ data: { transitions: [{}, {}] } })

        const wrapper = await mountTab({ studentProp: null })
        await wrapper.vm.runAutoTransition()

        expect(client.post).toHaveBeenCalledWith('/apl/auto-transition')
        expect(client.get).toHaveBeenCalledTimes(2)
        expect(mockToast.success).toHaveBeenCalledWith('2 automatisk(a) övergång(ar)')
    })

    it('creates a record when a coordinator has no student record', async () => {
        client.get
            .mockRejectedValueOnce(new Error('not found'))
            .mockResolvedValueOnce({ data: { status: 'GRAY' } })
        client.put.mockResolvedValueOnce({ data: {} })

        const wrapper = await mountTab({ userRole: 'coordinator' })
        await wrapper.vm.createRecord()
        await flushPromises()

        expect(client.put).toHaveBeenCalledWith('/apl/records/student-1', {})
        expect(mockToast.success).toHaveBeenCalledWith('APL-registrering skapad')
        expect(wrapper.text()).not.toContain('Ingen APL-registrering hittades')
    })

    it('uploads a student CV and associates it with the self-service record', async () => {
        client.get
            .mockResolvedValueOnce({ data: { status: 'BLUE' } })
            .mockResolvedValueOnce({ data: { status: 'BLUE', cvDocId: { filename: 'cv.pdf' } } })
        client.post.mockResolvedValueOnce({ data: { document: { _id: 'cv-1' } } })
        client.patch.mockResolvedValueOnce({ data: {} })
        const file = new File(['resume'], 'cv.pdf', { type: 'application/pdf' })
        const event = { target: { files: [file], value: 'cv.pdf' } }

        const wrapper = await mountTab({ userRole: 'student' })
        await wrapper.vm.handleCvUpload(event)
        await flushPromises()

        expect(client.post).toHaveBeenCalledWith(
            '/documents/upload',
            expect.any(FormData),
            { headers: { 'Content-Type': 'multipart/form-data' } },
        )
        expect(client.patch).toHaveBeenCalledWith('/apl/my', { cvDocId: 'cv-1' })
        expect(event.target.value).toBe('')
        expect(mockToast.success).toHaveBeenCalledWith('CV uppladdat')
    })

    it('uploads a contract and associates it with the student record', async () => {
        client.get
            .mockResolvedValueOnce({ data: { status: 'BLUE' } })
            .mockResolvedValueOnce({ data: { status: 'BLUE', contractDocId: { filename: 'contract.pdf' } } })
        client.post.mockResolvedValueOnce({ data: { _id: 'contract-1' } })
        client.put.mockResolvedValueOnce({ data: {} })
        const file = new File(['contract'], 'contract.pdf', { type: 'application/pdf' })
        const event = { target: { files: [file], value: 'contract.pdf' } }

        const wrapper = await mountTab({ userRole: 'coordinator' })
        await wrapper.vm.handleContractUpload(event)
        await flushPromises()

        expect(client.put).toHaveBeenCalledWith('/apl/records/student-1', {
            contractDocId: 'contract-1',
        })
        expect(event.target.value).toBe('')
        expect(mockToast.success).toHaveBeenCalledWith('Kontrakt uppladdat')
    })
})
