import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerBlobDownload } from '@/utils/download.js'

describe('triggerBlobDownload', () => {
    it('exports the download helper', () => {
        expect(typeof triggerBlobDownload).toBe('function')
    })

    let anchor
    let createElement
    let createObjectURL
    let revokeObjectURL
    let originalCreateObjectURL
    let originalRevokeObjectURL

    beforeEach(() => {
        anchor = document.createElement('a')
        vi.spyOn(anchor, 'click').mockImplementation(() => {})
        createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
        originalCreateObjectURL = window.URL.createObjectURL
        originalRevokeObjectURL = window.URL.revokeObjectURL
        createObjectURL = vi.fn(() => 'blob:test-file')
        revokeObjectURL = vi.fn()
        Object.defineProperty(window.URL, 'createObjectURL', {
            configurable: true,
            value: createObjectURL,
        })
        Object.defineProperty(window.URL, 'revokeObjectURL', {
            configurable: true,
            value: revokeObjectURL,
        })
    })

    afterEach(() => {
        createElement.mockRestore()
        if (originalCreateObjectURL) {
            Object.defineProperty(window.URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectURL,
            })
        } else {
            delete window.URL.createObjectURL
        }
        if (originalRevokeObjectURL) {
            Object.defineProperty(window.URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectURL,
            })
        } else {
            delete window.URL.revokeObjectURL
        }
    })

    it('uses the UTF-8 content-disposition filename and releases the object URL', () => {
        const blob = new Blob(['document'], {
            type: 'application/pdf',
        })
        blob.disposition = "attachment; filename*=UTF-8''rapport%20final.pdf"

        triggerBlobDownload(blob)

        expect(createObjectURL).toHaveBeenCalledWith(blob)
        expect(anchor.download).toBe('rapport final.pdf')
        expect(anchor.href).toBe('blob:test-file')
        expect(anchor.click).toHaveBeenCalledOnce()
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-file')
        expect(document.body.contains(anchor)).toBe(false)
    })

    it('falls back to the quoted filename and then the supplied default', () => {
        const blobWithFilename = new Blob([])
        blobWithFilename.disposition = 'attachment; filename="report.pdf"'

        triggerBlobDownload(blobWithFilename, 'fallback.pdf')
        expect(anchor.download).toBe('report.pdf')

        const blobWithoutFilename = new Blob([])
        triggerBlobDownload(blobWithoutFilename, 'custom.pdf')
        expect(anchor.download).toBe('custom.pdf')
    })
})
