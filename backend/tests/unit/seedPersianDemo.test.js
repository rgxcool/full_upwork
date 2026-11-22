import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Document from "../../src/models/Document.js";
import CourseTemplate from "../../src/models/CourseTemplate.js";
import Notification from "../../src/models/Notification.js";
import CalendarEvent from "../../src/models/Event.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import { DEMO_COURSES, KINGS, TEACHERS, kingEmail, seedPersianDemo } from "../../scripts/seedPersianDemo.js";
import { computeInactivitySignal } from "../../src/utils/inactivityStatus.js";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";

const NOW = new Date("2026-11-22T10:00:00Z");
const byState = (state) => KINGS.filter((k) => k.state === state);

describe("scripts/seedPersianDemo", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        for (const name of Object.keys(mongoose.connection.collections)) {
            await mongoose.connection.collections[name].deleteMany({});
        }
        for (const code of Object.values(DEMO_COURSES)) {
            await Course.create({ courseName: `Kurs ${code}`, courseCode: code, coursePoints: "100", courseExtent: "10", isActive: true });
        }
    });

    it("creates Cyrus (purple) and Xerxes, with Xerxes as assistant on Cyrus's kurskort", async () => {
        const result = await seedPersianDemo({ now: NOW });

        const cyrusUser = await User.findOne({ email: TEACHERS[0].email });
        const cyrus = await Teacher.findOne({ userId: cyrusUser._id });
        const xerxes = await Teacher.findOne({ userId: (await User.findOne({ email: TEACHERS[1].email }))._id });
        expect(cyrus.colorCode).toBe("#7B2CBF");

        const sva = await CourseInstance.findById(result.instances.svaNow);
        expect(String(sva.responsibleTeacher)).toBe(String(cyrus._id));
        expect(String(sva.assistantTeacher)).toBe(String(xerxes._id));
        expect(sva.modules.length).toBeGreaterThan(0);
        expect(sva.activityFeed).toHaveLength(2);
    });

    it("uses the wizard's date shape, so '+ Placera kurs' joins the seeded shared kurskort", async () => {
        const result = await seedPersianDemo({ now: NOW });
        const sva = await CourseInstance.findById(result.instances.svaNow);

        expect(sva.startDate.toISOString()).toBe("2026-10-26T00:00:00.000Z"); // Monday, 3 weeks back
        expect(sva.startDate.getUTCDay()).toBe(1);
        expect(sva.endDate.toISOString()).toBe("2027-01-04T00:00:00.000Z"); // + 10 weeks
        expect(sva.slutprovDate.toISOString()).toBe("2026-12-30T00:00:00.000Z"); // Wednesday before the end

        // What placement does with start 2026-10-26 and "10 veckor".
        const { instance, wasCreated } = await CourseMatchingService.findOrCreateCourseInstance(
            sva.mainCourseId, new Date("2026-10-26"), new Date("2027-01-04"), null, null, null
        );
        expect(wasCreated).toBe(false);
        expect(String(instance._id)).toBe(String(sva._id));
    });

    it("creates one mall per course and builds the ongoing kurskort from theirs", async () => {
        const result = await seedPersianDemo({ now: NOW });

        expect(await CourseTemplate.countDocuments()).toBe(3);
        const sva = await CourseInstance.findById(result.instances.svaNow);
        expect(String(sva.courseTemplateId)).toBe(String(result.templates.sva));
        const mall = await CourseTemplate.findById(result.templates.sva);
        expect(sva.modules.map((m) => m.title)).toEqual(mall.modules.map((m) => m.title));
        expect(mall.modules[0].assignment.title).toMatch(/Inlämningsuppgift 1/);
    });

    it("puts every king in the intended state", async () => {
        const result = await seedPersianDemo({ now: NOW });
        expect(result.kings).toBe(KINGS.length);

        for (const king of byState("none")) {
            const s = await Student.findOne({ email: kingEmail(king) });
            expect(s.education).toHaveLength(0);
            expect(await StudentEnrollment.countDocuments({ studentId: s._id })).toBe(0);
        }

        // Ready to grade: same criteria as GET /students-to-grade.
        const toGrade = await StudentEnrollment.find({
            courseInstanceId: result.instances.matPast,
            status: { $in: ["enrolled", "active", "completed"] },
            endDate: { $lt: NOW },
            $or: [{ grade: null }, { grade: "" }],
        });
        expect(toGrade).toHaveLength(byState("grading").length);

        for (const king of byState("avbrott")) {
            const s = await Student.findOne({ email: kingEmail(king) });
            expect(s.dropout).toBe(true);
            const statuses = (await StudentEnrollment.find({ studentId: s._id })).map((e) => e.status);
            expect(statuses.every((st) => st === "dropped")).toBe(true);
        }

        for (const king of byState("warned")) {
            const s = await Student.findOne({ email: kingEmail(king) });
            const warning = s.changeHistory.find((c) => c.changes.includes("inactivity_warning_email"));
            expect(warning.newValues.withdrawalDate.getTime()).toBeGreaterThan(NOW.getTime());
        }

        // Active kings logged in yesterday, so the inactivity rules leave them alone.
        const active = await Student.findOne({ email: kingEmail(byState("active")[0]) });
        const user = await User.findOne({ email: active.email });
        const enrollments = await StudentEnrollment.find({ studentId: active._id }).lean();
        const signal = computeInactivitySignal({
            today: NOW,
            enrollments,
            lastLoginAt: user.lastLoginAt,
            lastLearningActivityAt: active.lastLearningActivityAt,
        });
        expect(signal.level).toBe("ok");
    });

    it("mixes courses: not every active king is on every course", async () => {
        await seedPersianDemo({ now: NOW });
        const perKing = [];
        for (const king of byState("active")) {
            const s = await Student.findOne({ email: kingEmail(king) });
            perKing.push((await StudentEnrollment.find({ studentId: s._id })).map((e) => String(e.courseInstanceId)).sort().join());
        }
        expect(new Set(perKing).size).toBeGreaterThan(1);
    });

    it("shares a document from Cyrus with Xerxes", async () => {
        await seedPersianDemo({ now: NOW });
        const cyrusUser = await User.findOne({ email: TEACHERS[0].email });
        const xerxesUser = await User.findOne({ email: TEACHERS[1].email });
        const doc = await Document.findOne({ uploadedBy: cyrusUser._id });
        expect(doc.sharedWith.map(String)).toEqual([String(xerxesUser._id)]);
    });

    it("re-runs cleanly and never touches data it did not create", async () => {
        const otherUser = await User.create({ name: "Test Annan", email: "annan@example.se", password: "x".repeat(20), roles: ["admin"] });
        const otherStudent = await Student.create({ name: "Test Elev", email: "elev@example.se", personalNumber: "19000101-0000" });
        const otherNotification = await Notification.create({ type: "grades_pending", studentId: otherStudent._id });
        const course = await Course.findOne({ courseCode: DEMO_COURSES.sva });
        const otherInstance = await CourseInstance.create({
            mainCourseId: course._id, courseName: "Annan", courseCode: "X", startDate: NOW, endDate: new Date(NOW.getTime() + 30 * 86400000),
        });

        const otherEvent = await CalendarEvent.create({
            title: "Slutprov annan",
            start: new Date("2026-01-10T09:00:00Z"),
            extendedProps: { type: "slutprov", students: [{ _id: otherStudent._id, name: "Test Elev" }] },
        });

        const first = await seedPersianDemo({ now: NOW });
        const counts = async () => ({
            users: await User.countDocuments(),
            students: await Student.countDocuments(),
            enrollments: await StudentEnrollment.countDocuments(),
            instances: await CourseInstance.countDocuments(),
            documents: await Document.countDocuments(),
            templates: await CourseTemplate.countDocuments(),
            calendarStudents: (await mongoose.connection.db.collection("calendar_events").find({}).toArray())
                .reduce((n, e) => n + (e.extendedProps?.students?.length || 0), 0),
        });
        const afterFirst = await counts();
        // An instance created live during the demo (no marker) is cleaned up too.
        const cyrusTeacher = await Teacher.findOne({ userId: (await User.findOne({ email: TEACHERS[0].email }))._id });
        const liveInstance = await CourseInstance.create({
            mainCourseId: course._id, courseName: "Live", courseCode: "LIVE1", startDate: NOW,
            endDate: new Date(NOW.getTime() + 30 * 86400000), responsibleTeacher: cyrusTeacher._id,
            courseTemplateId: first.templates.mat,
        });
        const second = await seedPersianDemo({ now: NOW });

        expect(afterFirst.calendarStudents).toBeGreaterThan(0); // the hook really ran

        expect(await counts()).toEqual(afterFirst);
        expect(second.removedFromPreviousRun.students).toBe(KINGS.length);
        expect(first.enrollments).toBe(second.enrollments);
        expect(await User.findById(otherUser._id)).not.toBeNull();
        expect(await Student.findById(otherStudent._id)).not.toBeNull();
        expect(await Notification.findById(otherNotification._id)).not.toBeNull();
        expect(await CourseInstance.findById(otherInstance._id)).not.toBeNull();
        expect(await CourseInstance.findById(liveInstance._id)).toBeNull();
        const keptEvent = await CalendarEvent.findById(otherEvent._id).lean();
        expect(keptEvent.extendedProps.students.map((x) => String(x._id))).toEqual([String(otherStudent._id)]);
    });

    it("refuses to run without the GY25 courses", async () => {
        await Course.deleteMany({});
        await expect(seedPersianDemo({ now: NOW })).rejects.toThrow(/not found/);
        expect(await User.countDocuments()).toBe(0);
    });
});
