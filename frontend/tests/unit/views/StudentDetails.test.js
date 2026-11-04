import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'vuex'

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        useRoute: () => ({ params: { id: 'student-1' }, query: {} }),
    }
})

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
import StudentDetails from '@/views/Student/StudentDetails.vue'

const buildStore = () => createStore({
    state: {
        user: { _id: 'u1', userId: 'u1', email: 'larare@example.se', role: 'teacher', roles: ['teacher'] },
    },
    getters: {
        isAdmin: () => false,
        isSystemAdmin: () => false,
        userRole: () => 'teacher',
    },
})

const mountDetails = async (student) => {
    client.get.mockResolvedValue({ data: student })
    const wrapper = shallowMount(StudentDetails, {
        global: { plugins: [buildStore()] },
    })
    await flushPromises()
    return wrapper
}

describe('StudentDetails Dokument tab', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        client.get.mockReset()
    })

    it('always shows a Dokument tab, even without completed enrollments', async () => {
        const wrapper = await mountDetails({
            _id: 'student-1',
            name: 'Syntetisk Elev',
            email: 'elev@example.se',
            education: [],
            enrollments: [],
            aplStatus: 'GRAY',
        })

        const labels = wrapper.findAll('.nav-link').map((link) => link.text())

        expect(labels).toContain('Dokument')
        expect(labels).not.toContain('Filarkiv')
    })

    it('keeps the Dokument tab when the student has completed enrollments', async () => {
        const wrapper = await mountDetails({
            _id: 'student-1',
            name: 'Syntetisk Elev',
            email: 'elev@example.se',
            education: [],
            enrollments: [{ _id: 'e1', status: 'completed' }],
            aplStatus: 'GRAY',
        })

        const labels = wrapper.findAll('.nav-link').map((link) => link.text())

        expect(labels.filter((label) => label === 'Dokument')).toHaveLength(1)
        expect(labels).not.toContain('Filarkiv')
    })
})
