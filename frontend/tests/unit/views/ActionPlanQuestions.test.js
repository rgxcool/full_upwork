import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ActionPlanQuestions from '@/views/Admin/SearchTabs/ActionPlanQuestions.vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'
import { renderWithVuetify, ok, httpError } from '../../helpers/render.js'

// F-handlingsplan for a student: filling in the template, required fields, which course the plan
// is attached to, and the PDF download.

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

const toast = useToast().state

const QUESTIONS = [
  { key: 'studentName', label: 'Elevens namn', type: 'text', required: true },
  { key: 'date', label: 'Datum', type: 'date', required: true },
  { key: 'reason', label: 'Orsak', type: 'textarea', required: true },
  { key: 'level', label: 'Nivå', type: 'radio', options: ['Låg', 'Hög'], required: true },
  { key: 'measures', label: 'Åtgärder', type: 'checkbox', options: ['Extra tid', 'Handledning'], required: true },
]

const student = (overrides = {}) => ({
  _id: 'stu-1',
  name: 'Test Elev',
  education: [
    { _id: 'edu-a', courseId: 'course-a', grade: 'E' },
    { _id: 'edu-f', courseId: 'course-f', grade: 'F' },
  ],
  ...overrides,
})

const savedPlan = { studentId: 'stu-1', teacherName: 'Test Lärare', date: '2026-11-01', reason: 'Saknade inlämningar' }

function api({ plan = null } = {}) {
  let current = plan
  client.get.mockImplementation((url) => {
    if (url === '/form-questions/ACTION_PLAN') return Promise.resolve(ok({ questions: QUESTIONS }))
    if (url === '/teachers') return Promise.resolve(ok([{ _id: 't1', userId: { name: 'Test Lärare' } }, { _id: 't2', userId: null }]))
    if (url === '/actionplan/stu-1') return current ? Promise.resolve(ok(current)) : Promise.reject(httpError(404))
    if (url === '/actionplan/stu-1/pdf') return Promise.resolve(ok('%PDF'))
    return Promise.reject(httpError(404))
  })
  client.post.mockImplementation(() => {
    current = savedPlan
    return Promise.resolve(ok({}))
  })
  client.put.mockResolvedValue(ok({}))
}

const render = async (props = { userData: student() }) => {
  const r = await renderWithVuetify(ActionPlanQuestions, { props })
  return { ...r, user: userEvent.setup() }
}

describe('ActionPlanQuestions (F-handlingsplan)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toast.message = ''
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('without a saved plan shows the form, prefilled with the student\'s name and today\'s date', async () => {
    api()
    await render()
    expect(await screen.findByDisplayValue('Test Elev')).toBeInTheDocument()
    expect(screen.getByDisplayValue(new Date().toISOString().slice(0, 10))).toBeInTheDocument()
    expect(screen.queryByText(/Handlingsplan finns sparad/)).toBeNull()
  })

  it('requires every mandatory answer', async () => {
    api()
    const { user } = await render()
    await screen.findByDisplayValue('Test Elev')
    await user.click(screen.getByRole('button', { name: 'Spara Handlingsplan' }))
    await waitFor(() => expect(toast.message).toBe('Vänligen fyll i alla obligatoriska fält.'))
    expect(screen.getByText('Orsak är obligatorisk.')).toBeInTheDocument()
    expect(screen.getByText('Nivå är obligatorisk.')).toBeInTheDocument()
    expect(screen.getByText('Åtgärder är obligatorisk.')).toBeInTheDocument()
    expect(client.post).not.toHaveBeenCalled()
  })

  it('saves the plan against the F course, resolves the notification and shows the saved plan', async () => {
    api()
    const { user } = await render()
    await screen.findByDisplayValue('Test Elev')

    await user.type(screen.getByLabelText('Fyll i detaljer / kommentar'), 'Saknade inlämningar')
    await user.click(screen.getByLabelText('Hög'))
    await user.click(screen.getByLabelText('Extra tid'))
    await user.click(screen.getByLabelText('Handledning'))
    await user.click(screen.getByRole('button', { name: 'Spara Handlingsplan' }))

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1))
    const [url, body] = client.post.mock.calls[0]
    expect(url).toBe('/save-actionplan')
    expect(body).toMatchObject({
      studentId: 'stu-1',
      studentName: 'Test Elev',
      educationId: 'edu-f',
      courseId: 'course-f',
      reason: 'Saknade inlämningar',
      level: 'Hög',
      measures: ['Extra tid', 'Handledning'],
    })
    expect(client.put).toHaveBeenCalledWith('/notifications/resolve/stu-1')
    await waitFor(() => expect(toast.message).toBe('Handlingsplan sparad!'))
    expect(await screen.findByText(/Handlingsplan finns sparad för Test Elev/)).toBeInTheDocument()
  })

  it('still reports success when resolving the notification fails', async () => {
    api()
    client.put.mockRejectedValue(httpError(500))
    const { user } = await render({ userData: student({ education: [] }) })
    await screen.findByDisplayValue('Test Elev')
    await user.type(screen.getByLabelText('Fyll i detaljer / kommentar'), 'x')
    await user.click(screen.getByLabelText('Låg'))
    await user.click(screen.getByLabelText('Extra tid'))
    await user.click(screen.getByRole('button', { name: 'Spara Handlingsplan' }))
    await waitFor(() => expect(toast.message).toBe('Handlingsplan sparad!'))
    // No education: the API gets the placeholder educationId and no courseId.
    expect(client.post.mock.calls[0][1]).toMatchObject({ educationId: 'EDU-1' })
    expect(client.post.mock.calls[0][1]).not.toHaveProperty('courseId')
  })

  it('shows the server error when saving fails', async () => {
    api()
    client.post.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { error: 'Elev saknas' } } }))
    const { user } = await render()
    await screen.findByDisplayValue('Test Elev')
    await user.type(screen.getByLabelText('Fyll i detaljer / kommentar'), 'x')
    await user.click(screen.getByLabelText('Låg'))
    await user.click(screen.getByLabelText('Extra tid'))
    await user.click(screen.getByRole('button', { name: 'Spara Handlingsplan' }))
    await waitFor(() => expect(toast.message).toBe('Elev saknas'))
  })

  it('shows a saved plan and switches between it and the form', async () => {
    api({ plan: savedPlan })
    const { user } = await render()
    expect(await screen.findByText(/Handlingsplan finns sparad för Test Elev/)).toBeInTheDocument()
    expect(screen.getByText('Test Lärare')).toBeInTheDocument()
    expect(screen.getByText('Saknade inlämningar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Spara Handlingsplan' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Ny / Redigera' }))
    expect(screen.getByRole('button', { name: 'Spara Handlingsplan' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '← Visa sparad handlingsplan' }))
    expect(screen.queryByRole('button', { name: 'Spara Handlingsplan' })).toBeNull()
  })

  it('downloads the plan as a PDF', async () => {
    api({ plan: savedPlan })
    const createObjectURL = vi.fn(() => 'blob:plan')
    const revokeObjectURL = vi.fn()
    Object.assign(window.URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const { user } = await render()
    await user.click(await screen.findByRole('button', { name: 'Ladda ner PDF' }))
    await waitFor(() => expect(toast.message).toBe('Handlingsplanen laddades ner som PDF!'))
    expect(client.get).toHaveBeenCalledWith('/actionplan/stu-1/pdf', { responseType: 'blob' })
    expect(click.mock.instances[0].download).toBe('handlingsplan-stu-1.pdf')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:plan')
    click.mockRestore()
  })

  it('reports a failed PDF download', async () => {
    api({ plan: savedPlan })
    client.get.mockImplementation((url) =>
      url === '/actionplan/stu-1'
        ? Promise.resolve(ok(savedPlan))
        : url.endsWith('/pdf')
          ? Promise.reject(new Error('PDF-tjänsten svarar inte'))
          : Promise.resolve(ok({ questions: [] }))
    )
    const { user } = await render()
    await user.click(await screen.findByRole('button', { name: 'Ladda ner PDF' }))
    await waitFor(() => expect(toast.message).toBe('PDF-tjänsten svarar inte'))
  })

  it('without a student it refuses to save', async () => {
    api()
    const { user } = await render({})
    await user.click(await screen.findByRole('button', { name: 'Spara Handlingsplan' }))
    await waitFor(() => expect(toast.message).toBe('Ingen elevdata hittades för att spara handlingsplanen.'))
  })

  it('reports when the questions cannot be loaded', async () => {
    client.get.mockRejectedValue(new Error('offline'))
    await render()
    await waitFor(() => expect(toast.message).toBe('Kunde inte hämta handlingsplansfrågor.'))
  })
})
