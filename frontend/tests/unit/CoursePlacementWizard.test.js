import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CoursePlacementWizard from '../../src/views/Student/CoursePlacementWizard.vue';

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

const mockToast = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}));

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => mockToast,
}));

import client from '@/api/client.js';

const course = {
    _id: 'course-1',
    courseName: 'Engelska 5',
    courseCode: 'ENG500',
    courseExtent: '5',
};

const student = {
    _id: 'stu-1',
    name: 'Anna Elev',
    municipality: { type: 'Uddevalla' },
};

const flush = async (wrapper) => {
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();
};

describe('CoursePlacementWizard.vue - individual course placement', () => {
    let wrapper;

    const mountWizard = async () => {
        wrapper = mount(CoursePlacementWizard, {
            props: { student },
            global: {
                stubs: { FileUploaderDownloader: true },
            },
        });
        await flush(wrapper);
    };

    beforeEach(() => {
        vi.resetAllMocks();
        client.get.mockImplementation((url) => {
            if (url === '/courses') return Promise.resolve({ data: [course] });
            if (url === '/coursepackages') return Promise.resolve({ data: [] });
            return Promise.resolve({ data: {} });
        });
        client.post.mockImplementation((url) => {
            if (url === '/placement/preview') {
                return Promise.resolve({
                    data: {
                        courses: [
                            {
                                courseId: 'course-1',
                                courseName: 'Engelska 5',
                                startDate: '2026-11-16T00:00:00.000Z',
                                endDate: '2026-12-21T00:00:00.000Z',
                                slutprovDate: '2026-12-09T00:00:00.000Z',
                                examMode: 'on-site',
                            },
                        ],
                        totalWeeks: 5,
                    },
                });
            }
            return Promise.resolve({ data: { success: true } });
        });
    });

    it('walks through all steps and submits the individual course with the preview dates', async () => {
        await mountWizard();

        // Step 1 (individual course is the default)
        wrapper.vm.placementType = 'course';
        await wrapper.vm.nextStep();
        expect(wrapper.vm.step).toBe(2);

        // Step 2 - pick the course
        wrapper.vm.selectedCourse = course;
        await wrapper.vm.nextStep();
        expect(wrapper.vm.step).toBe(3);

        // Step 3 - period. Pick a Sunday on purpose: the backend schedules the
        // next Monday, so the wizard must submit the previewed Monday and not
        // the raw picker value (the old code registered a Sunday off-by-one).
        wrapper.vm.startDate = '2026-11-15';
        await flush(wrapper);
        expect(wrapper.vm.effectiveStartDate).toBe('2026-11-16');
        expect(wrapper.vm.calculatedEndDate).toBe('2026-12-21');
        // The rendered summary must show the Monday the backend will register,
        // not the raw Sunday picker value.
        expect(wrapper.text()).toContain('2026-11-16');
        expect(wrapper.text()).toContain('2026-12-21');
        expect(wrapper.text()).not.toContain('2026-11-15');

        await wrapper.vm.nextStep();
        expect(wrapper.vm.step).toBe(4);

        await wrapper.vm.nextStep(); // -> exam config
        expect(wrapper.vm.step).toBe(5);

        await wrapper.vm.nextStep(); // loads preview and moves to review
        expect(client.post).toHaveBeenCalledWith(
            '/placement/preview',
            expect.objectContaining({
                studentId: 'stu-1',
                type: 'course',
                courseId: 'course-1',
                durationWeeks: 5,
            })
        );
        expect(wrapper.vm.step).toBe(6);
        expect(wrapper.vm.previewData.courses[0].slutprovDate).toBe('2026-12-09');

        await wrapper.vm.nextStep(); // -> confirm
        expect(wrapper.vm.step).toBe(7);

        await wrapper.vm.submitPlacement();

        expect(client.post).toHaveBeenCalledWith(
            '/process-education',
            expect.objectContaining({
                studentId: 'stu-1',
                educationEntries: [
                    expect.objectContaining({
                        type: 'Course',
                        refId: 'course-1',
                        name: 'Engelska 5',
                        startDate: '2026-11-16',
                        endDate: '2026-12-21',
                        slutprovDate: '2026-12-09',
                    }),
                ],
            })
        );
        expect(wrapper.vm.submitSuccess).toBe(true);

        wrapper.vm.closeWizard();
        expect(wrapper.emitted('placed')).toHaveLength(1);
    });

    it('shows an error instead of success when the backend reports a duplicate placement', async () => {
        await mountWizard();

        wrapper.vm.placementType = 'course';
        wrapper.vm.selectedCourse = course;
        await wrapper.vm.nextStep();
        wrapper.vm.startDate = '2026-11-16';
        await wrapper.vm.nextStep();
        await wrapper.vm.nextStep();
        await wrapper.vm.nextStep();
        await wrapper.vm.nextStep();

        client.post.mockImplementation((url) => {
            if (url === '/process-education') {
                return Promise.resolve({
                    data: {
                        success: true,
                        results: {
                            enrollments: [],
                            warnings: [
                                {
                                    type: 'duplicate_enrollment',
                                    message:
                                        'Kursen "Engelska 5" är redan placerad med samma start- och slutdatum och skapades inte igen.',
                                },
                            ],
                        },
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });

        await wrapper.vm.submitPlacement();

        expect(wrapper.vm.submitSuccess).toBe(false);
        expect(wrapper.vm.submitError).toContain('redan placerad');
        expect(mockToast.success).not.toHaveBeenCalled();
    });

    it('emits close (not placed) when the wizard is closed before submitting', async () => {
        await mountWizard();
        wrapper.vm.closeWizard();
        expect(wrapper.emitted('close')).toHaveLength(1);
        expect(wrapper.emitted('placed')).toBeUndefined();
    });
});
