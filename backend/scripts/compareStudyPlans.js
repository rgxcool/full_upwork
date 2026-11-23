// #103 — read-only before/after check for retiring Student.education.
// For every student that still has a legacy `education` array, compare what the
// old code showed (that array) with what the new code shows (the study plan
// built from StudentEnrollment): courses, APL period and "waiting for a grade".
// Run AFTER backfillEnrollmentsFromEducation.js. Writes nothing.
//
// Usage (from backend/; MONGODB_URI from the environment or backend/.env.development):
//   node scripts/compareStudyPlans.js
// Exit code 1 when any student differs (ids only in the output, never names).
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Student from "../src/models/Student.js";
import { loadEducationByStudent } from "../src/utils/enrollmentEducation.js";
import { computeAplPeriod } from "../src/utils/aplAutoStatus.js";

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "?");
const idOf = (v) => String(v && typeof v === "object" && v._id ? v._id : v);
const courseKey = (e) => `${idOf(e.refId)}@${day(e.startDate)}`;

/** Differences between one student's legacy array and enrollment-based plan. */
export function compareStudent(legacy, plan, now = new Date()) {
    const live = (legacy || []).filter((e) => !e.removedAt && e.refId);
    const oldCourses = new Set(live.filter((e) => e.type === "Course").map(courseKey));
    const newCourses = new Set(plan.filter((e) => e.type === "Course").map(courseKey));
    const diffs = [];
    for (const k of oldCourses) if (!newCourses.has(k)) diffs.push(`only in legacy: course ${k}`);
    for (const k of newCourses) if (!oldCourses.has(k)) diffs.push(`only in enrollments: course ${k}`);

    const oldApl = computeAplPeriod(live);
    const newApl = computeAplPeriod(plan);
    if (day(oldApl.aplStartDate) !== day(newApl.aplStartDate) || day(oldApl.aplEndDate) !== day(newApl.aplEndDate)) {
        diffs.push(
            `APL period ${day(oldApl.aplStartDate)}–${day(oldApl.aplEndDate)} → ${day(newApl.aplStartDate)}–${day(newApl.aplEndDate)}`
        );
    }

    const waiting = (entries) =>
        entries.filter((e) => e.type === "Course" && e.endDate && new Date(e.endDate) < now && !e.grade).map(courseKey).sort();
    const oldWaiting = waiting(live).join(",");
    const newWaiting = waiting(plan).join(",");
    if (oldWaiting !== newWaiting) diffs.push(`waiting for a grade: [${oldWaiting}] → [${newWaiting}]`);
    return diffs;
}

async function main() {
    const backendDir = path.resolve(import.meta.dirname, "..");
    if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendDir, ".env.development"), quiet: true });
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set.");
    await mongoose.connect(process.env.MONGODB_URI);
    try {
        console.log(`compareStudyPlans on "${mongoose.connection.db.databaseName}"`);
        // The schema no longer has `education`, so read it raw.
        const students = await Student.collection
            .find({ "education.0": { $exists: true } }, { projection: { education: 1 } })
            .toArray();
        const plans = await loadEducationByStudent(students.map((s) => s._id));
        let differing = 0;
        for (const s of students) {
            const diffs = compareStudent(s.education, plans.get(String(s._id)) || []);
            if (diffs.length === 0) continue;
            differing++;
            console.log(`student ${s._id}`);
            for (const d of diffs) console.log(`   ${d}`);
        }
        console.log(`Students compared: ${students.length}; same: ${students.length - differing}; differ: ${differing}`);
        if (differing) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isDirectRun) {
    main().catch((error) => {
        console.error(`❌ ${error.message}`);
        process.exitCode = 1;
    });
}
