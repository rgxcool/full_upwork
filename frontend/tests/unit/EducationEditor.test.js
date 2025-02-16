import { mount } from '@vue/test-utils'
import EducationEditor from '../../src/views/Admin/EducationEditor.vue'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import axios from 'axios'

// Mock API calls
vi.mock('axios')

describe('EducationEditor.vue', () => {
  let wrapper
  let vuetify

  beforeEach(async () => {
    vuetify = createVuetify()

    // Mock API responses
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/programs')) {
        return Promise.resolve({
          data: [{ _id: '1', programName: 'Test Program' }],
        })
      }
      if (url.includes('/api/program/1/courses')) {
        return Promise.resolve({
          data: [{ _id: '101', courseName: 'Test Course', courseCode: 'TC101' }],
        })
      }
      return Promise.reject(new Error('404 Not Found'))
    })

    axios.post.mockResolvedValue({ data: 'Course added successfully' })

    wrapper = mount(EducationEditor, {
      global: {
        plugins: [vuetify],
      },
    })

    // Wait for API calls to resolve
    await wrapper.vm.fetchPrograms()
  })

  it('selects a program, course, student, and adds course', async () => {
    // Select first program
    const programSelect = wrapper.findComponent({ name: 'VSelect' })
    await programSelect.vm.$emit('update:modelValue', '1')

    // Manually trigger `fetchAllCourses`
    await wrapper.vm.fetchAllCourses()
    await wrapper.vm.$nextTick()

    // Select first course
    const courseSelect = wrapper.findAllComponents({ name: 'VSelect' })[1]
    await courseSelect.vm.$emit('update:modelValue', '101')

    // Mock student data
    wrapper.setData({
      filteredStudents: [{ _id: '1001', name: 'Test Student' }],
    })
    await wrapper.vm.$nextTick()

    // Type in autocomplete
    const autocomplete = wrapper.findComponent({ name: 'VAutocomplete' })
    await autocomplete.vm.$emit('update:search', 'test')
    await autocomplete.vm.$emit('update:modelValue', { _id: '1001', name: 'Test Student' })

    // Click "Add Course to Student" button
    const addButton = wrapper.find('button')
    await addButton.trigger('click')

    // Verify the API call was made
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_URL}/api/student/1001/addcourse`,
      { courseId: '101' }
    )
  })
})
