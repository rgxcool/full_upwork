// #103: the education-shaped study plan is derived from StudentEnrollment only.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import {
    educationFromEnrollments,
    entryFromEnrollment,
    loadEducationByStudent,
} from "../../src/utils/enrollmentEducation.js";
import { computeAplPeriod } from "../../src/utils/aplAutoStatus.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const day = (iso) => new Date(`${iso}T12:00:00.000Z`);
let seq = 0;

async function enroll(student, course, start, end, extra = {}) {
    seq++;
    const instance = await CourseInstance.create({
        mainCourseId: course._id,
        courseName: course.courseName,
        courseCode: `${course.courseCode}-${seq}`,
        startDate: day(start),
        endDate: day(end),
    });
    return StudentEnrollment.create({
        studentId: student._id,
        courseInstanceId: instance._id,
        mainCourseId: course._id,
        startDate: day(start),
        endDate: day(end),
        ...extra,
    });
}

describe("utils/enrollmentEducation", () => {
    let student;
    let svenska;
    let matte;
    let pkg;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Course.deleteMany({}),
            CoursePackage.deleteMany({}),
            CourseInstance.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);
        student = await Student.create({ name: "Test Elev", email: `t${seq}@example.se`, personalNumber: "19000101-0000" });
        svenska = await Course.create({ courseName: "Svenska 1", courseCode: "SVESVE01" });
        matte = await Course.create({ courseName: "Matematik 1a", courseCode: "MATMAT01a" });
        pkg = await CoursePackage.create({
            coursePackageName: "Barnskötare - 10 v",
            coursePackageCode: "BSK10",
            coursePackagePoints: "200",
            coursePackageExtent: "10",
        });
    });

    it("maps a course enrollment to an education entry with grade and lock", async () => {
        const enr = await enroll(student, svenska, "2026-01-12", "2026-03-20", { grade: "B", isGradeLocked: true, status: "completed" });
        const [loaded] = await StudentEnrollment.find({ _id: enr._id }).populate("mainCourseId").lean();

        expect(entryFromEnrollment(loaded)).toMatchObject({
            type: "Course",
            name: "Svenska 1",
            grade: "B",
            isGradeLocked: true,
            status: "completed",
            enrollmentId: enr._id,
            isEnrollment: true,
        });
    });

    it("adds one CoursePackage entry spanning the package's courses (APL period)", async () => {
        await enroll(student, svenska, "2026-01-12", "2026-03-20", { coursePackageId: pkg._id });
        await enroll(student, matte, "2026-03-23", "2026-05-29", { coursePackageId: pkg._id });

        const education = (await loadEducationByStudent([student._id])).get(String(student._id));

        expect(education.filter((e) => e.type === "Course")).toHaveLength(2);
        const packages = education.filter((e) => e.type === "CoursePackage");
        expect(packages).toHaveLength(1);
        expect(packages[0]).toMatchObject({ name: "Barnskötare - 10 v", isEnrollment: false });
        expect(packages[0].startDate.toISOString().slice(0, 10)).toBe("2026-01-12");
        expect(packages[0].endDate.toISOString().slice(0, 10)).toBe("2026-05-29");

        const apl = computeAplPeriod(education);
        expect(apl.aplStartDate.toISOString().slice(0, 10)).toBe("2026-01-12");
        expect(apl.aplEndDate.toISOString().slice(0, 10)).toBe("2026-05-29");
    });

    it("does not read the legacy Student.education array", async () => {
        await enroll(student, svenska, "2026-01-12", "2026-03-20");
        // Drifted legacy data must not leak into the result.
        await Student.collection.updateOne(
            { _id: student._id },
            { $set: { education: [{ type: "Course", refId: matte._id, name: "Matematik 1a" }] } }
        );

        const education = (await loadEducationByStudent([student._id])).get(String(student._id));

        expect(education.map((e) => e.name)).toEqual(["Svenska 1"]);
    });

    it("filters by enrollment status and keeps students without enrollments", async () => {
        const other = await Student.create({ name: "Test Elev", email: `o${seq}@example.se`, personalNumber: "19000101-0000" });
        await enroll(student, svenska, "2026-01-12", "2026-03-20", { status: "dropped" });
        await enroll(student, matte, "2026-03-23", "2026-05-29", { status: "active" });

        const map = await loadEducationByStudent([student._id, other._id], { statuses: ["active", "enrolled"] });

        expect(map.get(String(student._id)).map((e) => e.name)).toEqual(["Matematik 1a"]);
        expect(map.get(String(other._id))).toEqual([]);
    });

    it("educationFromEnrollments ignores enrollments without any reference", () => {
        expect(educationFromEnrollments([{ _id: new mongoose.Types.ObjectId() }])).toEqual([]);
    });
});
