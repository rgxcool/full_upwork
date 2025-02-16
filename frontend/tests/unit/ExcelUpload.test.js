import { mount } from '@vue/test-utils'
import ExcelUpload from '../../src/views/Admin/ExcelUpload.vue'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import axios from 'axios'

// Mock API calls
vi.mock('axios')

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

    // Mock API response
    axios.get.mockResolvedValue({
      data: [
        {
          _id: '1',
          name: 'John Doe',
          personalNumber: '123456789',
          coursePackages: [{ coursePackageId: { coursePackageName: 'Test Package' } }],
          courses: [{ courseId: { courseName: 'Math 101', courseCode: 'M101' } }],
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          finalExamDate: '2024-06-10',
          municipality: 'Test City',
          phone: '1234567890',
          email: 'john@example.com',
          exam: 'Passed',
          additionalInfo: 'None',
          teacher: 'Mr. Smith',
          dropout: false,
        },
      ],
    })

    await wrapper.vm.fetchStudents()
  })

  it('updates selected file name on file selection', async () => {
    const file = new File(['test content'], 'test.xlsx', { type: 'application/vnd.ms-excel' })
    const input = wrapper.find('input[type="file"]')

    // Simulate file selection event
    await input.element.dispatchEvent(new Event('change', { bubbles: true }))
    await wrapper.vm.handleFileUpload({ target: { files: [file] } })

    expect(wrapper.vm.selectedFileName).toBe('test.xlsx')
  })

  it('uploads file and fetches students after success', async () => {
    // Mock file
    const file = new File(['test content'], 'test.xlsx', { type: 'application/vnd.ms-excel' })
    wrapper.setData({ file })

    // Mock API Response
    axios.post.mockResolvedValue({ data: 'Upload successful' })

    // Trigger file upload
    await wrapper.vm.uploadFile()

    // Expect API call to be made
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_URL}/api/upload/xlsxupload`,
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )

    // Ensure fetchStudents is called
    expect(axios.get).toHaveBeenCalledWith(`${import.meta.env.VITE_API_URL}/api/students`)
  })

  it('filters students based on search query', async () => {
    await wrapper.setData({ searchQuery: 'John' })
    expect(wrapper.vm.filteredStudents.length).toBe(1)

    await wrapper.setData({ searchQuery: 'Jane' })
    expect(wrapper.vm.filteredStudents.length).toBe(0)
  })

  it('deletes a student when delete button is clicked', async () => {
    axios.delete.mockResolvedValue({})

    // Find delete button and trigger click
    const deleteButton = wrapper.find('button.btn-danger')
    await deleteButton.trigger('click')

    // Ensure delete API was called
    expect(axios.delete).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/students|\/api\/student\/1/)
    )
  })

  it('deletes all students when delete all button is clicked', async () => {
    axios.delete.mockResolvedValue({})

    // Find delete all button and trigger click
    const deleteAllButton = wrapper.find('.delete-all-btn')
    await deleteAllButton.trigger('click')

    // Ensure delete all API was called
    expect(axios.delete).toHaveBeenCalledWith(`${import.meta.env.VITE_API_URL}/api/students`)
  })

  it('updates student dropout status when checkbox is clicked', async () => {
    axios.put.mockResolvedValue({ data: { _id: '1', dropout: true } })

    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setChecked()

    // Ensure API was called
    expect(axios.put).toHaveBeenCalledWith(`${import.meta.env.VITE_API_URL}/api/student/1`, {
      dropout: true,
    })
  })
})
