// Quick inspector for courses and course packages
// Usage: node backend/scripts/inspectCatalog.js [coursePattern] [packagePattern]
// Defaults: Admin, Barn

import mongoose from "mongoose";

const coursePattern = process.argv[2] || "Admin";
const packagePattern = process.argv[3] || "Barn";

const MONGO_URI =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/mindfullearning";

async function main() {
    await mongoose.connect(MONGO_URI);

    const Course = mongoose.model(
        "Course",
        new mongoose.Schema(
            { courseName: String, courseCode: String },
            { strict: false }
        ),
        "courses"
    );

    const CoursePackage = mongoose.model(
        "CoursePackage",
        new mongoose.Schema({ coursePackageName: String }, { strict: false }),
        "coursepackages"
    );

    const courses = await Course.find({
        $or: [
            { courseName: { $regex: coursePattern, $options: "i" } },
            { courseCode: { $regex: coursePattern, $options: "i" } },
        ],
    })
        .limit(50)
        .lean();

    const packages = await CoursePackage.find({
        coursePackageName: { $regex: packagePattern, $options: "i" },
    })
        .limit(50)
        .lean();

    console.log("Courses:");
    for (const c of courses) {
        console.log(`- ${c.courseName || ""} (${c.courseCode || ""})`);
    }

    console.log("\nCoursePackages:");
    for (const p of packages) {
        console.log(`- ${p.coursePackageName || ""} (${p._id})`);
    }

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
