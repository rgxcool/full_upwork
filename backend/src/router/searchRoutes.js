import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import Program from "../models/Program.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Teacher from "../models/Teacher.js";
import { authenticateUser } from "../controllers/authController.js";

const router = express.Router();

router.get("/courses", authenticateUser, async (req, res) => {
    try {
        let query = {
            "education.type": "Course",
            "education.refId": { $exists: true },
        };

        // If user is a teacher, filter students by their teacherId
        if (req.user.role === "teacher") {
            // Find the teacher record for this user
            const teacher = await Teacher.findOne({ userId: req.user.userId });

            if (!teacher) {
                return res
                    .status(403)
                    .json({ error: "Teacher profile not found" });
            }

            // Filter students by this teacher's ID
            query.teacherId = teacher._id;
            console.log(`🔍 Teacher ${teacher._id} fetching their courses`);
        }

        const students = await Student.find(query);

        const allCourseRefs = [];

        for (const student of students) {
            // Get enrollments for this student
            const studentEnrollments = await StudentEnrollment
                .find({ studentId: student._id })
                .populate("mainCourseId", "courseName")
                .lean();

            for (const enrollment of studentEnrollments) {
                if (enrollment.mainCourseId) {
                    allCourseRefs.push({
                        _id: enrollment.mainCourseId._id.toString(),
                        name: enrollment.mainCourseId.courseName,
                    });
                }
            }
        }

        // Deduplicate
        const uniqueCoursesMap = new Map();
        allCourseRefs.forEach((course) => {
            uniqueCoursesMap.set(course._id, course);
        });

        const uniqueCourses = Array.from(uniqueCoursesMap.values());
        res.json(uniqueCourses);
    } catch (error) {
        console.error("❌ Error fetching courses from education[]:", error);
        res.status(500).json({ message: "Serverfel vid hämtning av kurser" });
    }
});

router.get("/search", authenticateUser, async (req, res) => {
    const { q, date, type } = req.query;

    try {
        const results = [];

        let studentQuery = {};

        // If user is a teacher, filter students by their teacherId
        if (req.user.role === "teacher") {
            // Find the teacher record for this user
            const teacher = await Teacher.findOne({ userId: req.user.userId });

            if (!teacher) {
                return res
                    .status(403)
                    .json({ error: "Teacher profile not found" });
            }

            // Filter students by this teacher's ID
            studentQuery.teacherId = teacher._id;
            console.log(`🔍 Teacher ${teacher._id} searching their students`);
        }

        if (type === "Datum" && date) {
            const parsedDate = new Date(date);
            if (isNaN(parsedDate)) {
                return res.status(400).json({ message: "Ogiltigt datum" });
            }

            // Only include students whose startDate <= date <= endDate.
            // Do NOT include students just because they have an exam (finalExamDate) on this date.
            // This ensures the date search is strictly for enrollment period, not exam dates.
            const students = await Student.find({
                ...studentQuery,
                startDate: { $lte: parsedDate },
                endDate: { $gte: parsedDate },
            }).select("_id name email");

            results.push(
                ...students.map((student) => ({
                    id: student._id,
                    name: student.name,
                    type: "Elev",
                    extra: `Email: ${student.email}`,
                }))
            );
        }

        const shouldSearchUsers =
            ["Användare", "Alla"].includes(type) && q && q.length >= 3;
        const shouldSearchCourses =
            ["Kurs", "Alla"].includes(type) && q && q.length >= 3;

        if (shouldSearchUsers) {
            const [students, users] = await Promise.all([
                Student.find({
                    ...studentQuery,
                    name: { $regex: q, $options: "i" },
                }).select("_id name email"),
                User.find({
                    $or: [
                        { username: { $regex: q, $options: "i" } },
                        { email: { $regex: q, $options: "i" } },
                    ],
                }).select("_id username email role"),
            ]);

            results.push(
                ...students.map((student) => ({
                    id: student._id,
                    name: student.name,
                    type: "Elev",
                    extra: `Email: ${student.email}`,
                })),
                ...users.map((user) => ({
                    id: user._id,
                    name: user.username,
                    type: user.role || "Användare",
                    extra: `Email: ${user.email}`,
                }))
            );
        }

        if (shouldSearchCourses) {
            const students = await Student.find(studentQuery).lean();

            const courseMap = new Map();

            for (const student of students) {
                // Get enrollments for this student
                const searchEnrollments = await mongoose
                    .model("StudentEnrollment")
                    .find({ studentId: student._id })
                    .populate("mainCourseId", "courseName")
                    .populate("coursePackageId", "coursePackageName")
                    .populate("programId", "programName")
                    .lean();

                for (const enrollment of searchEnrollments) {
                    let name = "";
                    let type = "";
                    let courseId = "";

                    if (enrollment.mainCourseId) {
                        name = enrollment.mainCourseId.courseName;
                        type = "Course";
                        courseId = enrollment.mainCourseId._id.toString();
                    } else if (enrollment.coursePackageId) {
                        name = enrollment.coursePackageId.coursePackageName;
                        type = "CoursePackage";
                        courseId = enrollment.coursePackageId._id.toString();
                    } else if (enrollment.programId) {
                        name = enrollment.programId.programName;
                        type = "Program";
                        courseId = enrollment.programId._id.toString();
                    }

                    if (name && name.match(new RegExp(q, "i"))) {
                        if (!courseMap.has(courseId)) {
                            courseMap.set(courseId, {
                                id: courseId,
                                name,
                                type,
                                extra: `Typ: ${type}`,
                            });
                        }
                    }
                }
            }

            results.push(...courseMap.values());
        }

        res.json(results);
    } catch (err) {
        console.error("❌ Search error:", err);
        res.status(500).json({ message: "Serverfel under sökning." });
    }
});

router.get("/details/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    console.log(`🔍 Details request: ${type}/${id}`);

    try {
        let result;

        switch (type) {
            case "Elev":
                console.log("🔍 Looking for student with ID:", id);
                
                // First try simple findById
                const student = await Student.findById(id);
                console.log("📚 Student found:", student ? "Yes" : "No");
                
                if (!student) {
                    console.log("❌ Student not found in database");
                    return res
                        .status(404)
                        .json({ message: "Student not found" });
                }
                
                console.log("✅ Student data:", {
                    name: student.name,
                    email: student.email,
                    education: student.education?.length || 0
                });

                // For now, just return basic student data to debug the issue
                console.log("📤 Returning basic student data");
                result = {
                    _id: student._id,
                    name: student.name,
                    email: student.email,
                    education: student.education || [],
                    startDate: student.startDate,
                    endDate: student.endDate,
                    teacherId: student.teacherId
                };
                break;

                // COMMENTED OUT FOR DEBUGGING - Complex population code
                /*
                const populatedStudent = student.toObject();
                populatedStudent.education = Array.isArray(
                    populatedStudent.education
                )
                    ? populatedStudent.education
                    : [];

                for (const edu of populatedStudent.education) {
                    if (!edu.refId) continue;

                    try {
                        let populatedRef = null;

                        if (edu.type === "Course") {
                            populatedRef = await Course.findById(
                                edu.refId
                            ).select(
                                "courseName courseCode coursePoints courseExtent"
                            );
                        } else if (edu.type === "CoursePackage") {
                            populatedRef = await CoursePackage.findById(
                                edu.refId
                            ).select("coursePackageName coursePackageCode");
                        } else if (edu.type === "Program") {
                            populatedRef = await Program.findById(
                                edu.refId
                            ).select("programName");
                        }

                        if (populatedRef) {
                            edu.refId = populatedRef;
                        }
                    } catch (populateError) {
                        console.error(
                            `Error populating ${edu.type}:`,
                            populateError
                        );
                        edu.refId = null;
                    }
                }

                // Fetch enrollments from the new course versioning system
                const studentEnrollments = await StudentEnrollment.find({
                    studentId: id,
                })
                    .populate("courseInstanceId")
                    .populate("mainCourseId")
                    .populate("teacherId", "name email")
                    .sort({ startDate: -1 });

                // Convert enrollments to education format for display
                const enrollmentEducation = studentEnrollments.map(
                    (enrollment) => ({
                        _id: enrollment._id,
                        type: "Course",
                        refId: enrollment.mainCourseId,
                        name: enrollment.mainCourseId?.courseName,
                        startDate: enrollment.startDate,
                        endDate: enrollment.endDate,
                        status: enrollment.status,
                        grade: enrollment.grade,
                        comments: enrollment.notes,
                        enrollmentId: enrollment._id,
                        courseInstanceId: enrollment.courseInstanceId?._id,
                        courseInstance: enrollment.courseInstanceId,
                        addedAt: enrollment.createdAt,
                        addedBy: enrollment.teacherId?.name || "System",
                        isEnrollment: true, // Flag to identify this came from enrollment system
                    })
                );

                // Use only enrollment data as education entries
                populatedStudent.education = enrollmentEducation;

                // Add enrollment statistics
                const enrollments = studentEnrollments;
                populatedStudent.enrollmentStats = {
                    totalEnrollments: enrollments.length,
                    activeEnrollments: enrollments.filter(
                        (e) => e.status === "enrolled" || e.status === "active"
                    ).length,
                    completedEnrollments: enrollments.filter(
                        (e) => e.status === "completed"
                    ).length,
                    droppedEnrollments: enrollments.filter(
                        (e) => e.status === "dropped"
                    ).length,
                };

                result = populatedStudent;
                */
                break;

            case "Lärare":
                result = await User.findOne({
                    _id: id,
                    role: "teacher",
                }).select("username email role");
                break;

            case "Personal":
                result = await User.findOne({
                    _id: id,
                    role: {
                        $in: [
                            "admin",
                            "systemadmin",
                            "syv",
                            "specped",
                            "coordinator",
                        ],
                    },
                }).select("username email role");
                break;

            case "Kurs":
                console.log("🔍 Looking for course with ID:", id);
                
                try {
                    // First try to find the course directly in Course model
                    const course = await Course.findById(id);
                    console.log("📚 Direct course lookup:", course ? "Found" : "Not found");
                    
                    let courseName = course ? (course.courseName || "Okänd kurs") : "Okänd kurs";
                    
                    // If not found directly, try to find students through their education array
                    console.log("🔍 Looking for students with this course in their education array");
                    
                    const studentsWithCourse = await Student.find({
                        'education.refId': id
                    }).select('_id name email').lean();
                    
                    console.log("📚 Found students with course in education:", studentsWithCourse.length);
                    
                    // Also try StudentEnrollment approach
                    const courseEnrollments = await StudentEnrollment
                        .find({ mainCourseId: id })
                        .populate("studentId", "name _id")
                        .lean();
                    
                    console.log("📚 Found enrollments:", courseEnrollments.length);
                    
                    // Combine both approaches
                    const enrollmentStudents = courseEnrollments.map((e) => e.studentId).filter(s => s !== null);
                    const allStudents = [...studentsWithCourse, ...enrollmentStudents];
                    
                    // Remove duplicates based on _id
                    const uniqueStudents = allStudents.filter((student, index, self) => 
                        index === self.findIndex(s => s._id.toString() === student._id.toString())
                    );
                    
                    console.log("👥 Total unique students found:", uniqueStudents.length);

                    // If we didn't find course name directly and have students, try to get it from student education
                    if (courseName === "Okänd kurs" && studentsWithCourse.length > 0) {
                        const studentWithEdu = await Student.findById(studentsWithCourse[0]._id)
                            .populate('education.refId');
                        
                        const courseEdu = studentWithEdu?.education?.find(edu => 
                            edu.refId && edu.refId._id.toString() === id
                        );
                        
                        if (courseEdu && courseEdu.refId) {
                            courseName = courseEdu.refId.courseName || 
                                       courseEdu.refId.programName || 
                                       courseEdu.refId.coursePackageName || 
                                       courseName; // Keep existing name if nothing found
                        }
                    }
                    
                    result = {
                        courseId: id,
                        courseName: courseName,
                        teacher: {
                            _id: null,
                            username: "Okänd lärare"
                        },
                        students: uniqueStudents
                    };
                    
                    console.log("✅ Returning combined result:", result);
                } catch (courseError) {
                    console.error("❌ Error in Kurs case:", courseError);
                    result = {
                        courseId: id,
                        courseName: "Fel vid hämtning av kurs",
                        teacher: {
                            _id: null,
                            username: "Okänd lärare"
                        },
                        students: []
                    };
                }
                break;

            default:
                return res
                    .status(400)
                    .json({ message: "Ogiltig typ av objekt" });
        }

        if (!result) {
            return res.status(404).json({ message: "Objektet hittades inte" });
        }

        res.json(result);
    } catch (error) {
        console.error("❌ Fetch details error:", error);
        console.error("❌ Error stack:", error.stack);
        console.error("❌ Error details:", {
            type,
            id,
            message: error.message,
            name: error.name
        });
        res.status(500).json({ message: "Serverfel vid hämtning av detaljer" });
    }
});

router.put("/update-student/:id", async (req, res) => {
    try {
        const updatedStudent = await Student.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedStudent);
    } catch (error) {
        console.error("❌ Error updating student:", error);
        res.status(500).json({ message: "Kunde inte uppdatera studenten" });
    }
});

router.put("/update-user/:id", async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
            }
        );
        res.json(updatedUser);
    } catch (error) {
        console.error("❌ Error updating user:", error);
        res.status(500).json({ message: "Kunde inte uppdatera användaren" });
    }
});

export default router;
