/**
 * Shared kurskort: students on the same course + dates share one CourseInstance.
 * Placing another student (whose own teacher differs) must not take the card away
 * from its responsible teacher, and must not wipe a manually set slutprov date.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const start = new Date("2026-11-02T00:00:00Z");
const end = new Date("2027-01-11T00:00:00Z");

let teacherA;
let teacherB;
let course;

const makeTeacher = async (name) => {
    const user = await User.create({ name, username: name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.se`, password: "x".repeat(20), roles: ["teacher"] });
    return Teacher.create({ userId: user._id, subject: "Svenska" });
};

describe("CourseMatchingService.findOrCreateCourseInstance — shared kurskort", () => {
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
        teacherA = await makeTeacher("Test Lärare A");
        teacherB = await makeTeacher("Test Lärare B");
        course = await Course.create({ courseName: "Svenska som andraspråk 1", courseCode: "SVEA1000X", courseExtent: "5", isActive: true });
    });

    it("keeps the responsible teacher and the manual slutprov when a student of another teacher joins", async () => {
        const manualSlutprov = new Date("2027-01-05T00:00:00Z");
        const shared = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: "SVEA1000X2611",
            startDate: start,
            endDate: end,
            responsibleTeacher: teacherA._id,
            slutprovDate: manualSlutprov,
        });

        const { instance, wasCreated } = await CourseMatchingService.findOrCreateCourseInstance(
            course._id, start, end, null, teacherB._id, null
        );

        expect(wasCreated).toBe(false);
        expect(String(instance._id)).toBe(String(shared._id));
        const reloaded = await CourseInstance.findById(shared._id);
        expect(String(reloaded.responsibleTeacher)).toBe(String(teacherA._id));
        expect(reloaded.slutprovDate.toISOString()).toBe(manualSlutprov.toISOString());
    });

    it("gives a teacher-less instance the placing student's teacher", async () => {
        const shared = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: "SVEA1000X2611",
            startDate: start,
            endDate: end,
        });

        await CourseMatchingService.findOrCreateCourseInstance(course._id, start, end, null, teacherB._id, null);

        const reloaded = await CourseInstance.findById(shared._id);
        expect(String(reloaded.responsibleTeacher)).toBe(String(teacherB._id));
    });
});
