import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ChangeActionPlan from '@/views/Admin/SearchTabs/ChangeActionPlan.vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'
import { renderWithVuetify, ok } from '../../helpers/render.js'

// Admin editor for the F-handlingsplan question template (GET/POST /form-questions).

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const toast = useToast().state

const template = () => ({
  questions: [
    { key: 'reason', label: 'Orsak', type: 'textarea', required: true, options: [] },
    { key: 'measures', label: 'Åtgärder', type: 'checkbox', required: false, options: ['Extra tid', 'Handledning'] },
  ],
})

const render = async () => {
  const r = await renderWithVuetify(ChangeActionPlan)
  await waitFor(() => expect(screen.getByText('Fråga 2')).toBeInTheDocument())
  return { ...r, user: userEvent.setup() }
}

const questionCard = (n) => screen.getByText(`Fråga ${n}`).closest('.v-card')
const iconButton = (container, icon) => container.querySelector(`.${icon}`).closest('button')
const labels = () => screen.getAllByLabelText(/Frågetext/).map((i) => i.value)

describe('ChangeActionPlan (action plan question template)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toast.message = ''
    client.get.mockResolvedValue(ok(template()))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('loads the template with keys and choice options', async () => {
    await render()
    expect(client.get).toHaveBeenCalledWith('/form-questions/ACTION_PLAN')
    expect(labels()).toEqual(['Orsak', 'Åtgärder'])
    expect(screen.getByText('Nyckel: reason')).toBeInTheDocument()
    expect(within(questionCard(2)).getByDisplayValue('Extra tid')).toBeInTheDocument()
    expect(within(questionCard(1)).queryByText('Svarsalternativ')).toBeNull()
  })

  it('saves trimmed questions, drops empty options and keeps keys', async () => {
    client.post.mockResolvedValue(ok({ message: 'Sparat!' }))
    const { user } = await render()

    await user.click(within(questionCard(2)).getByRole('button', { name: 'Lägg till alternativ' }))
    const label1 = screen.getAllByLabelText(/Frågetext/)[0]
    await user.clear(label1)
    await user.type(label1, '  Orsak till F  ')

    await user.click(screen.getByRole('button', { name: 'Lägg till fråga' }))
    await user.type(screen.getAllByLabelText(/Frågetext/)[2], 'Uppföljningsdatum')
    await user.click(screen.getByRole('button', { name: 'Spara ändringar' }))

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1))
    const [url, body] = client.post.mock.calls[0]
    expect(url).toBe('/form-questions')
    expect(body.type).toBe('ACTION_PLAN')
    expect(body.questions).toHaveLength(3)
    expect(body.questions[0]).toEqual({ label: 'Orsak till F', type: 'textarea', options: [], required: true, key: 'reason' })
    expect(body.questions[1].options).toEqual(['Extra tid', 'Handledning'])
    expect(body.questions[2]).toMatchObject({ label: 'Uppföljningsdatum', type: 'text', required: false, options: [] })
    expect(body.questions[2].key).toMatch(/^fraga_[a-z0-9]{1,4}$/)
    await waitFor(() => expect(toast.message).toBe('Sparat!'))
    expect(client.get).toHaveBeenCalledTimes(2)
  })

  it('refuses to save a question without text', async () => {
    const { user } = await render()
    await user.click(screen.getByRole('button', { name: 'Lägg till ytterligare fråga' }))
    await user.click(screen.getByRole('button', { name: 'Spara Frågekonfiguration' }))
    expect(toast.message).toBe('Fråga 3 saknar frågetext / etikett.')
    expect(client.post).not.toHaveBeenCalled()
  })

  it('moves and removes questions', async () => {
    const { user } = await render()
    expect(iconButton(questionCard(1), 'mdi-arrow-up')).toBeDisabled()
    expect(iconButton(questionCard(2), 'mdi-arrow-down')).toBeDisabled()

    await user.click(iconButton(questionCard(1), 'mdi-arrow-down'))
    expect(labels()).toEqual(['Åtgärder', 'Orsak'])
    await user.click(iconButton(questionCard(2), 'mdi-arrow-up'))
    expect(labels()).toEqual(['Orsak', 'Åtgärder'])

    await user.click(iconButton(questionCard(1), 'mdi-delete'))
    expect(labels()).toEqual(['Åtgärder'])
  })

  it('adds and removes answer options', async () => {
    const { user } = await render()
    const card = questionCard(2)
    expect(within(card).getAllByPlaceholderText(/Alternativ/)).toHaveLength(2)
    const optionDelete = () => [...card.querySelectorAll('.mdi-close')]
    await user.click(optionDelete()[0].closest('button'))
    expect(within(card).getAllByPlaceholderText(/Alternativ/).map((i) => i.value)).toEqual(['Handledning'])
  })

  it('reports load and save failures in Swedish', async () => {
    client.get.mockRejectedValueOnce(new Error('offline'))
    await renderWithVuetify(ChangeActionPlan)
    await waitFor(() => expect(toast.message).toBe('Kunde inte hämta frågemallen.'))
  })

  it('shows the server error when saving fails', async () => {
    client.post.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { error: 'Ogiltig frågetyp' } } }))
    const { user } = await render()
    await user.click(screen.getByRole('button', { name: 'Spara ändringar' }))
    await waitFor(() => expect(toast.message).toBe('Ogiltig frågetyp'))
  })
})
