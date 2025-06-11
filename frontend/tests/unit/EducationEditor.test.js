import { mount } from '@vue/test-utils'
import EducationEditor from '../../src/views/Admin/EducationEditor.vue'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import axios from 'axios'

// ✅ Ensure axios is properly mocked without wrapping in `default`
vi.mock('axios', () => ({
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
              courses: [{ courseId: { courseName: 'Math 101', courseCode: 'M101' } }],
              startDate: '2024-01-01',
              endDate: '2024-06-01',
              finalExamDate: '2024-06-10',
              municipality: 'Test City',
              phone: '1234567890',
              teacher: 'Mr. Smith',
              dropout: false,
            },
          ],
        })
      }
      if (url.includes('/api/all-programs')) {
        return Promise.resolve({
          data: [{ _id: '1', programName: 'Test Program' }],
        })
      }
      if (url.includes('/api/program/1/courses')) {
        return Promise.resolve({
          data: [
            {
              _id: '101',
              courseName: 'Test Course',
              courseCode: 'TC101',
              displayText: 'Test Course (TC101)',
            },
          ],
        })
      }
      return Promise.reject(new Error(`404 Not Found: ${url}`))
    }),

    post: vi.fn(() => Promise.resolve({ data: 'Course added successfully' })),

    put: vi.fn(() => Promise.resolve({ data: { _id: '1', dropout: true } })),

    delete: vi.fn(() => Promise.resolve({})),
  },
}))

describe('EducationEditor.vue', () => {
  let wrapper
  let vuetify

  beforeEach(async () => {
    vi.clearAllMocks()

    // ✅ Declare mock data before assignment
    let mockStudents = [
      { _id: '1', name: 'John Doe', personalNumber: '123456789', email: 'john@example.com' },
    ]
    let mockPrograms = [{ _id: '1', programName: 'Test Program' }]
    let mockCourses = [
      {
        _id: '101',
        courseName: 'Test Course',
        courseCode: 'TC101',
        displayText: 'Test Course (TC101)',
      },
    ]

    // ✅ Set axios mocks to return preloaded data
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/students')) return Promise.resolve({ data: mockStudents })
      if (url.includes('/api/all-programs')) return Promise.resolve({ data: mockPrograms })
      if (url.includes('/api/program/1/courses')) return Promise.resolve({ data: mockCourses })
      return Promise.reject(new Error(`404 Not Found: ${url}`))
    })

    vuetify = createVuetify()
    wrapper = mount(EducationEditor, {
      global: {
        plugins: [vuetify],
      },
    })

    await wrapper.vm.$nextTick()
  })

  it('fetches and loads students correctly', async () => {
    console.log('MOCKED AXIOS:', axios.get.mock.calls) // ✅ Debug what axios is being called with

    await wrapper.vm.fetchInitialData() // ✅ Manually call fetchInitialData() if needed

    console.log('STUDENT DATA:', wrapper.vm.students) // ✅ Debug fetched students

    expect(axios.get).toHaveBeenCalledWith(`${import.meta.env.VITE_API_URL}/api/students`)
    expect(wrapper.vm.students.length).toBe(1)
    expect(wrapper.vm.students[0].name).toBe('John Doe')
  })

  it('can add course successfully to student', async () => {
    console.log('MOCKED AXIOS:', axios.get.mock.calls) // Debug axios calls

    // Select program
    const programSelect = wrapper.findComponent({ name: 'VSelect' })
    expect(programSelect.exists()).toBe(true) // ✅ Ensure dropdown exists
    await programSelect.vm.$emit('update:modelValue', '1')

    // Fetch courses
    await wrapper.vm.fetchAllCourses()
    await wrapper.vm.$nextTick()

    // Select a course
    const courseSelect = wrapper.findAllComponents({ name: 'VSelect' })[1]
    expect(courseSelect.exists()).toBe(true) // ✅ Ensure course select exists
    await courseSelect.vm.$emit('update:modelValue', '101')

    // ✅ Directly update `searchQuery`
    wrapper.vm.searchQuery = 'John'
    await wrapper.vm.$nextTick()

    // ✅ Log filtered students to debug
    console.log('FILTERED STUDENTS:', wrapper.vm.filteredStudents)

    // ✅ Ensure `filteredStudents` contains data before selecting
    expect(wrapper.vm.filteredStudents.length).toBeGreaterThan(0)

    // ✅ Select the student (Vue 3 way)
    wrapper.vm.selectedStudent = wrapper.vm.filteredStudents[0]
    await wrapper.vm.$nextTick()

    // ✅ Ensure form is correct before clicking
    console.log('FINAL SELECTED STUDENT:', wrapper.vm.selectedStudent)
    console.log('FINAL SELECTED COURSE:', wrapper.vm.selectedIndividualCourse)

    // Find and Click the "Add Course to Student" button
    const addButton = wrapper.find('button')
    expect(addButton.exists()).toBe(true) // ✅ Ensure button exists
    await addButton.trigger('click')

    console.log('MOCKED AXIOS (POST):', axios.post.mock.calls) // ✅ Debug post requests

    // ✅ Ensure API call was made
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_URL}/api/student/1/addcourse`,
      { courseId: '101' }
    )
  })
})
