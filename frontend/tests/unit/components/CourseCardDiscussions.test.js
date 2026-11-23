import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import CourseCardDiscussions from '@/components/CourseCardDiscussions.vue'
import client from '@/api/client.js'
import { renderWithVuetify, ok, httpError } from '../../helpers/render.js'

// Per-module threads on a kurskort. Students write one message at a time (turn-taking, with a
// "written in stone" confirmation); staff see every student's conversation and reply per student.

vi.mock('@/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const BASE = '/course-instances/ci-1/module-discussions'

const thread = (messages) => ({
  _id: 'd1',
  title: 'Fråga om Uppsats',
  promptText: 'Hur går det med uppsatsen?',
  createdBy: { username: 'Test Lärare' },
  createdAt: '2026-11-01T09:00:00Z',
  studentConversations: [{ studentId: { _id: 'stu-1', name: 'Test Elev' }, messages }],
})

const fromStudent = { authorRole: 'student', text: 'Jag behöver mer tid', at: '2026-11-02T10:00:00Z' }
const fromStaff = { authorRole: 'staff', authorId: { username: 'Test Lärare' }, text: 'Okej, en vecka till', at: '2026-11-02T11:00:00Z' }

const render = async (props = {}) => {
  const r = await renderWithVuetify(CourseCardDiscussions, {
    props: { courseInstanceId: 'ci-1', moduleNumber: 2, module: { title: 'Modul 2' }, ...props },
  })
  return { ...r, user: userEvent.setup() }
}

describe('CourseCardDiscussions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the threads for the module and shows the category', async () => {
    client.get.mockResolvedValue(ok({ discussions: [thread([])] }))
    await render({ module: { assignment: { title: 'Uppsats' } } })
    expect(await screen.findByText('Fråga om Uppsats')).toBeInTheDocument()
    expect(client.get).toHaveBeenCalledWith(BASE, { params: { moduleNumber: 2 } })
    expect(screen.getByText('Inlämningsuppgift')).toBeInTheDocument()
    expect(screen.getByText(/Startad av Test Lärare/)).toBeInTheDocument()
  })

  it('labels partial-exam modules as Prov and shows the empty state', async () => {
    client.get.mockResolvedValue(ok({ discussions: [] }))
    await render({ module: { isPartialExam: true } })
    expect(await screen.findByText('Inga trådar ännu.')).toBeInTheDocument()
    expect(screen.getByText('Prov')).toBeInTheDocument()
  })

  it('shows the server error when loading fails', async () => {
    client.get.mockRejectedValue(httpError(403, 'x'))
    await render()
    expect(await screen.findByText('Kunde inte hämta trådarna.')).toBeInTheDocument()
  })

  it('reloads when another module is shown', async () => {
    client.get.mockResolvedValue(ok({ discussions: [] }))
    const { rerender } = await render()
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1))
    await rerender({ courseInstanceId: 'ci-1', moduleNumber: 3 })
    await waitFor(() => expect(client.get).toHaveBeenLastCalledWith(BASE, { params: { moduleNumber: 3 } }))
  })

  describe('student view', () => {
    it('sends a message only after the student confirms it', async () => {
      client.get.mockResolvedValue(ok({ discussions: [thread([fromStaff])] }))
      client.post.mockResolvedValue(ok({}))
      const { user } = await render()
      await screen.findByText('Okej, en vecka till')
      expect(screen.getByText(/Test Lärare ·/, { selector: '.message-meta' })).toBeInTheDocument()

      const send = screen.getByRole('button', { name: 'Svara' })
      expect(send).toBeDisabled()
      await user.type(screen.getByLabelText('Ditt meddelande'), '  Tack!  ')
      await user.click(send)
      expect(await screen.findByText('Kontrollera ditt meddelande')).toBeInTheDocument()
      expect(client.post).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Skicka meddelandet' }))
      await waitFor(() =>
        expect(client.post).toHaveBeenCalledWith(`${BASE}/d1/messages`, { moduleNumber: 2, text: 'Tack!' })
      )
      await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2))
    })

    it('cancel keeps the draft and sends nothing', async () => {
      client.get.mockResolvedValue(ok({ discussions: [thread([])] }))
      const { user } = await render()
      await user.type(await screen.findByLabelText('Ditt meddelande'), 'Hej')
      await user.click(screen.getByRole('button', { name: 'Svara' }))
      await user.click(await screen.findByRole('button', { name: 'Avbryt' }))
      expect(client.post).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Ditt meddelande')).toHaveValue('Hej')
    })

    it('waits for the teacher before the student can write again', async () => {
      client.get.mockResolvedValue(ok({ discussions: [thread([fromStudent])] }))
      await render()
      expect(await screen.findByText('Vänta på lärarens svar innan du skickar ett nytt meddelande.')).toBeInTheDocument()
      expect(screen.queryByLabelText('Ditt meddelande')).toBeNull()
      expect(screen.getByText(/Du ·/, { selector: '.message-meta' })).toBeInTheDocument()
    })

    it('shows the server error when sending fails and keeps the dialog open', async () => {
      client.get.mockResolvedValue(ok({ discussions: [thread([])] }))
      client.post.mockRejectedValue(httpError(400, 'x'))
      const { user } = await render()
      await user.type(await screen.findByLabelText('Ditt meddelande'), 'Hej')
      await user.click(screen.getByRole('button', { name: 'Svara' }))
      await user.click(await screen.findByRole('button', { name: 'Skicka meddelandet' }))
      expect(await screen.findByText('Kunde inte skicka meddelandet.')).toBeInTheDocument()
      expect(screen.getByText('Kontrollera ditt meddelande')).toBeInTheDocument()
    })
  })

  describe('staff view', () => {
    it('replies to the student whose message is waiting', async () => {
      client.get.mockResolvedValue(ok({ discussions: [thread([fromStudent])] }))
      client.post.mockResolvedValue(ok({}))
      const { user } = await render({ staffView: true })
      const conversation = (await screen.findByRole('heading', { name: 'Test Elev' })).closest('.student-conversation')
      expect(within(conversation).getByText('Jag behöver mer tid')).toBeInTheDocument()

      await user.type(within(conversation).getByLabelText('Svara eleven'), 'Visst')
      await user.click(within(conversation).getByRole('button', { name: 'Svara' }))
      await waitFor(() =>
        expect(client.post).toHaveBeenCalledWith(`${BASE}/d1/messages`, { moduleNumber: 2, text: 'Visst', studentId: 'stu-1' })
      )
      await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2))
    })

    it('waits for the student after staff has answered', async () => {
      client.get.mockResolvedValue(ok({ discussions: [thread([fromStudent, fromStaff])] }))
      await render({ staffView: true })
      expect(await screen.findByText('Inväntar elevens svar.')).toBeInTheDocument()
      expect(screen.queryByLabelText('Svara eleven')).toBeNull()
    })

    it('starts a thread with a default title from the assignment', async () => {
      client.get.mockResolvedValue(ok({ discussions: [] }))
      client.post.mockResolvedValue(ok({}))
      const { user } = await render({ staffView: true, module: { assignment: { title: 'Uppsats' } } })
      await screen.findByText('Inga trådar ännu.')

      const start = screen.getByRole('button', { name: 'Starta tråd' })
      expect(start).toBeDisabled()
      await user.type(screen.getByLabelText('Meddelande eller fråga till eleverna'), 'Frågor om uppsatsen?')
      await user.click(start)
      await waitFor(() =>
        expect(client.post).toHaveBeenCalledWith(BASE, {
          moduleNumber: 2,
          title: 'Fråga om Uppsats',
          category: 'assignment',
          text: 'Frågor om uppsatsen?',
        })
      )
    })

    it('uses the typed title, falls back to the module title, and shows create errors', async () => {
      client.get.mockResolvedValue(ok({ discussions: [] }))
      client.post.mockRejectedValueOnce(httpError(403, 'x')).mockResolvedValue(ok({}))
      const { user } = await render({ staffView: true })
      await screen.findByText('Inga trådar ännu.')
      await user.type(screen.getByLabelText('Meddelande eller fråga till eleverna'), 'Hej')
      await user.click(screen.getByRole('button', { name: 'Starta tråd' }))
      expect(await screen.findByText('Kunde inte starta tråden.')).toBeInTheDocument()
      expect(client.post.mock.calls[0][1]).toMatchObject({ title: 'Fråga om Modul 2', category: 'general' })

      await user.type(screen.getByLabelText('Rubrik'), 'Egen rubrik')
      await user.click(screen.getByRole('button', { name: 'Starta tråd' }))
      await waitFor(() => expect(client.post.mock.calls[1][1]).toMatchObject({ title: 'Egen rubrik' }))
    })
  })
})
