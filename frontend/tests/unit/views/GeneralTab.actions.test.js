import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import GeneralTab from '@/views/Student/tabs/GeneralTab.vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'
import { renderWithVuetify, buildStore, buildRouter, ok, httpError } from '../../helpers/render.js'

// Student profile → "Allmänt": what staff can change on a student and how it is sent to the API.
// The role *visibility* rules are covered in tests/features/student-detail-role-projection.test.js;
// this suite covers the actions (edit, exam accommodations, comments, support contacts,
// deviations, avbrott, password reset) and their Swedish error states.

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const toast = useToast().state

const STUDENT = (overrides = {}) => ({
  _id: 'stu-1',
  name: 'Test Elev',
  email: 'test.elev@example.invalid',
  personalNumber: '19000101-0000',
  phone: '070-000 00 00',
  aplStatus: 'YELLOW',
  municipality: { type: 'Sollentuna' },
  examAccommodations: { extraTime: 0, computer: false, separateRoom: false, notes: '' },
  commentHistory: [],
  enrollments: [],
  ...overrides,
})

function storeFor(role, userId = 'me') {
  return buildStore({
    getters: {
      isAdmin: role === 'admin' || role === 'systemadmin',
      userRole: role,
      userId,
    },
  })
}

async function mountTab({ role = 'admin', userId = 'me', student = STUDENT(), changeHistory = [], get } = {}) {
  client.get.mockImplementation(get || (() => Promise.resolve(ok({}))))
  const router = buildRouter([{ path: '/student/:id', component: { template: '<div />' } }])
  await router.push('/student/stu-1')
  const result = await renderWithVuetify(GeneralTab, {
    props: { student, changeHistory },
    store: storeFor(role, userId),
    router,
  })
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(role === 'admin' || role === 'syv' || role === 'specped' ? 2 : 0))
  return { ...result, user: userEvent.setup() }
}

const card = (heading) => screen.getByRole('heading', { name: heading }).closest('.card')

describe('GeneralTab — actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    toast.message = ''
    toast.type = 'info'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('basic information (admin)', () => {
    it('edits and saves the student, then leaves edit mode', async () => {
      client.put.mockResolvedValue(ok({ student: { ...STUDENT(), name: 'Test Elev Ny' } }))
      const { user, emitted } = await mountTab()
      const info = card('Grundläggande Information')

      await user.click(within(info).getByRole('button', { name: 'Redigera' }))
      const name = within(info).getByDisplayValue('Test Elev')
      await user.clear(name)
      await user.type(name, 'Test Elev Ny')
      await user.selectOptions(within(info).getByLabelText('APL-status:'), 'GREEN')
      await user.click(screen.getByRole('button', { name: 'Spara ändringar' }))

      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1))
      const [url, body] = client.put.mock.calls[0]
      expect(url).toBe('/student-details/stu-1')
      expect(body).toMatchObject({
        name: 'Test Elev Ny',
        personalNumber: '19000101-0000',
        aplStatus: 'GREEN',
        municipality: { type: 'Sollentuna' },
      })
      expect(emitted()['student-updated'][0][0]).toMatchObject({ name: 'Test Elev Ny' })
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Spara ändringar' })).toBeNull())
    })

    it('stays in edit mode and says so in Swedish when saving fails', async () => {
      client.put.mockRejectedValue(httpError(500, 'Serverfel'))
      const { user } = await mountTab()
      await user.click(within(card('Grundläggande Information')).getByRole('button', { name: 'Redigera' }))
      await user.click(screen.getByRole('button', { name: 'Spara ändringar' }))
      await waitFor(() => expect(toast.message).toBe('Kunde inte spara ändringar'))
      expect(screen.getByRole('button', { name: 'Spara ändringar' })).toBeInTheDocument()
    })

    it('cancel discards the edits', async () => {
      const { user } = await mountTab()
      const info = card('Grundläggande Information')
      await user.click(within(info).getByRole('button', { name: 'Redigera' }))
      const phone = within(info).getByDisplayValue('070-000 00 00')
      await user.clear(phone)
      await user.type(phone, '123')
      await user.click(screen.getAllByRole('button', { name: 'Avbryt' }).find((b) => b.closest('.edit-actions')))
      expect(within(info).getByText('070-000 00 00')).toBeInTheDocument()
      expect(client.put).not.toHaveBeenCalled()
    })

    it('resets the password and shows the temporary password', async () => {
      client.post.mockResolvedValue(ok({ tempPassword: 'Temp-9999' }))
      const { user } = await mountTab({ student: STUDENT({ user: { _id: 'user-1' } }) })
      await user.click(screen.getByRole('button', { name: 'Visa/Återställ lösenord' }))
      await waitFor(() => expect(screen.getByText('Temp-9999')).toBeInTheDocument())
      expect(client.post).toHaveBeenCalledWith('/users/user-1/reset-password')
      expect(toast.message).toBe('Lösenordet har återställts! Det nya lösenordet visas nedan.')
      expect(screen.getByRole('button', { name: 'Återställ lösenord' })).toBeInTheDocument()
    })

    it('reports a failed password reset', async () => {
      client.post.mockRejectedValue(httpError(500))
      const { user } = await mountTab({ student: STUDENT({ user: { _id: 'user-1' } }) })
      await user.click(screen.getByRole('button', { name: 'Visa/Återställ lösenord' }))
      await waitFor(() => expect(toast.message).toBe('Kunde inte återställa lösenord.'))
    })
  })

  describe('exam accommodations (specped)', () => {
    it('saves extra time and computer and shows them as badges', async () => {
      client.put.mockResolvedValue(
        ok({ examAccommodations: { extraTime: 30, computer: true, separateRoom: false, notes: 'Lugn miljö' } })
      )
      const { user } = await mountTab({ role: 'specped' })
      const status = card('Status')
      await user.click(within(status).getByText('Redigera', { selector: 'button' }))
      const extra = within(status).getByRole('spinbutton')
      await user.clear(extra)
      await user.type(extra, '30')
      await user.click(within(status).getByLabelText(/Dator/))
      await user.type(within(status).getByRole('textbox'), '  Lugn miljö  ')
      await user.click(within(status).getByRole('button', { name: 'Spara' }))

      await waitFor(() =>
        expect(client.put).toHaveBeenCalledWith('/students/stu-1/exam-accommodations', {
          extraTime: 30,
          computer: true,
          separateRoom: false,
          notes: 'Lugn miljö',
        })
      )
      await waitFor(() => expect(toast.message).toBe('Anpassningar sparade'))
    })

    it('reports a failed save and keeps the form open', async () => {
      client.put.mockRejectedValue(httpError(403))
      const { user } = await mountTab({ role: 'specped' })
      const status = card('Status')
      await user.click(within(status).getByText('Redigera', { selector: 'button' }))
      await user.click(within(status).getByRole('button', { name: 'Spara' }))
      await waitFor(() => expect(toast.message).toBe('Kunde inte spara anpassningar'))
      expect(within(status).getByRole('button', { name: 'Spara' })).toBeInTheDocument()
    })

    it('cancel closes the form without saving', async () => {
      const { user } = await mountTab({ role: 'specped' })
      const status = card('Status')
      await user.click(within(status).getByText('Redigera', { selector: 'button' }))
      await user.click(within(status).getByRole('button', { name: 'Avbryt' }))
      expect(within(status).queryByRole('button', { name: 'Spara' })).toBeNull()
      expect(within(status).getByText(/Inga anpassningar/)).toBeInTheDocument()
    })
  })

  describe('comments', () => {
    const comments = () => [
      { _id: 'c1', author: 'Lärare A', authorId: 'me', comment: 'Bra start', date: '2026-10-01', seenBy: ['me'] },
      { _id: 'c2', author: 'Lärare B', authorId: 'other', comment: 'Behöver stöd', date: '2026-10-02', seenBy: [] },
    ]

    it('marks only unseen comments as seen on open', async () => {
      client.put.mockResolvedValue(ok({}))
      await mountTab({ role: 'teacher', student: STUDENT({ commentHistory: comments() }) })
      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1))
      expect(client.put).toHaveBeenCalledWith('/student-details/stu-1/comments/c2/seen')
    })

    it('a teacher adds a comment', async () => {
      client.put.mockResolvedValue(ok({}))
      client.post.mockResolvedValue(
        ok({ commentHistory: [{ _id: 'c3', author: 'Jag', authorId: 'me', comment: 'Ny kommentar', seenBy: ['me'] }] })
      )
      const { user } = await mountTab({ role: 'teacher' })
      await user.click(screen.getByRole('button', { name: 'Lägg till kommentar' }))
      const add = screen.getByRole('button', { name: 'Lägg till' })
      expect(add).toBeDisabled()
      await user.type(screen.getByRole('heading', { name: 'Lägg till kommentar' }).closest('.modal-content').querySelector('textarea'), 'Ny kommentar')
      await user.click(add)
      await waitFor(() =>
        expect(client.post).toHaveBeenCalledWith('/student-details/stu-1/comments', { comment: 'Ny kommentar' })
      )
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Lägg till kommentar' })).toBeNull())
    })

    it('a teacher can edit and delete only their own comment', async () => {
      client.put.mockImplementation((url) =>
        url.endsWith('/seen')
          ? Promise.resolve(ok({}))
          : Promise.resolve(ok({ commentHistory: [{ ...comments()[0], comment: 'Bra start!', editedAt: '2026-10-03' }] }))
      )
      client.delete.mockResolvedValue(ok({}))
      const { user } = await mountTab({ role: 'teacher', student: STUDENT({ commentHistory: comments() }) })

      const items = () => screen.getAllByText(/Bra start|Behöver stöd|\[RADERAD\]/).map((n) => n.closest('.comment-item'))
      expect(within(items()[1]).queryByRole('button', { name: 'Redigera' })).toBeNull()
      expect(within(items()[1]).queryByRole('button', { name: 'Radera' })).toBeNull()

      await user.click(within(items()[0]).getByRole('button', { name: 'Redigera' }))
      const textarea = screen.getByRole('heading', { name: 'Redigera kommentar' }).closest('.modal-content').querySelector('textarea')
      await user.clear(textarea)
      await user.type(textarea, 'Bra start!')
      await user.click(screen.getByRole('button', { name: 'Spara' }))
      await waitFor(() =>
        expect(client.put).toHaveBeenCalledWith('/student-details/stu-1/comments/c1', { comment: 'Bra start!' })
      )
      await waitFor(() => expect(screen.getByText('Bra start!')).toBeInTheDocument())

      await user.click(within(items()[0]).getByRole('button', { name: 'Radera' }))
      await waitFor(() => expect(client.delete).toHaveBeenCalledWith('/student-details/stu-1/comments/c1'))
    })

    it('an admin may edit someone else\'s comment', async () => {
      client.put.mockResolvedValue(ok({}))
      await mountTab({ role: 'admin', student: STUDENT({ commentHistory: comments() }) })
      const other = screen.getByText('Behöver stöd').closest('.comment-item')
      expect(within(other).getByRole('button', { name: 'Redigera' })).toBeInTheDocument()
    })

    it('reports a failed comment', async () => {
      client.post.mockRejectedValue(httpError(500))
      const { user } = await mountTab({ role: 'teacher' })
      await user.click(screen.getByRole('button', { name: 'Lägg till kommentar' }))
      await user.type(screen.getByRole('heading', { name: 'Lägg till kommentar' }).closest('.modal-content').querySelector('textarea'), 'x')
      await user.click(screen.getByRole('button', { name: 'Lägg till' }))
      await waitFor(() => expect(toast.message).toBe('Kunde inte lägga till kommentar'))
    })
  })

  describe('support contacts (admin)', () => {
    const get = (url) => {
      if (url.endsWith('/support')) {
        return Promise.resolve(ok({ supportInfo: [{ contactName: 'Kurator Test', contactRole: 'Kurator', supportType: 'Samtal' }] }))
      }
      return Promise.resolve(ok([]))
    }

    it('shows contacts and saves edits without empty rows', async () => {
      client.put.mockResolvedValue(ok({}))
      const { user } = await mountTab({ get })
      const support = card('Stödkontakter')
      await waitFor(() => expect(within(support).getByText('Kurator Test')).toBeInTheDocument())

      await user.click(within(support).getByRole('button', { name: 'Redigera' }))
      const modal = screen.getAllByRole('heading', { name: 'Stödkontakter' }).at(-1).closest('.modal-content')
      await user.click(within(modal).getByRole('button', { name: '+ Lägg till kontakt' }))
      await user.click(within(modal).getByRole('button', { name: '+ Lägg till kontakt' }))
      const names = within(modal).getAllByPlaceholderText('Namn')
      await user.type(names[1], 'Handläggare Test')
      await user.click(within(modal).getAllByRole('button', { name: 'Ta bort' })[0])
      await user.click(within(modal).getByRole('button', { name: 'Spara' }))

      await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1))
      const [url, body] = client.put.mock.calls[0]
      expect(url).toBe('/student-details/stu-1/support')
      expect(body.supportInfo.map((c) => c.contactName)).toEqual(['Handläggare Test'])
      await waitFor(() => expect(toast.message).toBe('Stödkontakter uppdaterade.'))
    })

    it('reports a failed save', async () => {
      client.put.mockRejectedValue(httpError(500))
      const { user } = await mountTab({ get })
      await user.click(within(card('Stödkontakter')).getByRole('button', { name: /Redigera|Lägg till/ }))
      const modal = screen.getAllByRole('heading', { name: 'Stödkontakter' }).at(-1).closest('.modal-content')
      await user.click(within(modal).getByRole('button', { name: 'Spara' }))
      await waitFor(() => expect(toast.message).toBe('Kunde inte spara stödkontakter.'))
    })
  })

  describe('deviations', () => {
    it('lists deviations with Swedish type and status labels', async () => {
      const get = (url) =>
        url.endsWith('/deviations')
          ? Promise.resolve(ok([{ _id: 'd1', type: 'exception', status: 'pending', title: 'Förlängd tid', requestedByName: 'SYV Test' }]))
          : Promise.resolve(ok({}))
      await mountTab({ role: 'syv', get })
      const dev = await screen.findByText('Förlängd tid')
      const item = dev.closest('.deviation-item')
      expect(within(item).getByText('Undantag')).toBeInTheDocument()
      expect(within(item).getByText('Väntande')).toBeInTheDocument()
      expect(within(item).getByText(/Ansökt av: SYV Test/)).toBeInTheDocument()
    })

    it('a teacher can report a deviation but not see earlier ones', async () => {
      client.put.mockResolvedValue(ok({}))
      client.post.mockResolvedValue(ok({ deviation: { _id: 'd2', type: 'revision', status: 'pending', title: 'Byte av kurs' } }))
      const { user } = await mountTab({ role: 'teacher', student: STUDENT({
          education: [
            { _id: 'e1', name: 'Svenska 1', isEnrollment: true, status: 'active' },
            { _id: 'e0', name: 'Engelska 5', isEnrollment: true, status: 'dropped' },
          ],
        }) })
      expect(screen.getByText('Du kan rapportera en avvikelse, men inte se tidigare avvikelser.')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '+ Ny avvikelse' }))
      const modal = screen.getByRole('heading', { name: 'Ny avvikelse' }).closest('.modal-content')
      const create = within(modal).getByRole('button', { name: 'Skapa' })
      expect(create).toBeDisabled()
      const [typeSelect, courseSelect] = within(modal).getAllByRole('combobox')
      await user.selectOptions(typeSelect, 'revision')
      await user.type(within(modal).getByPlaceholderText('Kort beskrivning'), 'Byte av kurs')
      // Dropped courses are not offered.
      expect(within(courseSelect).queryByText('Engelska 5')).toBeNull()
      await user.selectOptions(courseSelect, 'e1')
      await user.click(create)

      await waitFor(() =>
        expect(client.post).toHaveBeenCalledWith('/student-details/stu-1/deviations', {
          type: 'revision',
          title: 'Byte av kurs',
          description: '',
          reason: '',
          enrollmentId: 'e1',
        })
      )
      await waitFor(() => expect(toast.message).toBe('Avvikelse skapad.'))
      expect(client.get).not.toHaveBeenCalled()
    })

    it('reports a failed deviation', async () => {
      client.put.mockResolvedValue(ok({}))
      client.post.mockRejectedValue(httpError(500))
      const { user } = await mountTab({ role: 'teacher' })
      await user.click(screen.getByRole('button', { name: '+ Ny avvikelse' }))
      const modal = screen.getByRole('heading', { name: 'Ny avvikelse' }).closest('.modal-content')
      await user.type(within(modal).getByPlaceholderText('Kort beskrivning'), 'x')
      await user.click(within(modal).getByRole('button', { name: 'Skapa' }))
      await waitFor(() => expect(toast.message).toBe('Kunde inte skapa avvikelse.'))
    })
  })

  describe('avbrott (dropout)', () => {
    it('marks the student as avbrott only after confirmation', async () => {
      client.post.mockResolvedValue(ok({ student: { ...STUDENT(), dropout: 'true' } }))
      const { user, emitted } = await mountTab()
      const checkbox = screen.getByLabelText('Markera som avbrott')

      await user.click(checkbox)
      expect(checkbox).not.toBeChecked() // reverted until confirmed
      expect(await screen.findByText(/Test Elev kommer att markeras som inaktiv/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Bekräfta' }))

      await waitFor(() => expect(client.post).toHaveBeenCalledWith('/student-details/stu-1/dropout'))
      await waitFor(() => expect(toast.message).toBe('Eleven har markerats som avbrott (inaktiv).'))
      expect(emitted()['student-updated'].at(-1)[0].dropout).toBe(true)
      expect(screen.getByText(/INAKTIV/)).toBeInTheDocument()
    })

    it('reactivates a student marked as avbrott', async () => {
      client.delete.mockResolvedValue(ok({ student: { ...STUDENT(), dropout: false } }))
      const { user } = await mountTab({ student: STUDENT({ dropout: true }) })
      await user.click(screen.getByLabelText('Ta bort avbrott-status'))
      expect(await screen.findByText(/kommer att återaktiveras som aktiv elev/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Bekräfta' }))
      await waitFor(() => expect(client.delete).toHaveBeenCalledWith('/student-details/stu-1/dropout'))
      await waitFor(() => expect(toast.message).toBe('Avbrott-status har tagits bort för eleven.'))
    })

    it('reports the server error when marking fails', async () => {
      client.post.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { error: 'Saknar behörighet' } } }))
      const { user } = await mountTab()
      await user.click(screen.getByLabelText('Markera som avbrott'))
      await user.click(await screen.findByRole('button', { name: 'Bekräfta' }))
      await waitFor(() => expect(toast.message).toBe('Kunde inte markera elev som avbrott. Saknar behörighet'))
    })
  })

  describe('change history (admin)', () => {
    it('shows Swedish field labels, "tomt" for empty values and formatted dates', async () => {
      await mountTab({
        changeHistory: [
          {
            timestamp: '2026-10-05T08:30:00Z',
            changedByRole: 'coordinator',
            changes: ['endDate', 'municipality', 'exam'],
            previousValues: { endDate: '', municipality: { type: 'Sollentuna' }, exam: null },
            newValues: { endDate: '2026-12-20', municipality: { type: 'Stockholm' }, exam: 'Klar' },
          },
        ],
      })
      const history = card('Ändringshistorik')
      expect(within(history).getByText('Praktiksamordnare')).toBeInTheDocument()
      expect(within(history).getByText('Slutdatum')).toBeInTheDocument()
      expect(within(history).getByText('Kommun')).toBeInTheDocument()
      expect(within(history).getByText('Provstatus')).toBeInTheDocument()
      expect(within(history).getAllByText('tomt')).toHaveLength(2)
      expect(within(history).getByText('2026-12-20')).toBeInTheDocument()
      expect(within(history).getByText('Stockholm')).toBeInTheDocument()
    })

    it('says when there is no history', async () => {
      await mountTab()
      expect(within(card('Ändringshistorik')).getByText('Ingen ändringshistorik')).toBeInTheDocument()
    })
  })
})
