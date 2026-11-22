import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DocumentSection from '@/views/Admin/SearchTabs/DocumentSection.vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'
import { buildStore } from '../../helpers/render.js'

// Student / staff documents (search details, course archive, staff documents tab). Covers which
// documents are requested, who may upload / delete / share, and the upload payload.

vi.mock('@/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const toast = useToast().state

const student = { _id: 'stu-1', name: 'Test Elev' }
const teacherUser = { _id: 'user-t1', name: 'Test Lärare' }
const docs = [
  { _id: 'd1', filename: 'f1.pdf', originalName: 'Intyg.pdf', type: 'GENERAL', uploadedBy: 'user-t1' },
  { _id: 'd2', filename: 'f2.pdf', originalName: 'Avtal.pdf', type: 'CONTRACT', uploadedBy: 'admin-1', sharedWith: ['x', 'y'] },
]

const mountSection = (props, { isAdmin = false, userId = 'user-t1', role = 'teacher' } = {}) =>
  mount(DocumentSection, {
    props,
    global: {
      plugins: [buildStore({ getters: { isAdmin, userRole: role }, state: { user: { userId } } })],
    },
  })

const pickFile = async (wrapper, name = 'betyg.pdf') => {
  const file = new File(['%PDF'], name, { type: 'application/pdf' })
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  return file
}

describe('DocumentSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toast.message = ''
    client.get.mockResolvedValue({ data: docs })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('without a student or teacher it explains that documents are unavailable', async () => {
    const wrapper = mountSection({})
    await flushPromises()
    expect(wrapper.text()).toContain('Dokumenthantering är endast tillgänglig för elever och lärare.')
    expect(client.get).not.toHaveBeenCalled()
  })

  it('loads a student\'s documents for the given type and enrollment', async () => {
    const wrapper = mountSection({ student, type: 'APL', enrollmentId: 'e1' }, { isAdmin: true })
    await flushPromises()
    expect(client.get).toHaveBeenCalledWith('/documents/stu-1', { params: { type: 'APL', enrollmentId: 'e1' } })
    expect(wrapper.findAll('.document-link').map((a) => a.text())).toEqual(['Intyg.pdf', 'Avtal.pdf'])
    expect(wrapper.find('.document-link').attributes('href')).toMatch(/\/uploads\/f1\.pdf$/)
    expect(wrapper.text()).toContain('(uppladdad av admin)')
    expect(wrapper.text()).toContain('Delad med 2 användare')
  })

  it('reloads when the enrollment changes', async () => {
    const wrapper = mountSection({ student, enrollmentId: 'e1' }, { isAdmin: true })
    await flushPromises()
    await wrapper.setProps({ enrollmentId: 'e2' })
    await flushPromises()
    expect(client.get).toHaveBeenLastCalledWith('/documents/stu-1', { params: { type: 'GENERAL', enrollmentId: 'e2' } })
  })

  it('shows the empty state', async () => {
    client.get.mockResolvedValue({ data: [] })
    const wrapper = mountSection({ student }, { isAdmin: true })
    await flushPromises()
    expect(wrapper.text()).toContain('Inga dokument uppladdade än.')
  })

  it('an admin uploads a file for a student with type and enrollment', async () => {
    client.post.mockResolvedValue({ data: {} })
    const wrapper = mountSection({ student, type: 'APL', enrollmentId: 'e1' }, { isAdmin: true })
    await flushPromises()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    const file = await pickFile(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [url, form, config] = client.post.mock.calls[0]
    expect(url).toBe('/documents/upload')
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
    expect(form.get('file')).toBe(file)
    expect(form.get('studentId')).toBe('stu-1')
    expect(form.get('teacherId')).toBeNull()
    expect(form.get('type')).toBe('APL')
    expect(form.get('enrollmentId')).toBe('e1')
    expect(client.get).toHaveBeenCalledTimes(2) // reloaded after upload
    expect(toast.message).toBe('Filen laddades upp framgångsrikt!')
  })

  it('reports a failed upload', async () => {
    client.post.mockRejectedValue(new Error('413'))
    const wrapper = mountSection({ student }, { isAdmin: true })
    await flushPromises()
    await pickFile(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(toast.message).toBe('Kunde inte ladda upp filen: 413')
  })

  it('submitting without a file asks for one', async () => {
    const wrapper = mountSection({ student }, { isAdmin: true })
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    expect(toast.message).toBe('Välj en fil och kontrollera att användar-ID är korrekt')
    expect(client.post).not.toHaveBeenCalled()
  })

  describe('with document types', () => {
    const uploadTypes = [
      { value: 'GENERAL', label: 'Allmänt' },
      { value: 'CONTRACT', label: 'Avtal' },
      { value: 'NOTE', label: 'Personalanteckning', staffOnly: true },
    ]

    it('requests all types, labels each document and uploads with the chosen type', async () => {
      client.post.mockResolvedValue({ data: {} })
      const wrapper = mountSection({ student, uploadTypes }, { isAdmin: true, role: 'admin' })
      await flushPromises()
      expect(client.get).toHaveBeenCalledWith('/documents/stu-1', { params: { type: 'GENERAL,CONTRACT,NOTE' } })
      expect(wrapper.findAll('.doc-type-badge').map((b) => b.text())).toEqual(['Allmänt', 'Avtal'])
      expect(wrapper.findAll('select option').map((o) => o.text())).toEqual(['Allmänt', 'Avtal', 'Personalanteckning'])

      await wrapper.find('select').setValue('CONTRACT')
      await pickFile(wrapper)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(client.post.mock.calls[0][1].get('type')).toBe('CONTRACT')
    })

    it('never offers staff-only types to a student', async () => {
      const wrapper = mountSection(
        { userData: { _id: 'user-s1' }, userType: 'student', uploadTypes },
        { role: 'student', userId: 'user-s1' }
      )
      await flushPromises()
      expect(wrapper.findAll('select option').map((o) => o.text())).toEqual(['Allmänt', 'Avtal'])
    })
  })

  describe('staff documents (teacher)', () => {
    it('a teacher sees their own documents with entityType=teacher and uploads as teacher', async () => {
      client.post.mockResolvedValue({ data: {} })
      const wrapper = mountSection({ userData: teacherUser, userType: 'teacher', type: 'GENERAL' })
      await flushPromises()
      expect(client.get).toHaveBeenCalledWith('/documents/user-t1', { params: { type: 'GENERAL', entityType: 'teacher' } })
      await pickFile(wrapper)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(client.post.mock.calls[0][1].get('teacherId')).toBe('user-t1')
      expect(client.post.mock.calls[0][1].get('studentId')).toBeNull()
    })

    it('another teacher can neither upload nor delete', async () => {
      const wrapper = mountSection({ userData: teacherUser, userType: 'Lärare' }, { userId: 'user-t2' })
      await flushPromises()
      expect(wrapper.find('.upload-section').exists()).toBe(false)
      expect(wrapper.findAll('.delete-btn')).toHaveLength(0)
    })

    it('deletes a document after confirmation and reloads', async () => {
      client.delete.mockResolvedValue({ data: {} })
      const wrapper = mountSection({ userData: teacherUser, userType: 'teacher' })
      await flushPromises()
      await wrapper.findAll('.delete-btn')[0].trigger('click')
      await flushPromises()
      expect(globalThis.confirm).toHaveBeenCalled()
      expect(client.delete).toHaveBeenCalledWith('/documents/d1')
      expect(client.get).toHaveBeenCalledTimes(2)
    })

    it('keeps the document when deletion is not confirmed', async () => {
      globalThis.confirm.mockReturnValueOnce(false)
      const wrapper = mountSection({ userData: teacherUser, userType: 'teacher' })
      await flushPromises()
      await wrapper.findAll('.delete-btn')[0].trigger('click')
      await flushPromises()
      expect(client.delete).not.toHaveBeenCalled()
    })

    it('reports a failed delete', async () => {
      client.delete.mockRejectedValue(new Error('403'))
      const wrapper = mountSection({ userData: teacherUser, userType: 'teacher' })
      await flushPromises()
      await wrapper.findAll('.delete-btn')[0].trigger('click')
      await flushPromises()
      expect(toast.message).toBe('Kunde inte radera dokumentet: 403')
    })

    it('shares only documents the teacher uploaded, by e-mail', async () => {
      client.put.mockResolvedValue({ data: {} })
      const wrapper = mountSection({ userData: teacherUser, userType: 'teacher', allowSharing: true })
      await flushPromises()
      const shareButtons = wrapper.findAll('.share-btn')
      expect(shareButtons).toHaveLength(1) // d1 only; d2 was uploaded by an admin

      await shareButtons[0].trigger('click')
      const save = wrapper.findAll('.share-controls button').find((b) => b.text() === 'Spara')
      expect(save.attributes('disabled')).toBeDefined()
      await wrapper.find('.share-input').setValue('  kollega@example.invalid ')
      await save.trigger('click')
      await flushPromises()

      expect(client.put).toHaveBeenCalledWith('/documents/d1/share', { email: 'kollega@example.invalid' })
      expect(toast.message).toBe('Dokumentet delades')
      expect(wrapper.find('.share-controls').exists()).toBe(false)
    })

    it('shows the server message when sharing fails, and cancel closes the form', async () => {
      client.put.mockRejectedValue({ response: { data: { message: 'Mottagaren finns inte' } } })
      const wrapper = mountSection({ userData: teacherUser, userType: 'teacher', allowSharing: true })
      await flushPromises()
      await wrapper.find('.share-btn').trigger('click')
      await wrapper.find('.share-input').setValue('okand@example.invalid')
      await wrapper.find('.share-input').trigger('keyup.enter')
      await flushPromises()
      expect(toast.message).toBe('Mottagaren finns inte')

      await wrapper.findAll('.share-controls button').find((b) => b.text() === 'Avbryt').trigger('click')
      expect(wrapper.find('.share-controls').exists()).toBe(false)
    })

    it('sharing is off unless the caller allows it', async () => {
      const wrapper = mountSection({ userData: teacherUser, userType: 'teacher' })
      await flushPromises()
      expect(wrapper.findAll('.share-btn')).toHaveLength(0)
    })
  })
})
