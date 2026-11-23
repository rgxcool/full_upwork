/**
 * Demo data layered on top of seedE2EData.js (run via `bash backend/scripts/resetDemo.sh --yes`).
 *
 * - Gives every kurskort without content the default 5-module structure, so
 *   every card in "Alla kurskort" can be opened.
 * - Adds a mall for Matematik 1a (mall-bank shows more than one template).
 * - Creates an ONGOING kursinstans (relative to today) with three students on
 *   the same start/end date -> one shared kurskort with the teacher, plus
 *   anslagstavla posts.
 * - Creates an UPCOMING kursinstans with one admitted student.
 *
 * Dates are relative to "now" so the demo looks right on any day.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.development") });

import User from "../src/models/User.js";
import Teacher from "../src/models/Teacher.js";
import Student from "../src/models/Student.js";
import Course from "../src/models/Course.js";
import CourseTemplate from "../src/models/CourseTemplate.js";
import CourseInstance from "../src/models/CourseInstance.js";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import { cloneModules } from "../src/models/courseModuleSchema.js";

const DAY = 86400000;
const mondayOf = (d) => {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
};

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    const admin = await User.findOne({ email: "admin@mindful.se" });
    const teacherUser = await User.findOne({ email: "teacher@mindful.se" });
    const teacher = await Teacher.findOne({ email: "teacher@mindful.se" }) || await Teacher.findOne();
    const svasve = await Course.findOne({ courseCode: "SVASVE01" });
    const mat = await Course.findOne({ courseCode: "MATMAT01a" });
    const svaTemplate = await CourseTemplate.findOne({ courseId: svasve?._id });
    if (!admin || !teacherUser || !teacher || !svasve || !mat || !svaTemplate) {
        throw new Error("Run seedE2EData.js first (missing admin/teacher/courses/template).");
    }
    const byEmail = async (email) => Student.findOne({ email });
    const [anna, berta, calle, doris] = await Promise.all(
        ["student@mindful.se", "student2@mindful.se", "student3@mindful.se", "student4@mindful.se"].map(byEmail),
    );

    // 1. Mall for Matematik 1a
    const matModules = cloneModules(svaTemplate.modules).map((m) => ({
        ...m,
        sections: (m.sections || []).map((s, i) => ({
            ...s,
            instructions: `Matematik modul ${m.moduleNumber}, avsnitt ${i + 1}: arbeta med genomgången och lös uppgifterna i kapitlet.`,
        })),
        assignment: m.moduleNumber === 1
            ? { title: "Inlämningsuppgift 1 – Taluppfattning", description: "Lös uppgifterna i bifogat dokument och redovisa dina uträkningar." }
            : m.assignment,
    }));
    await CourseTemplate.findOneAndUpdate(
        { courseId: mat._id },
        { templateName: "Matematik 1a - mall", courseId: mat._id, modules: matModules, createdBy: admin._id, isActive: true },
        { upsert: true, new: true },
    );

    // 2. Content for every kurskort that has none
    const empty = await CourseInstance.find({ $or: [{ modules: { $size: 0 } }, { modules: { $exists: false } }] });
    for (const inst of empty) {
        inst.modules = String(inst.mainCourseId) === String(mat._id) ? cloneModules(matModules) : cloneModules(svaTemplate.modules);
        await inst.save();
    }

    // 3. Ongoing kursinstans: started 3 weeks ago. Dates mirror the placement
    // wizard (UTC midnight, start + courseExtent weeks) so placing another
    // student with the same start date joins THIS kurskort (same course +
    // start + end => one shared card).
    const start = new Date(mondayOf(new Date()).getTime() - 21 * DAY);
    const end = new Date(start.getTime() + Number(svasve.courseExtent || 5) * 7 * DAY);
    const yymm = (d) => `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const ongoing = await new CourseInstance({
        mainCourseId: svasve._id,
        courseName: "Svenska som andraspråk 1",
        courseCode: `SVASVE01${yymm(start)}`,
        coursePoints: "100",
        courseExtent: String(svasve.courseExtent || 5),
        startDate: start,
        endDate: end,
        responsibleTeacher: teacher._id,
        createdBy: admin._id,
        isActive: true,
        modules: cloneModules(svaTemplate.modules),
        activityFeed: [
            {
                id: new mongoose.Types.ObjectId(),
                text: "Välkomna till Svenska som andraspråk 1! Börja med Modul 1 och läs instruktionerna för varje avsnitt. Hör av er i chatten om ni har frågor. /Eva",
                by: teacherUser._id,
                at: new Date(start.getTime() + 1 * DAY),
            },
            {
                id: new mongoose.Types.ObjectId(),
                text: "Påminnelse: Inlämningsuppgift 1 (Reflektion) ska vara inlämnad senast fredag denna vecka.",
                by: teacherUser._id,
                at: new Date(Date.now() - 2 * DAY),
            },
        ],
    }).save();

    // 4. Upcoming kursinstans: starts in 2 weeks
    const upStart = new Date(mondayOf(new Date()).getTime() + 14 * DAY);
    const upEnd = new Date(upStart.getTime() + Number(mat.courseExtent || 10) * 7 * DAY);
    const upcoming = await new CourseInstance({
        mainCourseId: mat._id,
        courseName: "Matematik 1a",
        courseCode: `MATMAT01a${yymm(upStart)}`,
        coursePoints: "100",
        courseExtent: String(mat.courseExtent || 10),
        startDate: upStart,
        endDate: upEnd,
        responsibleTeacher: teacher._id,
        createdBy: admin._id,
        isActive: true,
        modules: cloneModules(matModules),
    }).save();

    const enroll = (s, inst, status) =>
        s &&
        new StudentEnrollment({
            studentId: s._id,
            courseInstanceId: inst._id,
            mainCourseId: inst.mainCourseId,
            teacherId: teacher._id,
            startDate: inst.startDate,
            endDate: inst.endDate,
            slutprovDate: inst.slutprovDate,
            status,
            enrollmentDate: new Date(inst.startDate.getTime() - 14 * DAY),
        }).save();

    await Promise.all([
        enroll(anna, ongoing, "active"),
        enroll(berta, ongoing, "active"),
        enroll(calle, ongoing, "active"),
        enroll(doris, upcoming, "enrolled"),
    ]);
    ongoing.enrollmentCount = 3;
    upcoming.enrollmentCount = 1;
    await Promise.all([ongoing.save(), upcoming.save()]);

    console.log(`✅ Demo data: filled ${empty.length} kurskort, ongoing ${start.toISOString().slice(0, 10)}–${end.toISOString().slice(0, 10)}, upcoming from ${upStart.toISOString().slice(0, 10)}`);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error("❌ seedDemoData failed:", err);
    await mongoose.disconnect();
    process.exit(1);
});
