import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileUploaderDownloader from '../../../src/components/FileUploaderDownloader.vue'

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

const uploadedFiles = [
    { _id: 'f1', filename: 'rapport.pdf', uploadedAt: '2025-03-01T10:00:00.000Z' },
    { _id: 'f2', filename: 'kvitto.txt', uploadDate: '2025-04-15T08:30:00.000Z' },
]

function asciiDisposition(name) {
    return { headers: { 'content-disposition': `attachment; filename="${name}"` } }
}

describe('FileUploaderDownloader.vue', () => {
    let wrapper

    const mountComponent = async () => {
        wrapper = mount(FileUploaderDownloader, {
            props: { studentId: 'stu-1', studentName: 'Anna Elev' },
        })
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()
    }

    const buttonByText = (text) =>
        wrapper.findAll('button').find((b) => b.text().includes(text))

    beforeEach(() => {
        vi.resetAllMocks()
        vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:fake')
        vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {})
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

        client.get.mockImplementation((url) =>
            url.startsWith('/uploads/download')
                ? Promise.resolve(asciiDisposition('kvitto.txt'))
                : Promise.resolve({ data: uploadedFiles }),
        )
        client.post.mockResolvedValue({ data: {} })
        client.delete.mockResolvedValue({ data: {} })
    })

    it('fetches and lists uploaded files with formatted dates', async () => {
        client.get.mockResolvedValue({ data: uploadedFiles })
        await mountComponent()

        expect(client.get).toHaveBeenCalledWith('/uploads/stu-1')
        const items = wrapper.findAll('.file-item')
        expect(items).toHaveLength(2)
        expect(wrapper.text()).toContain('rapport.pdf')
        expect(wrapper.text()).toContain('kvitto.txt')
    })

    it('shows an empty state when there are no files', async () => {
        client.get.mockResolvedValue({ data: [] })
        await mountComponent()

        expect(wrapper.text()).toContain('No files uploaded yet.')
        expect(wrapper.findAll('.file-item')).toHaveLength(0)
    })

    it('clears the file list when fetching fails', async () => {
        client.get.mockRejectedValue(new Error('boom'))
        await mountComponent()

        expect(wrapper.text()).toContain('No files uploaded yet.')
        expect(client.get).toHaveBeenCalledWith('/uploads/stu-1')
    })

    it('uploads the selected file and refreshes the list', async () => {
        client.get.mockResolvedValue({ data: uploadedFiles })
        await mountComponent()

        const file = new File(['text'], 'rapport.pdf', { type: 'application/pdf' })
        const input = wrapper.find('input[type="file"]')
        Object.defineProperty(input.element, 'files', {
            value: [file],
            configurable: true,
        })
        await input.trigger('change')
        await wrapper.vm.$nextTick()

        await buttonByText('Upload').trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(client.post).toHaveBeenCalledTimes(1)
        expect(client.post.mock.calls[0][0]).toBe('/uploads/stu-1')
        const body = client.post.mock.calls[0][1]
        expect(body.get('file')).toBe(file)
        expect(client.get).toHaveBeenCalledWith('/uploads/stu-1')
        expect(wrapper.findAll('.file-item')).toHaveLength(2)
    })

    it('shows an error toast when the upload fails', async () => {
        client.get.mockResolvedValue({ data: [] })
        client.post.mockRejectedValue(new Error('nope'))
        await mountComponent()

        const file = new File(['text'], 'rapport.pdf')
        const input = wrapper.find('input[type="file"]')
        Object.defineProperty(input.element, 'files', {
            value: [file],
            configurable: true,
        })
        await input.trigger('change')
        await wrapper.vm.$nextTick()

        await buttonByText('Upload').trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(mockToast.error).toHaveBeenCalledWith('Failed to upload file.')
    })

    it('downloads a file using the RFC 5987 filename', async () => {
        client.get.mockImplementation((url) =>
            url.startsWith('/uploads/download')
                ? Promise.resolve({
                      data: new Blob(['x']),
                      headers: { 'content-disposition': "attachment; filename*=UTF-8''r%C3%A4tt.pdf" },
                  })
                : Promise.resolve({ data: uploadedFiles }),
        )
        await mountComponent()

        await wrapper.find('button[title="Download rapport.pdf"]').trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(client.get).toHaveBeenCalledWith('/uploads/download/f1', {
            responseType: 'blob',
        })
        expect(window.URL.createObjectURL).toHaveBeenCalled()
        expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    })

    it('downloads a file using the plain filename fallback', async () => {
        await mountComponent()

        await wrapper.find('button[title="Download kvitto.txt"]').trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(client.get).toHaveBeenCalledWith('/uploads/download/f2', {
            responseType: 'blob',
        })
        expect(window.URL.createObjectURL).toHaveBeenCalled()
    })

    it('shows an error toast when the download fails', async () => {
        client.get.mockImplementation((url) =>
            url.startsWith('/uploads/download')
                ? Promise.reject(new Error('nope'))
                : Promise.resolve({ data: uploadedFiles }),
        )
        await mountComponent()

        await wrapper.find('button[title="Download kvitto.txt"]').trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(mockToast.error).toHaveBeenCalledWith('Failed to download file.')
    })

    it('deletes a file after confirmation and refreshes the list', async () => {
        global.confirm = vi.fn(() => true)
        client.get.mockResolvedValue({ data: uploadedFiles })
        await mountComponent()

        await wrapper.find('button[title="Delete rapport.pdf"]').trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(global.confirm).toHaveBeenCalled()
        expect(client.delete).toHaveBeenCalledWith('/uploads/f1')
        expect(client.get).toHaveBeenCalledWith('/uploads/stu-1')
    })

    it('skips deletion when the confirm dialog is dismissed', async () => {
        global.confirm = vi.fn(() => false)
        client.get.mockResolvedValue({ data: uploadedFiles })
        await mountComponent()

        await wrapper.find('button[title="Delete kvitto.txt"]').trigger('click')
        await wrapper.vm.$nextTick()

        expect(global.confirm).toHaveBeenCalled()
        expect(client.delete).not.toHaveBeenCalled()
    })

    it('shows an error toast when deletion fails', async () => {
        global.confirm = vi.fn(() => true)
        client.get.mockResolvedValue({ data: uploadedFiles })
        client.delete.mockRejectedValue(new Error('nope'))
        await mountComponent()

        await wrapper.find('button[title="Delete kvitto.txt"]').trigger('click')
        await wrapper.vm.$nextTick()
        await wrapper.vm.$nextTick()

        expect(mockToast.error).toHaveBeenCalledWith('Failed to delete file.')
    })

    it('renders the student name in the upload card', async () => {
        client.get.mockResolvedValue({ data: [] })
        await mountComponent()

        expect(wrapper.text()).toContain('Upload File for Anna Elev')
    })
})