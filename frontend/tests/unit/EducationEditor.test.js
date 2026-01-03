import { mount } from '@vue/test-utils'
import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EducationEditor from '../../src/views/Admin/EducationEditor.vue'

// ✅ Ensure axios is properly mocked without wrapping in `default`
vi.mock('axios', () => {
    const axiosMock = {
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
    }

    axiosMock.create = vi.fn(() => axiosMock)

    return {
        default: axiosMock,
    }
})

describe('EducationEditor.vue', () => {
    let wrapper
    let vuetify

    const mountEditor = async () => {
        wrapper = mount(EducationEditor, {
            global: {
                plugins: [vuetify],
            },
        })
        await wrapper.vm.$nextTick()
    }

    beforeEach(async () => {
        vi.resetAllMocks()

        const mockStudents = [
            { _id: '1', name: 'John Doe', personalNumber: '123456789', email: 'john@example.com' },
        ]
        const mockPrograms = [{ _id: '1', programName: 'Test Program' }]
        const mockCourses = [
            {
                _id: '101',
                courseName: 'Test Course',
                courseCode: 'TC101',
                displayText: 'Test Course (TC101)',
            },
        ]

        axios.get.mockImplementation((url) => {
            if (url.includes('/api/students')) return Promise.resolve({ data: mockStudents })
            if (url.includes('/api/all-programs')) return Promise.resolve({ data: mockPrograms })
            if (url.includes('/api/program/1/courses')) return Promise.resolve({ data: mockCourses })
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })

        axios.post.mockResolvedValue({ data: 'Course added successfully' })
        axios.put.mockResolvedValue({ data: { _id: '1', dropout: true } })
        axios.delete.mockResolvedValue({})

        await mountEditor()
    })

    it('fetches and loads students correctly', async () => {
        console.log('MOCKED AXIOS:', axios.get.mock.calls) // ✅ Debug what axios is being called with

        await wrapper.vm.fetchInitialData() // ✅ Manually call fetchInitialData() if needed

        console.log('STUDENT DATA:', wrapper.vm.students) // ✅ Debug fetched students

        expect(axios.get).toHaveBeenCalledWith(
            `${import.meta.env.VITE_API_URL}/api/students`,
            { withCredentials: true }
        )
        expect(wrapper.vm.students.length).toBe(1)
    })

    it('handles error on fetchInitialData', async () => {
        await wrapper.unmount()
        axios.get.mockRejectedValue(new Error('Network Error'))
        await mountEditor()
        expect(wrapper.vm.students.length).toBe(0)
    })
    it('does not fetch courses if no program is selected', async () => {
        wrapper.vm.selectedProgram = null;
        await wrapper.vm.fetchAllCourses();
    });
    it('handles error when fetching courses', async () => {
        axios.get.mockImplementation((url) => {
            if (url.includes('/api/program/1/courses')) {
                return Promise.reject(new Error('Network Error'))
            }
            return Promise.resolve({ data: [] })
        })
        wrapper.vm.selectedProgram = '1'
        await wrapper.vm.fetchAllCourses()
    })
    it('does not add course if no student is selected', async () => {
        wrapper.vm.selectedStudent = null;
        wrapper.vm.selectedIndividualCourse = '101';
        await wrapper.vm.handleAddCourse();
    });
    it('does not add course if no course is selected', async () => {
        wrapper.vm.selectedStudent = { _id: '1' };
        wrapper.vm.selectedIndividualCourse = null;
        await wrapper.vm.handleAddCourse();
    });
    it('handles error when adding a course', async () => {
        axios.post.mockRejectedValue(new Error('Network Error'));
        wrapper.vm.selectedStudent = { _id: '1' };
        wrapper.vm.selectedIndividualCourse = '101';
        await wrapper.vm.handleAddCourse();
    });
    it('shows top 5 students when search query is empty', async () => {
        wrapper.vm.searchQuery = ''
        const students = [
            { name: 'Alice' },
            { name: 'Bob' },
            { name: 'Charlie' },
            { name: 'David' },
            { name: 'Eve' },
            { name: 'Frank' },
        ]
        wrapper.vm.students = students
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.filteredStudents.length).toBe(5)
    })
    it('clears success message after 3 seconds', async () => {
        vi.useFakeTimers();
        wrapper.vm.selectedStudent = { _id: '1', name: 'John Doe' };
        wrapper.vm.selectedIndividualCourse = '101';
        wrapper.vm.allCourses = [{ _id: '101', displayText: 'Test Course' }];
        await wrapper.vm.handleAddCourse();
        expect(wrapper.vm.successMessage).not.toBe('');
        vi.advanceTimersByTime(3000);
        expect(wrapper.vm.successMessage).toBe('');
        vi.useRealTimers();
    });

    it('can add course successfully to student', async () => {
        wrapper.vm.selectedStudent = { _id: '1', name: 'John Doe' }
        wrapper.vm.selectedIndividualCourse = '101'
        wrapper.vm.allCourses = [{ _id: '101', displayText: 'Test Course (TC101)' }]
        await wrapper.vm.handleAddCourse()
        expect(axios.post).toHaveBeenCalledWith(
            `${import.meta.env.VITE_API_URL}/api/student/1/addcourse`,
            { courseId: '101' }
        )
        expect(wrapper.vm.successMessage).toContain('John Doe has been enrolled')
    })
})
