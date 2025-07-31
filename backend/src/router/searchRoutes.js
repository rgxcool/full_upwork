import express from "express";
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
                return res.status(403).json({ error: "Teacher profile not found" });
            }
            
            // Filter students by this teacher's ID
            query.teacherId = teacher._id;
            console.log(`🔍 Teacher ${teacher._id} fetching their courses`);
        }
        
        const students = await Student.find(query)
            .populate("education.refId", "courseName")
            .select("education");

        const allCourseRefs = [];

        for (const student of students) {
            for (const edu of student.education) {
                if (
                    edu.type === "Course" &&
                    edu.refId?._id &&
                    edu.refId?.courseName
                ) {
                    allCourseRefs.push({
                        _id: edu.refId._id.toString(),
                        name: edu.refId.courseName,
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
                return res.status(403).json({ error: "Teacher profile not found" });
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
                    name: { $regex: q, $options: "i" } 
                }).select(
                    "_id name email"
                ),
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
            const students = await Student.find({
                ...studentQuery,
                "education.refId": { $ne: null },
            })
                .populate("education.refId")
                .lean();

            const courseMap = new Map();

            for (const student of students) {
                for (const edu of student.education) {
                    if (!edu.refId) continue;

                    let name = "";
                    if (edu.type === "Course") name = edu.refId.courseName;
                    if (edu.type === "Program") name = edu.refId.programName;
                    if (edu.type === "CoursePackage")
                        name = edu.refId.coursePackageName;

                    if (name && name.match(new RegExp(q, "i"))) {
                        const courseId = edu.refId._id.toString();
                        if (!courseMap.has(courseId)) {
                            courseMap.set(courseId, {
                                id: courseId,
                                name,
                                type: edu.type,
                                extra: `Typ: ${edu.type}`,
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

    try {
        let result;

        switch (type) {
            case "Elev":
                // Use the enhanced student details system
                const student = await Student.findById(id)
                    .populate("teacherId", "name email")
                    .select("+commentHistory.seenBy");

                if (!student) {
                    return res
                        .status(404)
                        .json({ message: "Student not found" });
                }

                // Manually populate education references
                const populatedStudent = student.toObject();

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
                const enrollments = await StudentEnrollment.find({
                    studentId: id,
                })
                    .populate("courseInstanceId")
                    .populate("mainCourseId")
                    .populate("teacherId", "name email")
                    .sort({ startDate: -1 });

                // Convert enrollments to education format for display
                const enrollmentEducation = enrollments.map((enrollment) => ({
                    _id: enrollment._id,
                    type: "Course",
                    refId: enrollment.mainCourseId,
                    startDate: enrollment.startDate,
                    endDate: enrollment.endDate,
                    status: enrollment.status,
                    grade: enrollment.grade,
                    enrollmentId: enrollment._id,
                    courseInstanceId: enrollment.courseInstanceId?._id,
                    courseInstance: enrollment.courseInstanceId,
                    addedAt: enrollment.createdAt,
                    addedBy: enrollment.teacherId?.name || "System",
                    isEnrollment: true, // Flag to identify this came from enrollment system
                }));

                // Combine both education arrays (old system + new enrollment system)
                populatedStudent.education = [
                    ...populatedStudent.education,
                    ...enrollmentEducation,
                ];

                // Add enrollment statistics
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
                const students = await Student.find({
                    "education.refId": id,
                }).select("name _id");
                const sampleStudent = await Student.findOne({
                    "education.refId": id,
                })
                    .populate("education.refId")
                    .populate({
                        path: "teacherId", // ✅ rätt fält i Student.js
                        populate: {
                            path: "userId", // ✅ referens i Teacher.js
                            select: "username email",
                        },
                    });

                if (!sampleStudent)
                    return res
                        .status(404)
                        .json({ message: "Kursen har inga elever" });

                const matchingEdu = sampleStudent.education.find(
                    (e) => e?.refId?._id?.toString() === id
                );

                let courseName =
                    matchingEdu?.refId?.courseName ||
                    matchingEdu?.refId?.programName ||
                    matchingEdu?.refId?.coursePackageName ||
                    "Okänd kurs";

                result = {
                    courseId: id,
                    courseName,
                    teacher: sampleStudent.teacherId?.userId || null, // ✅ detta är korrekt!
                    students,
                };
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
