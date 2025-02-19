import { mount } from '@vue/test-utils'
import ExcelUpload from '../../src/views/Admin/ExcelUpload.vue'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import axios from 'axios'

// ✅ Corrected mock to remove `default`
// ✅ Correct way to mock axios with a `default` export
vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn((url) => {
        if (url.includes('/api/students')) {
          return Promise.resolve({
            data: [
              {
                _id: '1',
                name: 'John Doe',
                personalNumber: '123456789',
                email: 'john@example.com',
                coursePackages: [{ coursePackageId: { coursePackageName: 'Test Package' } }],
                courses: [{ courseId: { courseName: 'Math 101', courseCode: 'M101' } }],
                startDate: '2024-01-01',
                endDate: '2024-06-01',
                finalExamDate: '2024-06-10',
                municipality: 'Test City',
                phone: '1234567890',
                exam: 'Passed',
                additionalInfo: 'None',
                teacher: 'Mr. Smith',
                dropout: false,
              },
            ],
          })
        }
        if (url.includes('/api/programs')) {
          return Promise.resolve({
            data: [
              {
                _id: '1',
                programName: 'Test Program',
              },
            ],
          })
        }
        if (url.includes('/api/courses')) {
          return Promise.resolve({
            data: [
              {
                _id: '101',
                courseName: 'Test Course',
                courseCode: 'TC101',
              },
            ],
          })
        }
        return Promise.resolve({ data: [] })
      }),

      post: vi.fn((url) => {
        if (url.includes('/api/upload/xlsxupload')) {
          return Promise.resolve({ data: 'Upload successful' })
        }
        return Promise.resolve({ data: { success: true } })
      }),

      put: vi.fn((url, body) => {
        if (url.includes('/api/student/') && body.dropout !== undefined) {
          return Promise.resolve({ data: { _id: '1', dropout: body.dropout } })
        }
        return Promise.resolve({ data: { success: true } })
      }),

      delete: vi.fn((url) => {
        if (url.includes('/api/student/')) {
          return Promise.resolve({})
        }
        if (url.includes('/api/students')) {
          return Promise.resolve({})
        }
        return Promise.resolve({})
      }),
    },
  }
})

describe('ExcelUpload.vue', () => {
  let wrapper
  let vuetify

  beforeEach(async () => {
    vuetify = createVuetify()
    wrapper = mount(ExcelUpload, {
      global: {
        plugins: [vuetify],
      },
    })

    await wrapper.vm.fetchStudents()
  })

  it('updates selected file name on file selection', async () => {
    const file = new File(['test content'], 'test.xlsx', { type: 'application/vnd.ms-excel' })
    const input = wrapper.find('input[type="file"]')

    await input.element.dispatchEvent(new Event('change', { bubbles: true }))
    await wrapper.vm.handleFileUpload({ target: { files: [file] } })

    expect(wrapper.vm.selectedFileName).toBe('test.xlsx')
  })

  it('uploads file and fetches students after success', async () => {
    const file = new File(['test content'], 'test.xlsx', { type: 'application/vnd.ms-excel' })
    wrapper.setData({ file })

    await wrapper.vm.uploadFile()

    // ✅ No `.default`, just `axios.post`
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_URL}/api/upload/xlsxupload`,
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )

    expect(axios.get).toHaveBeenCalledWith(`${import.meta.env.VITE_API_URL}/api/students`)
  })

  it('filters students based on search query', async () => {
    await wrapper.setData({ searchQuery: 'John' })
    expect(wrapper.vm.filteredStudents.length).toBe(1)

    await wrapper.setData({ searchQuery: 'Jane' })
    expect(wrapper.vm.filteredStudents.length).toBe(0)
  })

  it('deletes a student when delete button is clicked', async () => {
    const deleteButton = wrapper.find('button.delete-single-button')
    await deleteButton.trigger('click')

    expect(axios.delete).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/students|\/api\/student\/1/)
    )
  })

  it('deletes all students when delete all button is clicked', async () => {
    const deleteAllButton = wrapper.find('.delete-all-btn')
    await deleteAllButton.trigger('click')

    expect(axios.delete).toHaveBeenCalledWith(`${import.meta.env.VITE_API_URL}/api/students`)
  })

  it('updates student dropout status when dropout button is clicked', async () => {
    const buttons = wrapper.findAll('.dropout-btn')
    expect(buttons.length).toBeGreaterThan(0)

    await buttons[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(axios.put).toHaveBeenCalledWith(`${import.meta.env.VITE_API_URL}/api/student/1`, {
      dropout: true,
    })

    axios.put.mockResolvedValueOnce({ data: { _id: '1', dropout: false } })
    await buttons[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(axios.put).toHaveBeenCalledWith(`${import.meta.env.VITE_API_URL}/api/student/1`, {
      dropout: false,
    })
  })
})
