import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CertificateManager from '@/views/Admin/CertificateManager.vue'

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
    normalizeError: (err) => ({
        status: err?.status ?? null,
        message: err?.message || 'Ett fel uppstod.',
        code: 'HTTP_500',
    }),
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

const settingsFixture = () => ({
    signerName: 'Rektor Anna',
    signerTitle: 'Rektor',
    schoolName: 'Mindful',
    logoUrl: '/api/certificates/media/logo1',
    signatureUrl: '/api/certificates/media/sig1',
})

const templateFixture = (key, overrides = {}) => ({
    key,
    name: key === 'diplom' ? 'Diplom' : 'Studieintyg',
    title: key === 'diplom' ? 'Diplom' : 'Studieintyg',
    subtitle: 'Sub',
    bodyPrefix: 'Prefix',
    footerText: 'Footer',
    html: '<p>{{studentName}}</p>',
    orientation: key === 'diplom' ? 'landscape' : 'portrait',
    showGrade: true,
    showApl: true,
    showPackage: true,
    isActive: true,
    ...overrides,
})

describe('CertificateManager.vue - Intyg & Diplom', () => {
    let wrapper

    const mountPage = async () => {
        client.get.mockImplementation((url) => {
            if (url === '/certificates/settings') {
                return Promise.resolve({ data: settingsFixture() })
            }
            if (url === '/certificates/templates') {
                return Promise.resolve({ data: [templateFixture('diplom'), templateFixture('studieintyg')] })
            }
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })
        wrapper = mount(CertificateManager)
        await wrapper.vm.$nextTick()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()
    }

    beforeEach(() => {
        vi.resetAllMocks()
        client.put.mockResolvedValue({ data: {} })
        client.post.mockResolvedValue({ data: {} })
        client.delete.mockResolvedValue({ data: { signatureUrl: null, logoUrl: null } })
    })

    it('loads settings and templates on mount', async () => {
        await mountPage()
        expect(wrapper.vm.settings.signerName).toBe('Rektor Anna')
        expect(wrapper.vm.templates.length).toBe(2)
        expect(wrapper.vm.currentTemplate.key).toBe('diplom')
    })

    it('saves settings', async () => {
        await mountPage()
        client.put.mockResolvedValue({ data: { ...settingsFixture(), signerName: 'Ny Rektor' } })
        wrapper.vm.settings.signerName = 'Ny Rektor'
        await wrapper.vm.saveSettings()
        expect(client.put).toHaveBeenCalledWith('/certificates/settings', {
            signerName: 'Ny Rektor',
            signerTitle: 'Rektor',
            schoolName: 'Mindful',
        })
    })

    it('saves a template', async () => {
        await mountPage()
        await wrapper.vm.saveTemplate()
        expect(client.put).toHaveBeenCalledWith(
            '/certificates/templates/diplom',
            expect.objectContaining({ title: 'Diplom' })
        )
    })

    it('renders preview using the template renderer', async () => {
        await mountPage()
        wrapper.vm.preview.studentName = 'Test Elev'
        const doc = wrapper.vm.previewDoc
        expect(doc).toContain('Test Elev')
    })

    it('loads approval queue candidates', async () => {
        await mountPage()
        client.get.mockImplementation((url) => {
            if (url === '/certificates/settings') {
                return Promise.resolve({ data: settingsFixture() })
            }
            if (url === '/certificates/templates') {
                return Promise.resolve({ data: [templateFixture('diplom'), templateFixture('studieintyg')] })
            }
            if (url === '/certificates/candidates') {
                return Promise.resolve({
                    data: {
                        candidates: [
                            {
                                key: 'k1',
                                enrollmentId: 'e1',
                                studentName: 'Anna Testsson',
                                personalNumber: '199001011234',
                                courseName: 'Svenska 1',
                                packageName: 'Paket A',
                                eligible: true,
                                record: { _id: 'r1', status: 'draft' },
                            },
                        ],
                        total: 1,
                        totalPages: 1,
                    },
                })
            }
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })
        wrapper.vm.tab = 'approve'
        await wrapper.vm.$nextTick()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.queueCandidates.length).toBe(1)
        expect(wrapper.vm.queueCandidates[0].studentName).toBe('Anna Testsson')
    })

    it('generates a record from the queue and triggers a download update', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/certificates/settings') {
                return Promise.resolve({ data: settingsFixture() })
            }
            if (url === '/certificates/templates') {
                return Promise.resolve({ data: [templateFixture('diplom'), templateFixture('studieintyg')] })
            }
            if (url === '/certificates/candidates') {
                return Promise.resolve({
                    data: { candidates: [], total: 0, totalPages: 0 },
                })
            }
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })
        await mountPage()
        client.post.mockResolvedValue({ data: { _id: 'r1', status: 'generated' } })
        await wrapper.vm.generateRecord({ _id: 'r1' })
        expect(client.post).toHaveBeenCalledWith('/certificates/r1/generate')
    })

    it('loads history records with filters', async () => {
        await mountPage()
        client.get.mockImplementation((url) => {
            if (url === '/certificates/settings') {
                return Promise.resolve({ data: settingsFixture() })
            }
            if (url === '/certificates/templates') {
                return Promise.resolve({ data: [templateFixture('diplom'), templateFixture('studieintyg')] })
            }
            if (url === '/certificates') {
                return Promise.resolve({
                    data: {
                        records: [
                            {
                                _id: 'r1',
                                studentName: 'Anna Testsson',
                                type: 'studieintyg',
                                courseName: 'Svenska 1',
                                status: 'generated',
                                certificateNumber: 'ML-2026-00001',
                                createdAt: '2026-01-01T00:00:00.000Z',
                            },
                        ],
                        total: 1,
                        totalPages: 1,
                    },
                })
            }
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })
        wrapper.vm.tab = 'history'
        await wrapper.vm.$nextTick()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.histRecords.length).toBe(1)
        expect(wrapper.vm.histRecords[0].certificateNumber).toBe('ML-2026-00001')
    })
})
