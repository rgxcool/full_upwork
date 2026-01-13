import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Course from "../models/Course.js";
import CourseInstance from "../models/CourseInstance.js";
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
        }

        if (type === "Datum" && date) {
            const parsedDate = new Date(date);
            if (isNaN(parsedDate)) {
                return res.status(400).json({ message: "Ogiltigt datum" });
            }

            // New logic: Find enrollments starting or ending on this date
            const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
            const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));

            const enrollments = await StudentEnrollment.find({
                $or: [
                    { startDate: { $gte: startOfDay, $lte: endOfDay } },
                    { endDate: { $gte: startOfDay, $lte: endOfDay } },
                ],
            }).populate({
                path: 'studentId',
                select: '_id name email',
                match: studentQuery // Applies teacher filter if necessary
            });

            const students = enrollments
                .filter(e => e.studentId) // Filter out enrollments where student doesn't match teacher filter
                .map(e => e.studentId);

            // Deduplicate students
            const uniqueStudents = Array.from(new Map(students.map(s => [s._id.toString(), s])).values());

            results.push(
                ...uniqueStudents.map((student) => ({
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
                        { name: { $regex: q, $options: "i" } },
                    ],
                }).select("_id username name email role roles"),
            ]);

            // Get student emails to filter out users that are students
            const studentEmails = new Set(students.map(s => s.email?.toLowerCase()).filter(Boolean));

            results.push(
                ...students.map((student) => ({
                    id: student._id,
                    name: student.name,
                    type: "Elev",
                    extra: `Email: ${student.email}`,
                })),
                // Only include users that are NOT students (by email match)
                ...users
                    .filter((user) => {
                        const userEmail = user.email?.toLowerCase();
                        return !userEmail || !studentEmails.has(userEmail);
                    })
                    .map((user) => ({
                        id: user._id,
                        name: user.name || user.username,
                        type:
                            user.role ||
                            (Array.isArray(user.roles) ? user.roles[0] : null) ||
                            "Användare",
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

        // Deduplicate results by id and type
        const seen = new Map();
        const uniqueResults = [];
        
        for (const result of results) {
            const key = `${result.id}_${result.type}`;
            if (!seen.has(key)) {
                seen.set(key, true);
                uniqueResults.push(result);
            }
        }

        res.json(uniqueResults);
    } catch (err) {
        console.error("❌ Search error:", err);
        res.status(500).json({ message: "Serverfel under sökning." });
    }
});

router.get("/details/:type/:id", async (req, res) => {
    const { type, id } = req.params;

    try {
        let result;

        switch (type) {
            case "Elev":
                const student = await Student.findById(id);
                if (!student) {
                    return res.status(404).json({ message: "Student not found" });
                }
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
            case "Lärare":
            case "teacher":
                const teacherUser = await User.findById(id).lean();
                if (!teacherUser) {
                    return res.status(404).json({ message: "User not found" });
                }

                const teacherProfile = await Teacher.findOne({ userId: id }).lean();
                if (!teacherProfile) {
                    return res.status(404).json({ message: "Teacher profile not found" });
                }

                // Get students who have this teacher as responsible teacher
                const studentsWithTeacher = await Student.find({
                    teacherId: teacherProfile._id,
                })
                    .select("_id name email")
                    .lean();

                // Fetch course instances where this teacher is responsible
                const courseInstances = await CourseInstance.find({
                    responsibleTeacher: teacherProfile._id,
                })
                    .populate("mainCourseId", "courseName courseCode")
                    .sort({ startDate: -1 })
                    .lean();

                // Get all enrollments for course instances where teacher is responsible
                const instanceIds = courseInstances.map(ci => ci._id);
                const enrollments = await StudentEnrollment.find({
                    $or: [
                        { teacherId: teacherProfile._id },
                        { courseInstanceId: { $in: instanceIds } }
                    ]
                })
                    .populate("studentId", "name email")
                    .populate("mainCourseId", "courseName courseCode")
                    .lean();

                const studentsMap = new Map();
                const coursesMap = new Map();

                // Add students with teacher as responsible
                for (const student of studentsWithTeacher) {
                    studentsMap.set(student._id.toString(), {
                        _id: student._id,
                        name: student.name,
                        email: student.email
                    });
                }

                // Add students from enrollments
                for (const enrollment of enrollments) {
                    if (enrollment.studentId) {
                        studentsMap.set(
                            enrollment.studentId._id.toString(),
                            {
                                _id: enrollment.studentId._id,
                                name: enrollment.studentId.name,
                                email: enrollment.studentId.email
                            }
                        );
                    }
                    if (enrollment.mainCourseId) {
                        coursesMap.set(
                            enrollment.mainCourseId._id.toString(),
                            enrollment.mainCourseId
                        );
                    }
                }

                // Format course instances for frontend
                const formattedCourseInstances = courseInstances.map((instance) => ({
                    _id: instance._id,
                    courseName: instance.courseName,
                    courseCode: instance.courseCode,
                    startDate: instance.startDate,
                    endDate: instance.endDate,
                    isCourseInstance: true,
                    mainCourseId: instance.mainCourseId,
                }));

                result = {
                    ...teacherUser,
                    students: Array.from(studentsMap.values()),
                    courses: Array.from(coursesMap.values()),
                    courseInstances: formattedCourseInstances,
                };
                break;

            case "Personal":
                result = await User.findOne({
                    _id: id,
                    roles: {
                        $in: [
                            "admin",
                            "systemadmin",
                            "syv",
                            "specped",
                            "coordinator",
                        ],
                    },
                }).select("username email role roles");
                break;

            case "Kurs":
                // Courses are only templates - students are enrolled in CourseInstances, not Courses
                // This endpoint should only be used from /programsandcourses for managing course templates
                // For viewing enrolled students, use CourseInstance instead
                try {
                    const course = await Course.findById(id).lean();
                    if (!course) {
                        return res.status(404).json({ message: "Course not found" });
                    }

                    // Note: We don't show students here because students are enrolled in CourseInstances, not Courses
                    // To see students, query the CourseInstances that reference this Course
                    const courseInstances = await CourseInstance.find({ mainCourseId: id })
                        .populate("responsibleTeacher", "userId")
                        .lean();

                    // Get unique students from all course instances of this course
                    const instanceIds = courseInstances.map(ci => ci._id);
                    const courseEnrollments = await StudentEnrollment.find({
                        courseInstanceId: { $in: instanceIds },
                    })
                        .populate("studentId", "name email")
                        .populate("teacherId")
                        .lean();

                    const students = courseEnrollments
                        .map((e) => e.studentId)
                        .filter(Boolean);

                    const teachersMap = new Map();
                    for (const enrollment of courseEnrollments) {
                        if (enrollment.teacherId) {
                            const teacherUser = await User.findById(
                                enrollment.teacherId.userId
                            )
                                .select("username email")
                                .lean();
                            if (teacherUser) {
                                teachersMap.set(teacherUser._id.toString(), {
                                    _id: teacherUser._id,
                                    username: teacherUser.username,
                                    email: teacherUser.email || "",
                                });
                            }
                        }
                    }

                    const uniqueStudents = Array.from(
                        new Map(students.map((s) => [s._id.toString(), s])).values()
                    );

                    result = {
                        ...course,
                        students: uniqueStudents,
                        teachers: Array.from(teachersMap.values()),
                        courseInstances: courseInstances.map(ci => ({
                            _id: ci._id,
                            courseName: ci.courseName,
                            courseCode: ci.courseCode,
                            startDate: ci.startDate,
                            endDate: ci.endDate,
                        })),
                        isCourseTemplate: true, // Flag to indicate this is a template, not an instance
                    };
                } catch (courseError) {
                    console.error("❌ Error in Kurs case:", courseError);
                    return res.status(500).json({ message: "Serverfel vid hämtning av kursdetaljer" });
                }
                break;

            case "Kursinstans":
            case "CourseInstance":
                try {
                    const courseInstance = await CourseInstance.findById(id)
                        .populate("mainCourseId")
                        .populate({
                            path: "responsibleTeacher",
                            populate: { path: "userId", select: "username email" },
                            select: "userId subject",
                        })
                        .lean();

                    if (!courseInstance) {
                        return res.status(404).json({ message: "Course instance not found" });
                    }

                    // Get all enrollments for this course instance
                    const enrollments = await StudentEnrollment.find({
                        courseInstanceId: id,
                    })
                        .populate("studentId", "name email")
                        .populate("teacherId")
                        .lean();

                    const students = enrollments
                        .map((e) => e.studentId)
                        .filter(Boolean);

                    const uniqueStudents = Array.from(
                        new Map(students.map((s) => [s._id.toString(), s])).values()
                    );

                    // Get responsible teacher from course instance (if set)
                    let teacher = null;
                    if (courseInstance.responsibleTeacher) {
                        const responsibleTeacherUserId = courseInstance.responsibleTeacher.userId?._id || courseInstance.responsibleTeacher.userId;
                        teacher = {
                            _id: responsibleTeacherUserId, // Use User ID, not Teacher ID
                            username: courseInstance.responsibleTeacher.userId?.username || "Okänd",
                            email: courseInstance.responsibleTeacher.userId?.email || "",
                        };
                    }

                    // Also collect teachers from enrollments (in case course instance doesn't have responsibleTeacher)
                    const teachersMap = new Map();
                    
                    // Add responsible teacher if it exists
                    if (teacher) {
                        teachersMap.set(teacher._id.toString(), teacher);
                    }

                    // Add teachers from enrollments
                    for (const enrollment of enrollments) {
                        if (enrollment.teacherId) {
                            const teacherUser = await User.findById(
                                enrollment.teacherId.userId
                            )
                                .select("username email")
                                .lean();
                            if (teacherUser) {
                                // Use User ID, not Teacher ID, for the route
                                teachersMap.set(teacherUser._id.toString(), {
                                    _id: teacherUser._id, // User ID for the route
                                    username: teacherUser.username,
                                    email: teacherUser.email || "",
                                });
                            }
                        }
                    }

                    const teachers = Array.from(teachersMap.values());

                    result = {
                        ...courseInstance,
                        courseName: courseInstance.courseName,
                        students: uniqueStudents,
                        teacher: teacher, // Keep for backward compatibility
                        teachers: teachers, // Array of all teachers (from instance + enrollments)
                        isCourseInstance: true,
                    };
                } catch (courseInstanceError) {
                    console.error("❌ Error in Kursinstans case:", courseInstanceError);
                    return res.status(500).json({ message: "Serverfel vid hämtning av kursinstansdetaljer" });
                }
                break;

            // Handle other user role types (admin, systemadmin, etc.)
            case "admin":
            case "systemadmin":
            case "syv":
            case "specped":
            case "coordinator":
            case "user":
            case "guest":
            case "Användare":
                result = await User.findById(id).select("username name email role roles").lean();
                if (!result) {
                    return res.status(404).json({ message: "User not found" });
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
