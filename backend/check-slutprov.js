const mongoose = require("mongoose");
const StudentEnrollment = require("./src/models/StudentEnrollment.js");

const mongoUri = process.env.MONGODB_URI;

mongoose.connect(mongoUri).then(async () => {
    try {
        const enrollments = await StudentEnrollment.find({ slutprovDate: { $ne: null } })
            .populate('studentId')
            .populate('mainCourseId')
            .populate('teacherId');

        console.log('Enrollments with slutprovDate:', enrollments.length);

        enrollments.forEach(e => {
            console.log('Student:', e.studentId?.name, 'Course:', e.mainCourseId?.courseName, 'Date:', e.slutprovDate);
        });

        // Also check students with finalExamDate
        const Student = require('./src/models/Student.js');
        const students = await Student.find({ finalExamDate: { $ne: null } });
        console.log('\nStudents with finalExamDate:', students.length);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
});
