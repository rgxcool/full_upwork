import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AplCompletedTab from '@/views/Admin/AplCompletedTab.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
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

import client from '@/api/client.js'

const record = (overrides = {}) => ({
    _id: 'record-1',
    studentId: {
        _id: 'student-1',
        name: 'Anna Elev',
        email: 'anna@example.se',
    },
    status: 'GREEN',
    placementCompany: 'North Clinic',
    internshipStartDate: '2026-01-15T00:00:00.000Z',
    completedAt: '2026-02-15T00:00:00.000Z',
    cvDocId: { _id: 'cv-1' },
    contractDocId: { _id: 'contract-1' },
    notes: 'Avslutad praktik',
    ...overrides,
})

const mountTab = async () => {
    const wrapper = mount(AplCompletedTab, {
        global: {
            stubs: {
                'router-link': { template: '<a><slot /></a>' },
            },
        },
    })
    await flushPromises()
    return wrapper
}

describe('AplCompletedTab.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('loads completed APL records and displays their details', async () => {
        client.get.mockResolvedValueOnce({ data: [record()] })

        const wrapper = await mountTab()

        expect(client.get).toHaveBeenCalledWith('/apl/records', {
            params: { status: 'GREEN' },
        })
        expect(wrapper.text()).toContain('Anna Elev')
        expect(wrapper.text()).toContain('North Clinic')
        expect(wrapper.text()).toContain('anna@example.se')
        expect(wrapper.text()).toContain('CV uppladdat')
        expect(wrapper.text()).toContain('Avtal mottaget')
        expect(wrapper.text()).toContain('Avslutad praktik')
    })

    it('filters completed records by student or placement name', async () => {
        client.get.mockResolvedValueOnce({
            data: [
                record(),
                record({
                    _id: 'record-2',
                    studentId: { _id: 'student-2', name: 'Bengt Elev' },
                    placementCompany: 'South Clinic',
                }),
            ],
        })

        const wrapper = await mountTab()
        wrapper.vm.search = 'south'
        await wrapper.vm.$nextTick()

        expect(wrapper.vm.filteredRecords.map((item) => item.studentId.name)).toEqual([
            'Bengt Elev',
        ])
    })

    it('shows an empty state when loading completed records fails', async () => {
        client.get.mockRejectedValueOnce(new Error('request failed'))

        const wrapper = await mountTab()

        expect(wrapper.text()).toContain('Inga avslutade praktiker')
    })

    it('removes a contract and reloads the completed list', async () => {
        client.get
            .mockResolvedValueOnce({ data: [record()] })
            .mockResolvedValueOnce({ data: [] })
        client.put.mockResolvedValueOnce({ data: {} })

        const wrapper = await mountTab()
        await wrapper.vm.toggleContract(record(), false)

        expect(client.put).toHaveBeenCalledWith('/apl/records/student-1', {
            contractDocId: null,
        })
        expect(client.get).toHaveBeenCalledTimes(2)
        expect(mockToast.success).toHaveBeenCalledWith('Avtal borttaget.')
    })

    it('uploads a contract, saves its document id, and reloads the list', async () => {
        client.get
            .mockResolvedValueOnce({ data: [record()] })
            .mockResolvedValueOnce({ data: [record()] })
        client.post.mockResolvedValueOnce({
            data: { document: { _id: 'new-contract' } },
        })
        client.put.mockResolvedValueOnce({ data: {} })
        const file = new File(['contract'], 'contract.pdf', {
            type: 'application/pdf',
        })
        const event = { target: { files: [file], value: 'contract.pdf' } }

        const wrapper = await mountTab()
        await wrapper.vm.handleContractFile(record(), event)

        expect(client.post).toHaveBeenCalledWith(
            '/documents/upload',
            expect.any(FormData),
            { headers: { 'Content-Type': 'multipart/form-data' } },
        )
        expect(client.put).toHaveBeenCalledWith('/apl/records/student-1', {
            contractDocId: 'new-contract',
        })
        expect(event.target.value).toBe('')
        expect(mockToast.success).toHaveBeenCalledWith('Kontrakt uppladdat.')
    })
})
