import mongoose from "mongoose";

// Course Schema
const courseSchema = new mongoose.Schema({
    courseName: String,
    courseCode: String,
    omfattning: {
        type: [Number],
        default: [0],
        validate: {
            validator: function (values) {
                return values.every((val) => Number.isInteger(val) && val >= 0);
            },
            message: "Omfattning must be an array of positive integers.",
        },
    },
});

// Course Package Schema
//const coursePackageSchema = new mongoose.Schema({
//  packageName: { type: String, required: true },
//  courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }], // References courses
//  studyRate: { type: String, enum: ["100%", "50%", "25%"], default: "100%" }, // Study rate
//});

// Program Schema
const programSchema = new mongoose.Schema({
    programName: { type: String, required: true },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }], // References courses
    //coursePackages: [{ type: mongoose.Schema.Types.ObjectId, ref: "CoursePackage" }], // References course packages
});

/*
// Student Schema
const studentSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  enrolledPrograms: [{ type: mongoose.Schema.Types.ObjectId, ref: "Program" }],
  individualCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
});
*/

const Course = mongoose.model("Course", courseSchema);
//const CoursePackage = mongoose.model("CoursePackage", coursePackageSchema);
const Program = mongoose.model("Program", programSchema);
//const Student = mongoose.model("Student", studentSchema);

export default { Course, Program /*, CoursePackage, Student*/ };
