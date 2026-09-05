import { describe, it, expect, vi, afterEach } from "vitest";
import mongoose from "mongoose";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Course from "../../src/models/Course.js";
import CourseTemplate from "../../src/models/CourseTemplate.js";
import TeacherScheduleParameters from "../../src/models/TeacherScheduleParameters.js";

describe("CourseMatchingService date helpers", () => {
    it("getNextMonday returns the same day when input is already a Monday", () => {
        const monday = new Date("2026-01-05T10:00:00");
        const result = CourseMatchingService.getNextMonday(monday);
        expect(result.getDay()).toBe(1);
        expect(result.getDate()).toBe(5);
        expect(result.getHours()).toBe(0);
    });

    it("getNextMonday rolls forward to the next Monday from a Sunday", () => {
        const sunday = new Date("2026-01-04T10:00:00");
        const result = CourseMatchingService.getNextMonday(sunday);
        expect(result.getDay()).toBe(1);
        expect(result.getDate()).toBe(5);
    });

    it("getNextMonday rolls forward to next Monday from a Saturday", () => {
        const saturday = new Date("2026-01-10T10:00:00");
        const result = CourseMatchingService.getNextMonday(saturday);
        expect(result.getDay()).toBe(1);
        expect(result.getDate()).toBe(12);
    });

    it("addWeeks shifts dates by the requested number of weeks", () => {
        const start = new Date("2026-01-05T12:00:00");
        const result = CourseMatchingService.addWeeks(start, 3);
        expect(result.getDate()).toBe(26);
        expect(result.getMonth()).toBe(0);
    });

    it("getWednesdayOfWeek returns Wednesday of the requested week", () => {
        const start = new Date("2026-01-05"); // Monday
        const result = CourseMatchingService.getWednesdayOfWeek(start, 1);
        expect(result.getDay()).toBe(3);
        expect(result.getDate()).toBe(7);
        expect(result.getHours()).toBe(0);
    });

    it("getWednesdayOfWeek handles a startDate already on Wednesday", () => {
        const start = new Date("2026-01-07"); // Wednesday
        const result = CourseMatchingService.getWednesdayOfWeek(start, 3);
        expect(result.getDay()).toBe(3);
    });
});

describe("CourseMatchingService.getDefaultExamMode", () => {
    it("defaults to on-site when municipality is missing", () => {
        expect(CourseMatchingService.getDefaultExamMode(undefined)).toBe("on-site");
        expect(CourseMatchingService.getDefaultExamMode("")).toBe("on-site");
        expect(CourseMatchingService.getDefaultExamMode({})).toBe("on-site");
    });

    it("returns remote for Upplands Bro string variants", () => {
        expect(CourseMatchingService.getDefaultExamMode("Upplands Bro")).toBe("remote");
        expect(CourseMatchingService.getDefaultExamMode("upplandsbro")).toBe("remote");
        expect(CourseMatchingService.getDefaultExamMode("Upplands-Bro")).toBe("remote");
    });

    it("returns remote when stored as an object with type", () => {
        expect(
            CourseMatchingService.getDefaultExamMode({ type: "Upplands Bro" })
        ).toBe("remote");
    });

    it("returns on-site for other municipalities", () => {
        expect(CourseMatchingService.getDefaultExamMode("Sollentuna")).toBe("on-site");
        expect(CourseMatchingService.getDefaultExamMode({ type: "Lidingö" })).toBe(
            "on-site"
        );
    });
});

describe("CourseMatchingService.cleanCourseName", () => {
    it("uppercases, strips parentheses, mot, separators and collapses spaces", () => {
        expect(CourseMatchingService.cleanCourseName("matematik (mot)"))
            .toBe("MATEMATIK");
        expect(CourseMatchingService.cleanCourseName("Matte; Engelska|Sve"))
            .toBe("MATTE ENGELSKASVE");
        expect(CourseMatchingService.cleanCourseName("  kurs    namn  "))
            .toBe("KURS NAMN");
        expect(CourseMatchingService.cleanCourseName("programmering mot"))
            .toBe("PROGRAMMERING");
    });
});

describe("CourseMatchingService.findBestCourseMatch", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null for empty input", async () => {
        await expect(CourseMatchingService.findBestCourseMatch("")).resolves.toBeNull();
        await expect(CourseMatchingService.findBestCourseMatch(null)).resolves.toBeNull();
        await expect(
            CourseMatchingService.findBestCourseMatch(undefined)
        ).resolves.toBeNull();
    });

    it("returns an exact match when found among active courses", async () => {
        const course = { courseCode: "MAT101", courseName: "Matematik 1" };
        vi.spyOn(Course, "find").mockResolvedValue([course]);
        const result = await CourseMatchingService.findBestCourseMatch(" mat 101 ");
        expect(Course.find).toHaveBeenCalledWith({ isActive: true });
        expect(result).toEqual({ course, score: 1.0 });
    });

    it("falls back to all courses when no active courses exist", async () => {
        vi.spyOn(Course, "find")
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ courseCode: "BIO1" }]);
        const result = await CourseMatchingService.findBestCourseMatch("BIO1");
        expect(Course.find).toHaveBeenNthCalledWith(2, {});
        expect(result.course.courseCode).toBe("BIO1");
    });

    it("returns null when there is no exact code match", async () => {
        vi.spyOn(Course, "find").mockResolvedValue([{ courseCode: "MAT101" }]);
        const result = await CourseMatchingService.findBestCourseMatch("ENG101");
        expect(result).toBeNull();
    });
});

describe("CourseMatchingService.resolveCourseTemplate", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resolves the active template sorted by updatedAt", async () => {
        const template = { _id: "tpl1", modules: [{ moduleNumber: 1 }] };
        const sortMock = vi.fn().mockResolvedValue(template);
        vi.spyOn(CourseTemplate, "findOne").mockReturnValue({ sort: sortMock });

        const result = await CourseMatchingService.resolveCourseTemplate("course1");

        expect(CourseTemplate.findOne).toHaveBeenCalledWith({
            courseId: "course1",
        });
        expect(sortMock).toHaveBeenCalledWith({ isActive: -1, updatedAt: -1 });
        expect(result).toBe(template);
    });

    it("returns null when no template exists", async () => {
        vi.spyOn(CourseTemplate, "findOne").mockReturnValue({
            sort: vi.fn().mockResolvedValue(null),
        });
        const result = await CourseMatchingService.resolveCourseTemplate("course1");
        expect(result).toBeNull();
    });
});

describe("CourseMatchingService.findOrCreateCourseInstance", () => {
    let courseInstanceSave;

    const mockExisting = (overrides = {}) => ({
        courseName: "Matematik 1",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-02-06"),
        responsibleTeacher: null,
        slutprovDate: undefined,
        save: vi.fn().mockResolvedValue(this),
        ...overrides,
    });

    const mockCourse = (overrides = {}) => ({
        _id: "course1",
        courseCode: "MAT",
        courseName: "Matematik 1",
        coursePoints: 100,
        courseExtent: "5",
        ...overrides,
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns existing instance untouched when nothing to update", async () => {
        const existing = {
            ...mockExisting(),
            _id: "inst1",
            responsibleTeacher: "t1",
        };
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(existing);

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            "course1",
            new Date("2026-01-01"),
            new Date("2026-02-06")
        );

        expect(result.wasCreated).toBe(false);
        expect(result.instance).toBe(existing);
        expect(existing.save).not.toHaveBeenCalled();
    });

    it("sets responsibleTeacher on existing instance when missing", async () => {
        const existing = mockExisting();
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(existing);

        await CourseMatchingService.findOrCreateCourseInstance(
            "course1",
            existing.startDate,
            existing.endDate,
            null,
            "teacher1",
            null
        );

        expect(existing.responsibleTeacher).toBe("teacher1");
        expect(existing.save).toHaveBeenCalled();
    });

    it("updates responsibleTeacher when it differs from the provided teacher", async () => {
        const existing = mockExisting({ responsibleTeacher: "teacher-old" });
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(existing);

        await CourseMatchingService.findOrCreateCourseInstance(
            "course1",
            existing.startDate,
            existing.endDate,
            null,
            "teacher-new",
            null
        );

        expect(existing.responsibleTeacher).toBe("teacher-new");
        expect(existing.save).toHaveBeenCalled();
    });

    it("force-patches slutprovDate when provided without a teacher", async () => {
        const existing = mockExisting();
        const slutprov = new Date("2026-03-01");
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(existing);

        await CourseMatchingService.findOrCreateCourseInstance(
            "course1",
            existing.startDate,
            existing.endDate,
            null,
            null,
            slutprov
        );

        expect(existing.slutprovDate).toBe(slutprov);
        expect(existing.save).toHaveBeenCalled();
    });

    it("clears slutprovDate when a teacher is set and no explicit date is given", async () => {
        const existing = mockExisting({
            responsibleTeacher: "t1",
            slutprovDate: new Date("2026-03-01"),
        });
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(existing);

        await CourseMatchingService.findOrCreateCourseInstance(
            "course1",
            existing.startDate,
            existing.endDate,
            null,
            "t1"
        );

        expect(existing.slutprovDate).toBeUndefined();
        expect(existing.save).toHaveBeenCalled();
    });

    it("throws when the main course does not exist", async () => {
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(null);
        vi.spyOn(Course, "findById").mockResolvedValue(null);

        await expect(
            CourseMatchingService.findOrCreateCourseInstance(
                "missing",
                new Date("2026-01-01"),
                new Date("2026-05-01")
            )
        ).rejects.toThrow("Main course not found");
    });

    it("creates a new instance with default section dates and no template content", async () => {
        const mainCourse = mockCourse();
        const start = new Date("2026-01-05");
        const end = new Date("2026-02-09"); // 5 weeks
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(null);
        vi.spyOn(Course, "findById").mockResolvedValue(mainCourse);
        vi.spyOn(CourseTemplate, "findOne").mockReturnValue({
            sort: vi.fn().mockResolvedValue(null),
        });
        vi.spyOn(TeacherScheduleParameters, "findOne").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        courseInstanceSave = vi
            .spyOn(CourseInstance.prototype, "save")
            .mockImplementation(function () {
                return Promise.resolve(this);
            });

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            mainCourse._id,
            start,
            end,
            "user1"
        );

        expect(result.wasCreated).toBe(true);
        expect(result.instance.courseCode).toBe("MAT2601");
        expect(result.instance.modules).toEqual([]);
        expect(result.instance.sectionDates).toHaveLength(5);
        expect(courseInstanceSave).toHaveBeenCalled();
    });

    it("clones template modules when a template exists", async () => {
        const mainCourse = mockCourse();
        const template = {
            _id: "tpl1",
            modules: [
                {
                    moduleNumber: 1,
                    title: "Modul 1",
                    sections: [{ title: "S1", description: "d", instructions: "i" }],
                    assignment: { title: "Uppgift" },
                },
            ],
        };
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(null);
        vi.spyOn(Course, "findById").mockResolvedValue(mainCourse);
        vi.spyOn(CourseTemplate, "findOne").mockReturnValue({
            sort: vi.fn().mockResolvedValue(template),
        });
        vi.spyOn(TeacherScheduleParameters, "findOne").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        const saveMock = vi
            .spyOn(CourseInstance.prototype, "save")
            .mockImplementation(function () {
                return Promise.resolve(this);
            });

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            mainCourse._id,
            new Date("2026-01-05"),
            new Date("2026-02-09"),
            "user1"
        );

        expect(result.instance.modules[0].moduleNumber).toBe(1);
        expect(result.instance.modules[0].assignment.title).toBe("Uppgift");
        expect(saveMock).toHaveBeenCalled();
    });

    it("uses the teacher's saved schedule offsets when 5 offsets exist", async () => {
        const mainCourse = mockCourse();
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(null);
        vi.spyOn(Course, "findById").mockResolvedValue(mainCourse);
        vi.spyOn(CourseTemplate, "findOne").mockReturnValue({
            sort: vi.fn().mockResolvedValue(null),
        });
        vi.spyOn(TeacherScheduleParameters, "findOne").mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                sectionOffsets: [0, 1, 2, 3, 4],
            }),
        });
        vi.spyOn(CourseInstance.prototype, "save").mockImplementation(function () {
            return Promise.resolve(this);
        });

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            mainCourse._id,
            new Date("2026-01-05"),
            new Date("2026-02-09"),
            "user1",
            "teacher1"
        );

        const dates = result.instance.sectionDates;
        expect(dates).toHaveLength(5);
        expect(dates[1].getDate()).toBe(12);
    });

    it("falls back to default offsets when teacher params have invalid offsets", async () => {
        const mainCourse = mockCourse();
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(null);
        vi.spyOn(Course, "findById").mockResolvedValue(mainCourse);
        vi.spyOn(CourseTemplate, "findOne").mockReturnValue({
            sort: vi.fn().mockResolvedValue(null),
        });
        vi.spyOn(TeacherScheduleParameters, "findOne").mockReturnValue({
            lean: vi.fn().mockResolvedValue({ sectionOffsets: [0] }),
        });
        vi.spyOn(CourseInstance.prototype, "save").mockImplementation(function () {
            return Promise.resolve(this);
        });

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            mainCourse._id,
            new Date("2026-01-05"),
            new Date("2026-02-09"),
            "user1",
            "teacher1"
        );

        expect(result.instance.sectionDates).toHaveLength(5);
    });

    it("applies 10-week and 20-week default offsets", async () => {
        vi.spyOn(CourseInstance, "findOne").mockResolvedValue(null);
        vi.spyOn(Course, "findById").mockResolvedValue(mockCourse());
        vi.spyOn(CourseTemplate, "findOne").mockReturnValue({
            sort: vi.fn().mockResolvedValue(null),
        });
        vi.spyOn(TeacherScheduleParameters, "findOne").mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        vi.spyOn(CourseInstance.prototype, "save").mockImplementation(function () {
            return Promise.resolve(this);
        });

        const tenWeek = await CourseMatchingService.findOrCreateCourseInstance(
            "course1",
            new Date("2026-01-05"),
            new Date("2026-03-16"), // 10 weeks
            "user1"
        );
        expect(tenWeek.instance.sectionDates[1].getDate()).toBe(19);

        const twentyWeek = await CourseMatchingService.findOrCreateCourseInstance(
            "course1",
            new Date("2026-01-05"),
            new Date("2026-05-25"), // 20 weeks
            "user1"
        );
        expect(twentyWeek.instance.sectionDates[1].getDate()).toBe(2); // +4 weeks from Jan 5
        expect(twentyWeek.instance.sectionDates[1].getMonth()).toBe(1);
    });
});

describe("CourseMatchingService.getCourseStatistics", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("computes totals over the date range and groups by course", async () => {
        const start = new Date("2026-01-01");
        const end = new Date("2026-06-30");

        vi.spyOn(CourseInstance, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    {
                        courseCode: "MAT1",
                        courseName: "Matematik 1",
                        isActive: true,
                        enrollmentCount: 12,
                        completionCount: 9,
                        dropoutCount: 1,
                    },
                    {
                        courseCode: "MAT1",
                        courseName: "Matematik 1",
                        isActive: true,
                        enrollmentCount: 8,
                        completionCount: 6,
                        dropoutCount: 2,
                    },
                    {
                        courseCode: "ENG2",
                        courseName: "Engelska 2",
                        isActive: false,
                        enrollmentCount: 5,
                        completionCount: 0,
                        dropoutCount: 0,
                    },
                ]),
            }),
        });

        const stats = await CourseMatchingService.getCourseStatistics(start, end);

        expect(CourseInstance.find).toHaveBeenCalledWith(
            expect.objectContaining({
                startDate: { $lt: end },
                endDate: { $gt: start },
            })
        );
        expect(stats.totalInstances).toBe(3);
        expect(stats.activeInstances).toBe(2);
        expect(stats.totalEnrollments).toBe(25);
        expect(stats.completions).toBe(15);
        expect(stats.dropouts).toBe(3);
        expect(stats.averageEnrollments).toBe(8.3);
        expect(stats.byCourse.MAT1).toEqual({ total: 2, active: 2, enrollments: 20 });
        expect(stats.byCourse.ENG2).toEqual({ total: 1, active: 0, enrollments: 5 });
    });

    it("applies the courseId (mainCourseId) filter when provided", async () => {
        const courseId = new mongoose.Types.ObjectId();
        vi.spyOn(CourseInstance, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    {
                        courseCode: "KEM1",
                        isActive: true,
                        enrollmentCount: 4,
                        completionCount: 2,
                        dropoutCount: 0,
                    },
                ]),
            }),
        });

        await CourseMatchingService.getCourseStatistics(
            new Date("2026-01-01"),
            new Date("2026-03-31"),
            courseId
        );

        expect(CourseInstance.find).toHaveBeenCalledWith(
            expect.objectContaining({ mainCourseId: courseId })
        );
    });

    it("returns zeroed statistics when there are no instances", async () => {
        vi.spyOn(CourseInstance, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([]),
            }),
        });

        const stats = await CourseMatchingService.getCourseStatistics(
            new Date("2026-01-01"),
            new Date("2026-03-31")
        );

        expect(stats).toEqual(
            expect.objectContaining({
                totalInstances: 0,
                activeInstances: 0,
                totalEnrollments: 0,
                completions: 0,
                dropouts: 0,
                averageEnrollments: 0,
                byCourse: {},
            })
        );
    });
});
