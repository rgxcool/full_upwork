import mongoose from "mongoose";

const coursePackageSchema = new mongoose.Schema({
    coursePackageName: { type: String, required: true },
    coursePackageCode: { type: String, required: true },
    coursePackagePoints: { type: String, required: true },
    coursePackageExtent: { type: String, required: true },
    coursePackageCourses: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },
    ],
});

export default mongoose.model(
    "CoursePackage",
    coursePackageSchema,
    "coursepackages"
);
