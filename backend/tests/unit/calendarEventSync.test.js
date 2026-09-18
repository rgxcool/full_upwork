import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/Event.js", () => {
    const ctor = vi.fn(function (data = {}) {
        Object.assign(this, data);
        this._id = data._id || "event-1";
        this.save = vi.fn().mockResolvedValue(this);
        return this;
    });
    ctor.findOne = vi.fn();
    return { __esModule: true, default: ctor };
});

vi.mock("../../src/models/Student.js", () => {
    const ctor = vi.fn(function (data = {}) {
        Object.assign(this, data);
        return this;
    });
    ctor.findById = vi.fn();
    return { __esModule: true, default: ctor };
});

vi.mock("../../src/models/Teacher.js", () => {
    const ctor = vi.fn(function (data = {}) {
        Object.assign(this, data);
        return this;
    });
    ctor.findById = vi.fn();
    return { __esModule: true, default: ctor };
});

vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
    },
}));

import CalendarEvent from "../../src/models/Event.js";
import Student from "../../src/models/Student.js";
import Teacher from "../../src/models/Teacher.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import {
    syncAllCalendarEvents,
    syncCalendarEventFromEnrollment,
    syncCalendarEventsForStudent,
} from "../../src/utils/calendarEventSync.js";

const makeChain = (result) => {
    const chain = {
        populate: vi.fn(() => chain),
        select: vi.fn(() => chain),
        then: undefined,
    };
    chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return chain;
};

const baseStudent = () => ({
    _id: "student-1",
    name: "Anna",
    personalNumber: "19900101-1234",
    additionalInfo: "Notes",
    attendedExam: false,
    dropout: false,
    finalExamDate: new Date("2026-06-01T10:00:00.000Z"),
    examMunicipality: "Sollentuna",
    examLocation: "Hallen",
    examTime: "09:00",
    education: [],
    teacherId: { _id: "teacher-1", userId: { username: "Läraren" } },
});

describe("calendarEventSync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("syncCalendarEventsForStudent", () => {
        it("skips when the student has no finalExamDate", async () => {
            Student.findById.mockReturnValue(makeChain({ _id: "student-1" }));

            await syncCalendarEventsForStudent("student-1");

            expect(CalendarEvent.findOne).not.toHaveBeenCalled();
        });

        it("skips when the student is a dropout", async () => {
            Student.findById.mockReturnValue(
                makeChain({
                    ...baseStudent(),
                    dropout: true,
                })
            );

            await syncCalendarEventsForStudent("student-1");

            expect(CalendarEvent.findOne).not.toHaveBeenCalled();
        });

        it("creates a new calendar event with the course name from education", async () => {
            const student = baseStudent();
            student.education = [
                {
                    type: "Course",
                    startDate: new Date("2026-01-01"),
                    endDate: new Date("2026-12-31"),
                    refId: { courseName: "Matematik 1" },
                },
            ];
            Student.findById.mockReturnValue(makeChain(student));
            CalendarEvent.findOne.mockResolvedValue(null);

            await syncCalendarEventsForStudent("student-1");

            expect(CalendarEvent.findOne).toHaveBeenCalled();
            const event = CalendarEvent.mock.instances.at(-1);
            expect(event.title).toBe("Läraren");
            expect(event.extendedProps.type).toBe("slutprov");
            expect(event.extendedProps.students[0].courseName).toBe("Matematik 1");
            expect(event.extendedProps.teacherId).toBe("teacher-1");
            expect(event.save).toHaveBeenCalled();
        });

        it("falls back to the enrollment course name when education has no match", async () => {
            const student = baseStudent();
            student.education = [];
            Student.findById.mockReturnValue(makeChain(student));
            CalendarEvent.findOne.mockResolvedValue(null);
            StudentEnrollment.findOne.mockReturnValue(
                makeChain({
                    mainCourseId: { courseName: "Engelska 5" },
                })
            );

            await syncCalendarEventsForStudent("student-1");

            const event = CalendarEvent.mock.instances.at(-1);
            expect(event.extendedProps.students[0].courseName).toBe("Engelska 5");
        });

        it("adds a new student to an existing event", async () => {
            const existingEvent = {
                _id: "event-1",
                title: "Gammal",
                extendedProps: { students: [{ _id: { toString: () => "other" } }] },
                save: vi.fn().mockResolvedValue(this),
            };
            Student.findById.mockReturnValue(makeChain(baseStudent()));
            CalendarEvent.findOne.mockResolvedValue(existingEvent);

            await syncCalendarEventsForStudent("student-1");

            expect(existingEvent.extendedProps.students).toHaveLength(2);
            expect(existingEvent.title).toBe("Läraren");
            expect(existingEvent.save).toHaveBeenCalled();
        });

        it("does not duplicate a student that is already in the event", async () => {
            const existingEvent = {
                _id: "event-1",
                title: "Läraren",
                extendedProps: {
                    students: [{ _id: { toString: () => "student-1" } }],
                },
                save: vi.fn().mockResolvedValue(this),
            };
            Student.findById.mockReturnValue(makeChain(baseStudent()));
            CalendarEvent.findOne.mockResolvedValue(existingEvent);

            await syncCalendarEventsForStudent("student-1");

            expect(existingEvent.extendedProps.students).toHaveLength(1);
            expect(existingEvent.save).not.toHaveBeenCalled();
        });

        it("does not throw when a query fails", async () => {
            Student.findById.mockReturnValue(
                makeChain(Promise.reject(new Error("db down")))
            );

            await expect(syncCalendarEventsForStudent("student-1")).resolves.toBeUndefined();
        });
    });

    describe("syncAllCalendarEvents", () => {
        it("skips dropouts and syncs the rest", async () => {
            StudentEnrollment.find.mockReturnValue(
                makeChain([
                    { _id: "e1", studentId: { dropout: true } },
                    { _id: "e2", studentId: { dropout: false } },
                    { _id: "e3", studentId: null },
                ])
            );
            StudentEnrollment.findById.mockReturnValue(
                makeChain({
                    _id: "e2",
                    slutprovDate: new Date("2026-06-01"),
                    studentId: { _id: "s2", dropout: false },
                })
            );
            CalendarEvent.findOne.mockResolvedValue(null);

            await syncAllCalendarEvents();

            expect(StudentEnrollment.findById).toHaveBeenCalledTimes(2);
            expect(CalendarEvent.mock.instances).toHaveLength(2);
        });

        it("rethrows errors", async () => {
            StudentEnrollment.find.mockReturnValue(
                makeChain(Promise.reject(new Error("boom")))
            );

            await expect(syncAllCalendarEvents()).rejects.toThrow("boom");
        });
    });

    describe("syncCalendarEventFromEnrollment", () => {
        it("skips when the enrollment has no slutprovDate", async () => {
            StudentEnrollment.findById.mockReturnValue(
                makeChain({ _id: "e1", slutprovDate: null })
            );

            await syncCalendarEventFromEnrollment("e1");

            expect(CalendarEvent.findOne).not.toHaveBeenCalled();
        });

        it("skips when there is no student", async () => {
            StudentEnrollment.findById.mockReturnValue(
                makeChain({ _id: "e1", slutprovDate: new Date("2026-06-01"), studentId: null })
            );

            await syncCalendarEventFromEnrollment("e1");

            expect(CalendarEvent.findOne).not.toHaveBeenCalled();
        });

        it("creates an event grouped by course instance responsible teacher", async () => {
            const enrollment = {
                _id: "e1",
                slutprovDate: new Date("2026-06-01T00:00:00.000Z"),
                studentId: {
                    _id: "s1",
                    name: "Anna",
                    personalNumber: "19900101-1234",
                    additionalInfo: "",
                    attendedExam: false,
                    dropout: false,
                },
                mainCourseId: { courseName: "Matematik 1" },
                courseInstanceId: {
                    _id: "ci1",
                    courseName: "Matematik 1",
                    responsibleTeacher: { _id: "rt1", userId: { username: "Rektor" } },
                },
                teacherId: null,
            };
            StudentEnrollment.findById.mockReturnValue(makeChain(enrollment));
            CalendarEvent.findOne.mockResolvedValue(null);

            await syncCalendarEventFromEnrollment("e1");

            const event = CalendarEvent.mock.instances.at(-1);
            expect(event.extendedProps.teacherId).toBe("rt1");
            expect(event.extendedProps.courseInstanceIds).toEqual(["ci1"]);
            expect(event.extendedProps.students[0].courseName).toBe("Matematik 1");
            expect(event.save).toHaveBeenCalled();
        });

        it("falls back to enrollment teacher and then student teacher", async () => {
            const enrollment = {
                _id: "e1",
                slutprovDate: new Date("2026-06-01T00:00:00.000Z"),
                studentId: {
                    _id: "s1",
                    name: "Anna",
                    personalNumber: "19900101-1234",
                    additionalInfo: "",
                    attendedExam: false,
                    dropout: false,
                    teacherId: "student-teacher",
                },
                mainCourseId: { courseName: "Engelska 5" },
                courseInstanceId: null,
                teacherId: { _id: "et1", userId: { username: "En lärare" } },
            };
            StudentEnrollment.findById.mockReturnValue(makeChain(enrollment));
            CalendarEvent.findOne.mockResolvedValue(null);

            await syncCalendarEventFromEnrollment("e1");

            const event = CalendarEvent.mock.instances.at(-1);
            expect(event.extendedProps.teacherId).toBe("et1");
            expect(Teacher.findById).not.toHaveBeenCalled();
        });

        it("uses the student teacher as a last resort", async () => {
            const enrollment = {
                _id: "e1",
                slutprovDate: new Date("2026-06-01T00:00:00.000Z"),
                studentId: {
                    _id: "s1",
                    name: "Anna",
                    personalNumber: "19900101-1234",
                    additionalInfo: "",
                    attendedExam: false,
                    dropout: false,
                    teacherId: "st1",
                },
                mainCourseId: null,
                courseInstanceId: null,
                teacherId: null,
            };
            StudentEnrollment.findById.mockReturnValue(makeChain(enrollment));
            Teacher.findById.mockReturnValue(
                makeChain({ _id: "st1", userId: { username: "Sista utpost" } })
            );
            CalendarEvent.findOne.mockResolvedValue(null);

            await syncCalendarEventFromEnrollment("e1");

            expect(Teacher.findById).toHaveBeenCalledWith("st1");
            const event = CalendarEvent.mock.instances.at(-1);
            expect(event.extendedProps.teacherId).toBe("st1");
        });

        it("appends a new student and course instance to an existing event", async () => {
            const existingEvent = {
                _id: "event-1",
                title: "Rektor",
                extendedProps: {
                    students: [{ _id: { toString: () => "other" } }],
                    courseInstanceIds: [],
                },
                save: vi.fn().mockResolvedValue(this),
            };
            const enrollment = {
                _id: "e1",
                slutprovDate: new Date("2026-06-01T00:00:00.000Z"),
                studentId: {
                    _id: "s1",
                    name: "Anna",
                    personalNumber: "19900101-1234",
                    additionalInfo: "",
                    attendedExam: false,
                    dropout: false,
                },
                mainCourseId: null,
                courseInstanceId: { _id: "ci1", courseName: "Kemi 1", responsibleTeacher: null },
                teacherId: { _id: "et1", userId: null },
            };
            StudentEnrollment.findById.mockReturnValue(makeChain(enrollment));
            CalendarEvent.findOne.mockResolvedValue(existingEvent);

            await syncCalendarEventFromEnrollment("e1");

            expect(existingEvent.extendedProps.students).toHaveLength(2);
            expect(existingEvent.extendedProps.courseInstanceIds).toEqual(["ci1"]);
            expect(existingEvent.save).toHaveBeenCalled();
        });

        it("leaves an existing event untouched when the student is already present", async () => {
            const existingEvent = {
                _id: "event-1",
                title: "En lärare",
                extendedProps: {
                    students: [{ _id: { toString: () => "s1" } }],
                    courseInstanceIds: ["ci1"],
                },
                save: vi.fn().mockResolvedValue(this),
            };
            const enrollment = {
                _id: "e1",
                slutprovDate: new Date("2026-06-01T00:00:00.000Z"),
                studentId: {
                    _id: "s1",
                    name: "Anna",
                    personalNumber: "19900101-1234",
                    additionalInfo: "",
                    attendedExam: false,
                    dropout: false,
                },
                mainCourseId: null,
                courseInstanceId: { _id: "ci1", courseName: "Kemi 1", responsibleTeacher: null },
                teacherId: { _id: "et1", userId: null },
            };
            StudentEnrollment.findById.mockReturnValue(makeChain(enrollment));
            CalendarEvent.findOne.mockResolvedValue(existingEvent);

            await syncCalendarEventFromEnrollment("e1");

            expect(existingEvent.save).not.toHaveBeenCalled();
        });

        it("does not throw on query errors", async () => {
            StudentEnrollment.findById.mockReturnValue(
                makeChain(Promise.reject(new Error("boom")))
            );

            await expect(
                syncCalendarEventFromEnrollment("e1")
            ).resolves.toBeUndefined();
        });
    });
});