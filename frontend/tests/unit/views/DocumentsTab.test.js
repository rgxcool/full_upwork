import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'vuex'
import DocumentsTab from '@/views/Student/tabs/DocumentsTab.vue'

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

const student = {
    _id: 'student-1',
    name: 'Syntetisk Elev',
    email: 'elev@example.se',
}

const buildStore = ({ user, userRole = 'teacher' } = {}) => createStore({
    state: {
        user: user || { _id: 'u1', userId: 'u1', name: 'Test User', email: 'test@example.se', roles: ['teacher'] },
    },
    getters: {
        userRole: () => userRole,
    },
})

const mountTab = async ({ documents = [], user, userRole = 'teacher', studentOverride } = {}) => {
    const store = buildStore({ user, userRole })
    client.get.mockResolvedValueOnce({ data: documents })

    const wrapper = mount(DocumentsTab, {
        props: { student: studentOverride || student },
        global: { plugins: [store] },
    })

    await flushPromises()
    return wrapper
}

const setFile = async (wrapper, file) => {
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
        value: [file],
        configurable: true,
    })
    await input.trigger('change')
    return input
}

describe('DocumentsTab.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        client.get.mockReset()
        client.post.mockReset()
        mockToast.success.mockReset()
        mockToast.error.mockReset()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('shows a loading state while documents are fetched', async () => {
        const store = buildStore()
        let resolveRequest
        client.get.mockReturnValueOnce(new Promise((resolve) => {
            resolveRequest = resolve
        }))

        const wrapper = mount(DocumentsTab, {
            props: { student },
            global: { plugins: [store] },
        })

        expect(wrapper.text()).toContain('Laddar dokument...')

        resolveRequest({ data: [] })
        await flushPromises()
        expect(wrapper.text()).toContain('Inga dokument uppladdade än.')
    })

    it('lists documents with name, date, uploader and file type', async () => {
        const wrapper = await mountTab({
            user: { _id: 'u1', userId: 'u1', email: 'admin@example.se', roles: ['admin'] },
            userRole: 'admin',
            documents: [
                {
                    _id: 'd1',
                    originalName: 'intyg.pdf',
                    createdAt: '2026-01-15T10:30:00.000Z',
                    fileType: 'pdf',
                    size: 2048,
                    uploadedBy: 'u2',
                    uploader: { _id: 'u2', name: 'Lärare Lisa' },
                },
            ],
        })

        expect(client.get).toHaveBeenCalledWith('/documents/student-1')
        expect(wrapper.text()).toContain('Dokument')
        expect(wrapper.text()).toContain('intyg.pdf')
        expect(wrapper.text()).toContain('2026')
        expect(wrapper.text()).toContain('Lärare Lisa')
        expect(wrapper.text()).toContain('PDF')
        expect(wrapper.text()).toContain('2.0 kB')
    })

    it('shows the empty state and the upload form for an authorized staff user', async () => {
        const wrapper = await mountTab({
            user: { _id: 'u1', userId: 'u1', email: 'admin@example.se', roles: ['admin'] },
            userRole: 'admin',
            documents: [],
        })

        expect(wrapper.text()).toContain('Inga dokument uppladdade än.')
        expect(wrapper.text()).toContain('Ladda upp dokument')
        expect(wrapper.find('input[type="file"]').exists()).toBe(true)
    })

    it('shows a permission error and no upload form when listing is forbidden', async () => {
        client.get.mockRejectedValueOnce(
            Object.assign(new Error('Forbidden'), {
                response: { status: 403, data: { message: 'Forbidden' } },
            })
        )

        const wrapper = mount(DocumentsTab, {
            props: { student },
            global: { plugins: [buildStore({
                user: { _id: 'u1', userId: 'u1', email: 'other@example.se', roles: ['student'] },
                userRole: 'student',
            })] },
        })
        await flushPromises()

        expect(wrapper.text()).toContain('Du har inte behörighet')
        expect(wrapper.text()).not.toContain('Ladda upp dokument')
    })

    it('retries fetching after an error', async () => {
        client.get
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce({ data: [] })

        const wrapper = mount(DocumentsTab, {
            props: { student },
            global: { plugins: [buildStore({
                user: { _id: 'u1', userId: 'u1', email: 'admin@example.se', roles: ['admin'] },
                userRole: 'admin',
            })] },
        })
        await flushPromises()

        expect(wrapper.text()).toContain('Kunde inte hämta dokumenten')

        const retry = wrapper.findAll('button').find((button) => button.text() === 'Försök igen')
        await retry.trigger('click')
        await flushPromises()

        expect(client.get).toHaveBeenCalledTimes(2)
        expect(wrapper.text()).toContain('Inga dokument uppladdade än.')
    })

    it('uploads a file for the selected student and refreshes the list', async () => {
        const wrapper = await mountTab({
            user: { _id: 'u1', userId: 'u1', email: 'admin@example.se', roles: ['admin'] },
            userRole: 'admin',
            documents: [],
        })

        const uploaded = {
            _id: 'd-new',
            originalName: 'nytt-cv.pdf',
            createdAt: '2026-02-01T09:00:00.000Z',
            fileType: 'pdf',
            uploader: { _id: 'u1', name: 'Test User' },
        }
        client.post.mockResolvedValueOnce({ data: uploaded })
        client.get.mockResolvedValueOnce({ data: [uploaded] })

        await setFile(wrapper, new File(['cv'], 'nytt-cv.pdf', { type: 'application/pdf' }))
        await wrapper.find('form').trigger('submit')
        await flushPromises()

        expect(client.post).toHaveBeenCalledTimes(1)
        const [url, formData] = client.post.mock.calls[0]
        expect(url).toBe('/documents/upload')
        expect(formData.get('studentId')).toBe('student-1')
        expect(formData.get('type')).toBe('GENERAL')
        expect(formData.get('file')).toBeInstanceOf(File)

        expect(client.get).toHaveBeenCalledTimes(2)
        expect(wrapper.text()).toContain('nytt-cv.pdf')
        expect(wrapper.text()).toContain('Dokumentet laddades upp.')
        expect(mockToast.success).toHaveBeenCalled()
    })

    it('validates the file extension before uploading', async () => {
        const wrapper = await mountTab({
            user: { _id: 'u1', userId: 'u1', email: 'admin@example.se', roles: ['admin'] },
            userRole: 'admin',
            documents: [],
        })

        await setFile(wrapper, new File(['payload'], 'payload.exe', { type: 'application/octet-stream' }))

        expect(wrapper.text()).toContain('Filtypen stöds inte')
        expect(client.post).not.toHaveBeenCalled()
    })

    it('downloads through the protected document endpoint', async () => {
        const doc = {
            _id: 'd1',
            originalName: 'intyg.pdf',
            createdAt: '2026-01-15T10:30:00.000Z',
            fileType: 'pdf',
            uploadedBy: 'u1',
        }

        const wrapper = await mountTab({
            user: { _id: 'u1', userId: 'u1', email: 'admin@example.se', roles: ['admin'] },
            userRole: 'admin',
            documents: [doc],
        })

        client.get.mockResolvedValueOnce({ data: new Blob(['pdf']) })
        const createObjectURL = vi.fn(() => 'blob:synthetic')
        const revokeObjectURL = vi.fn()
        vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

        const downloadButton = wrapper.findAll('button').find((button) => button.text() === 'Ladda ner')
        await downloadButton.trigger('click')
        await flushPromises()

        expect(client.get).toHaveBeenCalledWith('/documents/download/d1', { responseType: 'blob' })
        expect(createObjectURL).toHaveBeenCalled()
        expect(click).toHaveBeenCalled()
        expect(revokeObjectURL).toHaveBeenCalled()
    })

    it('offers upload to the student themselves but not to another student', async () => {
        const wrapper = await mountTab({
            user: { _id: 'u9', userId: 'u9', email: 'elev@example.se', roles: ['student'] },
            userRole: 'student',
            documents: [],
        })
        expect(wrapper.text()).toContain('Ladda upp dokument')

        const otherWrapper = await mountTab({
            user: { _id: 'u9', userId: 'u9', email: 'annan@example.se', roles: ['student'] },
            userRole: 'student',
            documents: [],
        })
        expect(otherWrapper.text()).not.toContain('Ladda upp dokument')
    })

    it('does not offer upload to view-only staff roles', async () => {
        const wrapper = await mountTab({
            user: { _id: 'u1', userId: 'u1', email: 'syv@example.se', roles: ['syv'] },
            userRole: 'syv',
            documents: [],
        })

        expect(wrapper.text()).toContain('Inga dokument uppladdade än.')
        expect(wrapper.text()).not.toContain('Ladda upp dokument')
    })
})
