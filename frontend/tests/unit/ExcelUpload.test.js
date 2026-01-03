import { mount } from '@vue/test-utils'
import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'vuex'
import ExcelUpload from '../../src/views/Admin/ExcelUpload.vue'

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
                        },
                    ],
                });
            }
            if (url.includes('/api/all-programs')) {
                return Promise.resolve({ data: [] });
            }
            if (url.includes('/api/all-course-packages')) {
                return Promise.resolve({ data: [] });
            }
            if (url.includes('/api/all-courses')) {
                return Promise.resolve({ data: [] });
            }
            return Promise.reject(new Error(`404 Not Found: ${url}`));
        }),
        post: vi.fn(() => Promise.resolve({ data: 'Success' })),
        put: vi.fn(() => Promise.resolve({ data: 'Success' })),
        delete: vi.fn(() => Promise.resolve({ data: 'Success' })),
    };
    axiosMock.create = vi.fn(() => axiosMock);
    return {
        default: axiosMock,
    };
});


describe('ExcelUpload.vue', () => {
    let wrapper;
    let vuetify;
    let store;

    beforeEach(async () => {
        vi.clearAllMocks();
        store = createStore({
            state: {
                user: { name: 'Test User' },
            },
            getters: {
                isSystemAdmin: () => true,
            }
        });
        wrapper = mount(ExcelUpload, {
            global: {
                plugins: [vuetify, store],
            },
        });
        await wrapper.vm.$nextTick();
    });

    it('filters students based on search query', async () => {
        wrapper.vm.students = [
            { name: 'Alice' },
            { name: 'Bob' },
            { name: 'Charlie' },
        ];
        await wrapper.vm.$nextTick();

        wrapper.vm.searchQuery = 'b';
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.filteredStudents.length).toBe(1);
    });

    it('shows and hides flash messages', async () => {
        vi.useFakeTimers();
        wrapper.vm.showFlashMessage('success', 'Test message', 1000);
        expect(wrapper.vm.flashMessage.show).toBe(true);
        expect(wrapper.vm.flashMessage.type).toBe('success');
        expect(wrapper.vm.flashMessage.message).toBe('Test message');

        vi.advanceTimersByTime(1000);
        expect(wrapper.vm.flashMessage.show).toBe(false);
    });
    it('returns correct education label', () => {
        let edu = { name: 'Test Course' };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('Test Course');

        edu = { type: 'Course', refId: { courseName: 'Science' } };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('Science');

        edu = { type: 'CoursePackage', refId: { coursePackageName: 'Package A' } };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('CoursePackage: Package A');

        edu = { type: 'Program', refId: { programName: 'Program B' } };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('Program B');

        edu = { refId: null };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('(missing)');

        edu = { type: 'Invalid', refId: {} };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('(invalid type)');
    });
    it('formats comments correctly', () => {
        let comment = 'Hello\nWorld';
        expect(wrapper.vm.formatComment(comment)).toBe('Hello<br />World');

        comment = 'No newlines';
        expect(wrapper.vm.formatComment(comment)).toBe('No newlines');

        comment = null;
        expect(wrapper.vm.formatComment(comment)).toBe('');
    });
    it('toggles expanded comments', () => {
        wrapper.vm.expandedComments = [];
        wrapper.vm.toggleComment(1);
        expect(wrapper.vm.expandedComments).toContain(1);
        wrapper.vm.toggleComment(1);
        expect(wrapper.vm.expandedComments).not.toContain(1);
    });
    it('saves grade for a course', async () => {
        await wrapper.vm.saveGrade('student1', 'course1', 'A');
        expect(axios.put).toHaveBeenCalledWith(
            `${import.meta.env.VITE_API_URL}/api/student/student1/education/course1/grade`,
            { grade: 'A' }
        );
    });
});
