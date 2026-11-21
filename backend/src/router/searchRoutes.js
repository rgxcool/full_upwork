import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Course from "../models/Course.js";
import CourseInstance from "../models/CourseInstance.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Teacher from "../models/Teacher.js";
import ExamAttendance from "../models/ExamAttendance.js";
import { authenticateUser } from "../controllers/authController.js";
import { hasRole } from "../middleware/auth.js";
import { canFeature } from "../middleware/authorization.js";
import { PERMISSION_FEATURES } from "../config/permissions.js";
import logger from "../utils/logger.js";
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { studentScopeFilter } from "../utils/tenantScope.js";
import { getDateOnlyRange, parseSearchDate } from "../utils/dateSearch.js";

const router = express.Router();

const ALLOWED_STAFF_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped", "tester"];

const dedupeById = (docs) => Array.from(new Map(docs.map(d => [d._id.toString(), d])).values());

/**
 * Builds a text search clause from a query string.
 * Splits on whitespace and creates a $search clause.
 */
const buildTextSearchClause = (q) => {
    const tokens = String(q)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `"${t.replace(/"/g, "")}"`)
        .join(" ");
    if (!tokens) return null;
    return { $text: { $search: tokens, $language: "none" } };
};

/**
 * Parses a name search query into parts and creates a regex that matches
 * all parts against the student name field.
 * 
 * For example, "Anna Maria Svensson" will create a regex that matches
 * if the student name contains all three parts as substrings.
 * 
 * @param {String} q - The search query string
 * @returns {Object} - A mongoDB query object for name search, or null
 */
const buildNameSearchClause = (q) => {
    if (!q || q.trim().length === 0) return null;
    
    const trimmed = q.trim();
    const parts = trimmed.split(/[\s,]+/).filter(Boolean);
    
    // For multiple parts, require all parts to match the name (handles "Bano, Saira" vs "bano saira")
    if (parts.length > 1) {
        return {
            $and: parts.map(p => ({
                name: { $regex: escapeRegExp(p), $options: "i" }
            }))
        };
    }
    
    const regexStr = escapeRegExp(parts[0] || q);
    return { name: { $regex: regexStr, $options: "i" } };
};

/**
 * Search for students by name, supporting first/middle/last name parsing.
 */
const buildStudentNameQuery = (q) => {
    return buildNameSearchClause(q) || { name: { $regex: escapeRegExp(q), $options: "i" } };
};

/**
 * Search for users by name, supporting first/middle/last name parsing.
 */
const buildUserNameQuery = (q) => {
    if (!q || q.trim().length === 0) return null;
    
    const trimmed = q.trim();
    const parts = trimmed.split(/[\s,]+/).filter(Boolean);
    
    if (parts.length > 1) {
        return {
            $and: parts.map(p => ({
                $or: [
                    { username: { $regex: escapeRegExp(p), $options: "i" } },
                    { email: { $regex: escapeRegExp(p), $options: "i" } },
                    { name: { $regex: escapeRegExp(p), $options: "i" } },
                ]
            }))
        };
    }
    
    const regexStr = escapeRegExp(q.trim());
    return {
        $or: [
            { username: { $regex: regexStr, $options: "i" } },
            { email: { $regex: regexStr, $options: "i" } },
            { name: { $regex: regexStr, $options: "i" } },
        ],
    };
};

router.get("/course-enrollments", authenticateUser, canFeature(PERMISSION_FEATURES.SEARCH_USERS), async (req, res) => {
    try {
        let query = {
            "education.type": "Course",
            "education.refId": { $exists: true },
        };

        // If user is a teacher, filter students by their teacherId
        if (req.user.role === "teacher") {
            const teacher = await Teacher.findOne({ userId: req.user.userId });

            if (!teacher) {
                return res
                    .status(403)
                    .json({ error: "Teacher profile not found" });
            }

            query.teacherId = teacher._id;
        }

        let studentsQuery = Student.find(query);
        if (studentsQuery && typeof studentsQuery.select === "function") {
            studentsQuery = studentsQuery.select("_id");
        }
        if (studentsQuery && typeof studentsQuery.lean === "function") {
            studentsQuery = studentsQuery.lean();
        }
        const students = await studentsQuery;
        const studentIds = students.map((s) => s._id);

        const allCourseRefs = [];

        if (studentIds.length > 0) {
            let enrollmentsQuery;
            if (studentIds.length === 1) {
                enrollmentsQuery = StudentEnrollment.find({ studentId: studentIds[0] });
            } else {
                enrollmentsQuery = StudentEnrollment.find({ studentId: { $in: studentIds } });
            }

            if (enrollmentsQuery && typeof enrollmentsQuery.populate === "function") {
                enrollmentsQuery = enrollmentsQuery.populate("mainCourseId", "courseName");
            }
            if (enrollmentsQuery && typeof enrollmentsQuery.lean === "function") {
                enrollmentsQuery = enrollmentsQuery.lean();
            }
            const studentEnrollments = await enrollmentsQuery;

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
        logger.error({ err: error }, "Error fetching courses from education[]")
        res.status(500).json({ message: "Serverfel vid hämtning av kurser" });
    }
});

router.get("/search", authenticateUser, canFeature(PERMISSION_FEATURES.SEARCH_USERS), async (req, res) => {
    const { q, date, type } = req.query;

    try {
        const results = [];
        let studentQuery = {};

        // Backend-enforced tenant (kommun) scope for students. Scoped users only
        // discover students in their allowed municipalities; global users get {}.
        Object.assign(studentQuery, studentScopeFilter(req.user));

        // If user is a teacher, filter students by their teacherId
        if (req.user.role === "teacher") {
            const teacher = await Teacher.findOne({ userId: req.user.userId });

            if (!teacher) {
                return res
                    .status(403)
                    .json({ error: "Teacher profile not found" });
            }

            studentQuery.teacherId = teacher._id;
        }

        if (type === "Datum" && date) {
            // A search date is a calendar day, not an instant. Build the day
            // range in an explicit timezone so the result does not change with
            // the server's TZ setting, and reject impossible dates such as
            // 2024-02-30 instead of silently rolling them over.
            const parsedDate = parseSearchDate(date);
            if (!parsedDate) {
                return res.status(400).json({ message: "Ogiltigt datum" });
            }

            const dateRange = getDateOnlyRange(parsedDate.dateOnly);
            if (!dateRange) {
                return res.status(400).json({ message: "Ogiltigt datum" });
            }

            const { startOfDay, endOfDay } = dateRange;

            const enrollments = await StudentEnrollment.find({
                $or: [
                    { startDate: { $gte: startOfDay, $lte: endOfDay } },
                    { endDate: { $gte: startOfDay, $lte: endOfDay } },
                ],
            }).populate({
                path: 'studentId',
                select: '_id name email',
                match: studentQuery
            });

            const students = enrollments
                .filter(e => e.studentId)
                .map(e => e.studentId);

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
            // Multi-part queries ("bano saira") must match every part, so
            // "Bano, Saira" is found even though the stored order differs.
            const studentNameClause = buildStudentNameQuery(q);
            const studentRegex = Student.find({
                ...studentQuery,
                ...studentNameClause,
            }).select("_id name email");

            const userNameClause = buildUserNameQuery(q);
            const userRegex = User.find(userNameClause).select("_id username name email role roles");

            const studentText = buildTextSearchClause(q)
                ? Student.find({ ...studentQuery, ...buildTextSearchClause(q) }).select("_id name email")
                : Promise.resolve([]);

            const userText = buildTextSearchClause(q)
                ? User.find(buildTextSearchClause(q)).select("_id username name email role roles")
                : Promise.resolve([]);

            const [students, users] = await Promise.all([
                studentText.then((textHits) =>
                    studentRegex.then((regexHits) => dedupeById([...textHits, ...regexHits]))
                ),
                userText.then((textHits) =>
                    userRegex.then((regexHits) => dedupeById([...textHits, ...regexHits]))
                ),
            ]);

            const studentEmails = new Set(students.map(s => s.email?.toLowerCase()).filter(Boolean));

            results.push(
                ...students.map((student) => ({
                    id: student._id,
                    name: student.name,
                    type: "Elev",
                    extra: `Email: ${student.email}`,
                })),
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
                    })
                ),
            );
        }

        if (shouldSearchCourses) {
            let studentsQuery = Student.find(studentQuery);
            if (studentsQuery && typeof studentsQuery.select === "function") {
                studentsQuery = studentsQuery.select("_id");
            }
            if (studentsQuery && typeof studentsQuery.lean === "function") {
                studentsQuery = studentsQuery.lean();
            }
            const students = await studentsQuery;
            const studentIds = students.map((s) => s._id);

            const courseMap = new Map();

            if (studentIds.length > 0) {
                let enrollmentsQuery;
                if (studentIds.length === 1) {
                    enrollmentsQuery = mongoose.model("StudentEnrollment").find({ studentId: studentIds[0] });
                } else {
                    enrollmentsQuery = mongoose.model("StudentEnrollment").find({ studentId: { $in: studentIds } });
                }
                if (enrollmentsQuery && typeof enrollmentsQuery.populate === "function") {
                    enrollmentsQuery = enrollmentsQuery.populate("mainCourseId", "courseName")
                        .populate("coursePackageId", "coursePackageName")
                        .populate("programId", "programName");
                }
                if (enrollmentsQuery && typeof enrollmentsQuery.lean === "function") {
                    enrollmentsQuery = enrollmentsQuery.lean();
                }
                const searchEnrollments = await enrollmentsQuery;

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

                    if (name && name.match(new RegExp(escapeRegExp(q), "i"))) {
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

        // Pagination: per-route cap (50) overrides the shared requestOptimizer cap (100)
        const limit = Math.min(parseInt(req.query?.limit) || 50, 50);
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const skip = (page - 1) * limit;

        const total = uniqueResults.length;
        const paginatedResults = uniqueResults.slice(skip, skip + limit);

        res.setHeader("X-Total-Count", total);
        res.setHeader("X-Total-Pages", Math.ceil(total / limit));
        res.setHeader("X-Current-Page", page);

        res.json(paginatedResults);
    } catch (err) {
        logger.error({ err }, "Search error")
        res.status(500).json({ message: "Serverfel under sökning." });
    }
});

router.get("/details/:type/:id", authenticateUser, canFeature(PERMISSION_FEATURES.SEARCH_USERS), async (req, res) => {
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

                const studentsWithTeacher = await Student.find({
                    teacherId: teacherProfile._id,
                })
                    .select("_id name email")
                    .lean();

                const courseInstances = await CourseInstance.find({
                    responsibleTeacher: teacherProfile._id,
                })
                    .populate("mainCourseId", "courseName courseCode")
                    .sort({ startDate: -1 })
                    .lean();

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

                for (const student of studentsWithTeacher) {
                    studentsMap.set(student._id.toString(), {
                        _id: student._id,
                        name: student.name,
                        email: student.email
                    });
                }

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
                try {
                    const course = await Course.findById(id).lean();
                    if (!course) {
                        return res.status(404).json({ message: "Course not found" });
                    }

                    const courseInstances = await CourseInstance.find({
                        mainCourseId: id,
                        isActive: true,
                    })
                        .populate("responsibleTeacher", "userId")
                        .sort({ startDate: -1 })
                        .lean();

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
                    // Batch query users to avoid N+1 query
                    const teacherUserIds = courseEnrollments
                        .map((e) => e.teacherId?.userId)
                        .filter(Boolean);
                    
                    if (teacherUserIds.length > 0) {
                        const uniqueTeacherUserIds = [...new Set(teacherUserIds.map(uid => uid.toString()))];
                        let userQuery = User.find({
                            _id: { $in: uniqueTeacherUserIds },
                        });
                        if (userQuery && typeof userQuery.select === "function") {
                            userQuery = userQuery.select("username email");
                        }
                        if (userQuery && typeof userQuery.lean === "function") {
                            userQuery = userQuery.lean();
                        }
                        const teacherUsers = await userQuery;

                        for (const teacherUser of teacherUsers) {
                            teachersMap.set(teacherUser._id.toString(), {
                                _id: teacherUser._id,
                                username: teacherUser.username,
                                email: teacherUser.email || "",
                            });
                        }
                    }

                    const courseUniqueStudents = Array.from(
                        new Map(students.map((s) => [s._id.toString(), s])).values()
                    );

                    result = {
                        ...course,
                        students: courseUniqueStudents,
                        teachers: Array.from(teachersMap.values()),
                        courseInstances: courseInstances.map(ci => ({
                            _id: ci._id,
                            courseName: ci.courseName,
                            courseCode: ci.courseCode,
                            startDate: ci.startDate,
                            endDate: ci.endDate,
                            isCourseInstance: true,
                            mainCourseId: ci.mainCourseId,
                        })),
                        isCourseTemplate: true,
                    };
                } catch (courseError) {
                    logger.error({ err: courseError }, "Error in Kurs case")
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

                    const enrollments = await StudentEnrollment.find({
                        courseInstanceId: id,
                    })
                        .populate("studentId", "name email personalNumber examTime examMunicipality examLocation examRoom municipality attendedExam")
                        .populate("teacherId")
                        .lean();

                    const students = enrollments
                        .map((e) => {
                            if (!e.studentId) return null;
                            const s = e.studentId;
                            return {
                                _id: s._id,
                                name: s.name,
                                email: s.email,
                                personalNumber: s.personalNumber,
                                attended: s.attendedExam || false,
                                examTime: s.examTime || "",
                                examMunicipality: s.examMunicipality || s.municipality?.type || (typeof s.municipality === "string" ? s.municipality : "") || "",
                                examLocation: s.examLocation || "",
                                examRoom: s.examRoom || "",
                            };
                        })
                        .filter(Boolean);

                    // Prefer the latest exam attendance record: it carries the
                    // time, municipality and place that were entered when the
                    // exam was planned/attended.
                    if (students.length > 0) {
                        const attendanceRecords = await ExamAttendance.find({
                            studentId: { $in: students.map((s) => s._id) },
                        })
                            .sort({ examDate: -1, updatedAt: -1 })
                            .lean();

                        const latestByStudent = new Map();
                        for (const record of attendanceRecords) {
                            const key = String(record.studentId);
                            if (!latestByStudent.has(key)) {
                                latestByStudent.set(key, record);
                            }
                        }

                        for (const student of students) {
                            const attendance = latestByStudent.get(
                                String(student._id)
                            );
                            if (!attendance) continue;
                            student.attended = Boolean(attendance.attended);
                            student.examTime =
                                attendance.examTime || student.examTime;
                            student.examMunicipality =
                                attendance.examMunicipality ||
                                student.examMunicipality;
                            student.examLocation =
                                attendance.examLocation || student.examLocation;
                            student.examRoom =
                                attendance.examRoom || student.examRoom;
                        }
                    }

                    const instanceUniqueStudents = Array.from(
                        new Map(students.map((s) => [s._id.toString(), s])).values()
                    );

                    let teacher = null;
                    if (courseInstance.responsibleTeacher) {
                        const responsibleTeacherUserId = courseInstance.responsibleTeacher.userId?._id || courseInstance.responsibleTeacher.userId;
                        teacher = {
                            _id: responsibleTeacherUserId,
                            username: courseInstance.responsibleTeacher.userId?.username || "Okänd",
                            email: courseInstance.responsibleTeacher.userId?.email || "",
                        };
                    }

                    const teachersMap = new Map();
                    if (teacher) {
                        teachersMap.set(teacher._id.toString(), teacher);
                    }

                    // Batch query users to avoid N+1 query
                    const enrollmentTeacherUserIds = enrollments
                        .map((e) => e.teacherId?.userId)
                        .filter(Boolean);

                    if (enrollmentTeacherUserIds.length > 0) {
                        const uniqueEnrollmentTeacherUserIds = [
                            ...new Set(enrollmentTeacherUserIds.map(uid => uid.toString()))
                        ];
                        let userQuery = User.find({
                            _id: { $in: uniqueEnrollmentTeacherUserIds },
                        });
                        if (userQuery && typeof userQuery.select === "function") {
                            userQuery = userQuery.select("username email");
                        }
                        if (userQuery && typeof userQuery.lean === "function") {
                            userQuery = userQuery.lean();
                        }
                        const teacherUsers = await userQuery;

                        for (const teacherUser of teacherUsers) {
                            teachersMap.set(teacherUser._id.toString(), {
                                _id: teacherUser._id,
                                username: teacherUser.username,
                                email: teacherUser.email || "",
                            });
                        }
                    }

                    const teachers = Array.from(teachersMap.values());

                    result = {
                        ...courseInstance,
                        courseName: courseInstance.courseName,
                        students: instanceUniqueStudents,
                        teacher: teacher,
                        teachers: teachers,
                        isCourseInstance: true,
                    };
                } catch (courseInstanceError) {
                    logger.error({ err: courseInstanceError }, "Error in Kursinstans case")
                    return res.status(500).json({ message: "Serverfel vid hämtning av kursinstansdetaljer" });
                }
                break;

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
        logger.error({ err: error }, "Fetch details error")
        res.status(500).json({ message: "Serverfel vid hämtning av detaljer" });
    }
});

router.put("/update-student/:id", authenticateUser, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
    try {
        const allowedStudentFields = ['name', 'email', 'personalNumber', 'phone', 'municipality', 'startDate', 'endDate', 'finalExamDate', 'teacher', 'dropout', 'additionalInfo', 'courses', 'education'];
        const updates = {};
        for (const field of allowedStudentFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }
        const updatedStudent = await Student.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' });
        res.json(updatedStudent);
    } catch (error) {
        logger.error({ err: error }, "Error updating student")
        res.status(500).json({ message: "Kunde inte uppdatera studenten" });
    }
});

router.put("/update-user/:id", authenticateUser, hasRole(["admin", "systemadmin"]), canFeature(PERMISSION_FEATURES.MANAGE_USERS_PERMISSIONS), async (req, res) => {
    try {
        const VALID_USER_ROLES = [
            "guest", "user", "student", "coordinator", "specped",
            "syv", "teacher", "admin", "systemadmin",
        ];

        if (req.body.role !== undefined && !VALID_USER_ROLES.includes(req.body.role)) {
            return res.status(400).json({ message: `Invalid role: ${req.body.role}` });
        }
        if (req.body.roles !== undefined) {
            if (!Array.isArray(req.body.roles)) {
                return res.status(400).json({ message: "roles must be an array" });
            }
            const invalidRoles = req.body.roles.filter((r) => !VALID_USER_ROLES.includes(r));
            if (invalidRoles.length > 0) {
                return res.status(400).json({ message: `Invalid role(s): ${invalidRoles.join(", ")}` });
            }
        }

        const allowedUserFields = ['name', 'email', 'role', 'roles', 'username'];
        const updates = {};
        for (const field of allowedUserFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }
        const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' });
        res.json(updatedUser);
    } catch (error) {
        logger.error({ err: error }, "Error updating user")
        res.status(500).json({ message: "Kunde inte uppdatera användaren" });
    }
});

export default router;
