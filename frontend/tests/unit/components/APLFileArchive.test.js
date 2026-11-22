import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import APLFileArchive from '@/components/APLFileArchive.vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'
import { renderWithVuetify, ok } from '../../helpers/render.js'

// APL-avtal archive: contracts (Document type APL_CONTRACT) grouped per student, searchable,
// downloadable. Error states must be Swedish.

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn() } }))

const toast = useToast().state

const docs = [
  { _id: 'f1', student: 's2', studentName: 'Örn, Test', originalName: 'avtal-orn.pdf', createdAt: '2026-10-01T10:00:00Z' },
  { _id: 'f2', student: 's1', studentName: 'Andersson, Test Elev', originalName: 'avtal-1.pdf', createdAt: '2026-09-01T10:00:00Z' },
  { _id: 'f3', student: 's1', studentName: 'Andersson, Test Elev', originalName: 'avtal-2.pdf', createdAt: '2026-09-02T10:00:00Z' },
  { _id: 'f4', student: 's3', originalName: 'utan-namn.pdf', createdAt: '2026-09-03T10:00:00Z' },
]

const render = async () => {
  const r = await renderWithVuetify(APLFileArchive)
  return { ...r, user: userEvent.setup() }
}
const studentTitles = () =>
  screen.queryAllByText(/Andersson|Örn|Okänd elev/).map((n) => n.textContent.trim())

describe('APLFileArchive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toast.message = ''
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('lists APL contracts grouped per student, sorted by Swedish name order', async () => {
    client.get.mockResolvedValue(ok(docs))
    await render()
    await waitFor(() => expect(studentTitles()).toHaveLength(3))
    expect(client.get).toHaveBeenCalledWith('/documents', { params: { type: 'APL_CONTRACT' } })
    // "Okänd elev" for a contract without a name; Ö sorts after O in Swedish.
    expect(studentTitles()).toEqual(['Andersson, Test Elev', 'Okänd elev', 'Örn, Test'])
  })

  it('filters by name parts in any order and explains an empty result', async () => {
    client.get.mockResolvedValue(ok(docs))
    const { user } = await render()
    await waitFor(() => expect(studentTitles()).toHaveLength(3))
    const search = screen.getByLabelText('Sök student')

    await user.type(search, 'elev andersson')
    expect(studentTitles()).toEqual(['Andersson, Test Elev'])

    await user.clear(search)
    await user.type(search, 'örn')
    expect(studentTitles()).toEqual(['Örn, Test'])

    await user.clear(search)
    await user.type(search, 'xyz')
    expect(studentTitles()).toEqual([])
    expect(screen.getByText('Inga studenter matchade sökningen "xyz".')).toBeInTheDocument()
  })

  it('shows the empty state when there are no contracts', async () => {
    client.get.mockResolvedValue(ok([]))
    await render()
    expect(await screen.findByText(/Inga APL-avtal hittades/)).toBeInTheDocument()
  })

  it('reports a failed load in Swedish and can reload', async () => {
    client.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(ok(docs))
    const { user } = await render()
    await waitFor(() => expect(toast.message).toBe('Kunde inte ladda APL-avtal.'))
    await user.click(screen.getByTitle('Uppdatera lista'))
    await waitFor(() => expect(studentTitles()).toHaveLength(3))
  })

  it('downloads a contract as a blob with its original name', async () => {
    client.get.mockImplementation((url) =>
      url === '/documents' ? Promise.resolve(ok(docs)) : Promise.resolve(ok(new Blob(['%PDF'])))
    )
    const createObjectURL = vi.fn(() => 'blob:apl')
    const revokeObjectURL = vi.fn()
    Object.assign(window.URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const { user } = await render()
    await waitFor(() => expect(studentTitles()).toHaveLength(3))
    await user.click(screen.getByText('Örn, Test'))
    await user.click(await screen.findByTitle('Ladda ner avtal-orn.pdf'))

    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(client.get).toHaveBeenCalledWith('/documents/download/f1', { responseType: 'blob' })
    expect(click.mock.instances[0].getAttribute('download')).toBe('avtal-orn.pdf')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:apl')
    click.mockRestore()
  })

  it('reports a failed download in Swedish', async () => {
    client.get.mockImplementation((url) =>
      url === '/documents' ? Promise.resolve(ok(docs)) : Promise.reject(new Error('404'))
    )
    const { user } = await render()
    await waitFor(() => expect(studentTitles()).toHaveLength(3))
    await user.click(screen.getByText('Örn, Test'))
    await user.click(await screen.findByTitle('Ladda ner avtal-orn.pdf'))
    await waitFor(() => expect(toast.message).toBe('Kunde inte ladda ner filen.'))
  })
})
