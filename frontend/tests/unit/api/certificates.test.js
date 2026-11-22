import { describe, it, expect, vi, beforeEach } from 'vitest'

// Contract for the diploma / studieintyg API wrapper. Every path below exists in
// backend/src/router/certificateRoutes.js or certificateRecordRoutes.js (mounted under /api);
// a renamed route on either side breaks the automatic-diploma admin screens silently.

vi.mock('@/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import client from '@/api/client'
import { certificatesApi } from '@/api/certificates'

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }
const form = { kind: 'FormData' }
const data = { title: 'Diplom' }

const cases = [
  ['getSettings', [], 'get', ['/certificates/settings']],
  ['updateSettings', [data], 'put', ['/certificates/settings', data]],
  ['uploadSignature', [form], 'post', ['/certificates/settings/signature', form, multipart]],
  ['uploadSecondSignature', [form], 'post', ['/certificates/settings/second-signature', form, multipart]],
  ['uploadLogo', [form], 'post', ['/certificates/settings/logo', form, multipart]],
  ['deleteSignature', [], 'delete', ['/certificates/settings/signature']],
  ['deleteSecondSignature', [], 'delete', ['/certificates/settings/second-signature']],
  ['deleteLogo', [], 'delete', ['/certificates/settings/logo']],
  ['getTemplates', [], 'get', ['/certificates/templates']],
  ['getTemplate', ['diploma'], 'get', ['/certificates/templates/diploma']],
  ['updateTemplate', ['diploma', data], 'put', ['/certificates/templates/diploma', data]],
  ['getCandidates', [{ page: 2 }], 'get', ['/certificates/candidates', { params: { page: 2 } }]],
  ['list', [{ status: 'draft' }], 'get', ['/certificates', { params: { status: 'draft' } }]],
  ['listMine', [], 'get', ['/certificates/mine']],
  ['get', ['c1'], 'get', ['/certificates/c1']],
  ['create', [data], 'post', ['/certificates', data]],
  ['update', ['c1', data], 'put', ['/certificates/c1', data]],
  ['approve', ['c1'], 'post', ['/certificates/c1/approve']],
  ['generate', ['c1'], 'post', ['/certificates/c1/generate']],
  ['revoke', ['c1', 'Felaktigt betyg'], 'post', ['/certificates/c1/revoke', { reason: 'Felaktigt betyg' }]],
  ['history', ['c1'], 'get', ['/certificates/c1/history']],
  ['download', ['c1'], 'get', ['/certificates/c1/download', { responseType: 'blob' }]],
]

describe('certificatesApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('covers every exported call', () => {
    expect(Object.keys(certificatesApi).sort()).toEqual(cases.map(([name]) => name).sort())
  })

  it.each(cases)('%s calls the matching backend route', (name, args, method, expected) => {
    certificatesApi[name](...args)
    expect(client[method]).toHaveBeenCalledTimes(1)
    expect(client[method]).toHaveBeenCalledWith(...expected)
  })
})
