import express from "express";
const router = express.Router();
import User from "../models/User.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import bcrypt from "bcrypt";
import { isAuthenticated } from "../middleware/auth.js";
import { can } from "../middleware/authorization.js";
import logger from "../utils/logger.js";
import {
    cleanPhoneNumbers,
    findTeacherUser,
    generateStrongPassword,
    getNextAvailableColor,
    listTeacherUsers,
    teacherUserFilter,
    toTeacherDTO,
} from "../utils/teacherProfile.js";

// DEBUG: Testa populering av userId för alla lärare
router.get(
  "/debug-teachers",
  isAuthenticated,
  can("teachers:read"),
  async (req, res) => {
    try {
      const teachers = await listTeacherUsers();

      const results = teachers.map((t) => ({
        teacherId: t._id,
        subject: t.teacherProfile?.subject,
        colorCode: t.teacherProfile?.colorCode,
        user: { id: t._id, username: t.username, email: t.email, roles: t.roles },
      }));

      res.json({ success: true, count: results.length, teachers: results });
    } catch (err) {
      logger.error({ err }, "DEBUG populate error")
      res.status(500).json({ error: "Debug route failed." });
    }
  }
);


// Get current user's teacher profile (for teachers to get their own ID)
router.get(
    "/me/teacher",
    isAuthenticated,
    async (req, res) => {
        try {
            const roles = Array.isArray(req.user.roles) && req.user.roles.length ? req.user.roles : [req.user.role];
            if (!roles.includes("teacher")) {
                return res.status(403).json({ error: "Only teachers can access this endpoint" });
            }
            // The teacher's own User, which is also their teacher id (#102).
            const teacher = await findTeacherUser(req.user.userId, { lean: true });
            if (!teacher) {
                return res.status(404).json({ error: "Teacher profile not found" });
            }
            res.status(200).json(toTeacherDTO(teacher));
        } catch (error) {
            logger.error({ err: error.message }, "Error fetching teacher profile")
            res.status(500).json({ error: "Failed to fetch teacher profile." });
        }
    }
);

// Get all teachers
router.get(
    "/teachers",
    isAuthenticated,
    can("teachers:read"),
    async (req, res) => {
        try {
            const teachers = await listTeacherUsers();
            res.status(200).json(teachers.map(toTeacherDTO));
        } catch (error) {
            logger.error({ err: error.message }, "Error fetching teachers")
            res.status(500).json({ error: "Failed to fetch teachers." });
        }
    }
);

// POST /admin/teacher - Create a user + teacher profile (Admin only)
router.post(
    "/admin/teacher",
    isAuthenticated,
    can("teachers:create"),
    async (req, res) => {
        logger.info({ payloadKeys: req.body ? Object.keys(req.body) : [] }, "Incoming teacher POST (admin)")

        try {
            const { username, email, subject, colorCode, generatePassword, phoneNumbers } =
                req.body;

            if (!username || !email || !subject) {
                return res.status(400).json({
                    error: "Username, email, and subject are required.",
                });
            }

            // Check if user with this email already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res
                    .status(409)
                    .json({ error: "A user with this email already exists." });
            }

            // Generate password if requested
            let plainPassword = null;
            let hashedPassword = null;

            if (generatePassword) {
                plainPassword = generateStrongPassword();
                hashedPassword = await bcrypt.hash(plainPassword, 12);
            } else {
                // If no password generation requested, set a default that forces password change
                plainPassword = "ChangeMe123!";
                hashedPassword = await bcrypt.hash(plainPassword, 12);
            }

            // Create new User
            const savedUser = await User.create({
                username,
                email,
                password: hashedPassword,
                roles: ["teacher"],
                mustChangePassword: !generatePassword,
                teacherProfile: {
                    colorCode: colorCode || (await getNextAvailableColor()),
                    subject: (subject || "").trim(),
                    phoneNumbers: cleanPhoneNumbers(phoneNumbers) || [],
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Return success with password if generated
            const response = {
                success: true,
                message: "Teacher created successfully.",
                data: {
                    user: {
                        id: savedUser._id,
                        username: savedUser.username,
                        email: savedUser.email,
                        roles: savedUser.roles,
                    },
                    // Same id as the user since #102.
                    teacher: {
                        id: savedUser._id,
                        subject: savedUser.teacherProfile.subject,
                        colorCode: savedUser.teacherProfile.colorCode,
                    },
                },
            };

            if (generatePassword) {
                response.password = plainPassword;
            }

            res.status(201).json(response);
        } catch (error) {
            logger.error({ err: error.message }, "Error in POST /admin/teacher")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// POST /teacher - Create a user + teacher profile (kept for backward compatibility)
router.post("/teacher", isAuthenticated, can("teachers:create"), async (req, res) => {
    logger.info({ payloadKeys: req.body ? Object.keys(req.body) : [] }, "Incoming teacher POST")

    try {
            const { username, email, colorCode, subject, phoneNumbers, generatePassword } = req.body;

        if (!username || !email) {
            return res
                .status(400)
                .json({ error: "Username and email are required." });
        }

        // Check if user with this email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res
                .status(409)
                .json({ error: "A user with this email already exists." });
        }

        // Generate a password so the User satisfies its required field
        const plainPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        // Create new User
        const savedUser = await User.create({
            username,
            email,
            password: hashedPassword,
            roles: ["teacher"],
            mustChangePassword: !generatePassword,
            teacherProfile: {
                colorCode: colorCode || (await getNextAvailableColor()),
                subject: subject || "Övrigt",
                phoneNumbers: cleanPhoneNumbers(phoneNumbers) || [],
            },
        });

        // Never echo the password hash back.
        const userWithoutPassword = savedUser.toObject();
        delete userWithoutPassword.password;
        res.status(201).json({
            message: "Teacher created successfully.",
            data: {
                user: userWithoutPassword,
                teacher: toTeacherDTO(savedUser),
            },
            password: plainPassword,
        });
    } catch (error) {
        logger.error({ err: error.message }, "Error in POST /teacher")
        res.status(500).json({ error: "Internal server error." });
    }
});

// PUT /teachers/:id - Update teacher information
router.put(
    "/teachers/:id",
    isAuthenticated,
    can("teachers:update"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { username, email, subject, colorCode, phoneNumbers } = req.body;

            const teacher = await findTeacherUser(id, { select: "_id" });
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            const update = {};
            if (username) update.username = username;
            if (email) update.email = email;
            if (subject) update["teacherProfile.subject"] = subject;
            if (colorCode) update["teacherProfile.colorCode"] = colorCode;
            const phones = cleanPhoneNumbers(phoneNumbers);
            if (phones) update["teacherProfile.phoneNumbers"] = phones;

            const updated = await User.findOneAndUpdate(
                teacherUserFilter({ _id: teacher._id }),
                { $set: update },
                { returnDocument: "after" }
            ).lean();

            res.json({
                success: true,
                message: "Teacher updated successfully",
                teacher: toTeacherDTO(updated),
            });
        } catch (error) {
            logger.error({ err: error.message }, "Error updating teacher")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// PUT /teachers/:id/password - Change teacher password
router.put(
    "/teachers/:id/password",
    isAuthenticated,
    can("teachers:update"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { password } = req.body;

            if (!password) {
                return res.status(400).json({ error: "Password is required." });
            }

            const teacher = await findTeacherUser(id, { select: "_id" });
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            await User.findByIdAndUpdate(teacher._id, {
                password: hashedPassword,
                updatedAt: new Date(),
            });

            res.json({
                success: true,
                message: "Password updated successfully",
            });
        } catch (error) {
            logger.error({ err: error.message }, "Error updating password")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// Unassign a teacher from all students, enrollments and course instances.
// Returns counts keyed by model so callers can surface how many records were affected.
async function unassignTeacherFromAll(id) {
    const studentResult = await Student.updateMany(
        { teacherId: id },
        { $set: { teacherId: null } }
    );
    const enrollmentResult = await StudentEnrollment.updateMany(
        { teacherId: id },
        { $set: { teacherId: null } }
    );
    const responsibleResult = await CourseInstance.updateMany(
        { responsibleTeacher: id },
        { $set: { responsibleTeacher: null } }
    );
    const assistantResult = await CourseInstance.updateMany(
        { assistantTeacher: id },
        { $set: { assistantTeacher: null } }
    );

    return {
        students: studentResult.modifiedCount || 0,
        enrollments: enrollmentResult.modifiedCount || 0,
        responsibleCourses: responsibleResult.modifiedCount || 0,
        assistantCourses: assistantResult.modifiedCount || 0,
    };
}

// DELETE /teachers/:id - Delete teacher
router.delete(
    "/teachers/:id",
    isAuthenticated,
    can("teachers:delete"),
    async (req, res) => {
        try {
            const { id } = req.params;

            const teacher = await findTeacherUser(id, { select: "_id" });
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            // Cascade: unassign the departing teacher from all students,
            // enrollments and course instances before deleting the account.
            const unassigned = await unassignTeacherFromAll(teacher._id);
            await User.findByIdAndDelete(teacher._id);

            res.json({
                success: true,
                message: "Teacher deleted successfully",
                unassigned,
            });
        } catch (error) {
            logger.error({ err: error.message }, "Error deleting teacher")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// Unassign all students from a teacher
router.put(
    "/teachers/:id/unassign-all-students",
    isAuthenticated,
    can("teachers:unassign"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const unassigned = await unassignTeacherFromAll(id);
            res.json({
                success: true,
                message: `Unassigned ${unassigned.students} students from teacher.`,
                unassigned,
            });
        } catch (error) {
            logger.error({ err: error }, "Error unassigning students from teacher")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// ─── Staff Profile Endpoints ────────────────────────────────────────────────

/**
 * Staff profile read access: staff with "teachers:read" (admin/systemadmin) see any
 * profile; a teacher may open their OWN profile (Filarkiv, courses, students), which
 * the frontend route already offers. `:id` is the teacher's User id (#102).
 */
const canReadStaffProfile = async (req, res, next) => {
    const roles = Array.isArray(req.user?.roles) && req.user.roles.length ? req.user.roles : [req.user?.role];
    if (roles.includes("teacher") && req.user?.userId && String(req.params.id) === String(req.user.userId)) {
        return next();
    }
    return can("teachers:read")(req, res, next);
};

// GET /teachers/:id/profile — full teacher profile with active/completed courses and student counts
router.get(
    "/teachers/:id/profile",
    isAuthenticated,
    canReadStaffProfile,
    async (req, res) => {
        try {
            const { id } = req.params;

            const teacher = await findTeacherUser(id, { lean: true });
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            const now = new Date();

            // Fetch all course instances where this teacher is responsible or assistant
            const courseInstances = await CourseInstance.find({
                $or: [
                    { responsibleTeacher: id },
                    { assistantTeacher: id },
                ],
            })
                .populate("mainCourseId", "courseName courseCode coursePoints")
                .sort({ startDate: -1 });

            // For each course instance, count enrolled students
            const activeCourses = [];
            const completedCourses = [];

            for (const instance of courseInstances) {
                const studentCount = await StudentEnrollment.countDocuments({
                    courseInstanceId: instance._id,
                    status: { $nin: ["dropped"] },
                });

                const courseData = {
                    instanceId: instance._id,
                    courseName: instance.courseName,
                    courseCode: instance.courseCode,
                    coursePoints: instance.coursePoints || instance.mainCourseId?.coursePoints,
                    startDate: instance.startDate,
                    endDate: instance.endDate,
                    slutprovDate: instance.slutprovDate,
                    studentCount,
                    isResponsible: instance.responsibleTeacher?.toString() === id,
                };

                if (instance.endDate >= now) {
                    activeCourses.push(courseData);
                } else {
                    completedCourses.push(courseData);
                }
            }

            // Count total unique students across all active courses
            const activeInstanceIds = activeCourses.map(c => c.instanceId);
            const totalStudents = activeInstanceIds.length > 0
                ? await StudentEnrollment.distinct("studentId", {
                    courseInstanceId: { $in: activeInstanceIds },
                    status: { $nin: ["dropped"] },
                }).then(ids => ids.length)
                : 0;

            res.json({
                teacher: (({ userId: user, ...dto }) => ({ ...dto, user }))(toTeacherDTO(teacher)),
                activeCourses,
                completedCourses,
                totalStudents,
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching teacher profile")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// GET /teachers/:id/courses/:courseInstanceId/students — students in a specific course instance
router.get(
    "/teachers/:id/courses/:courseInstanceId/students",
    isAuthenticated,
    can("teachers:read"),
    async (req, res) => {
        try {
            const { id, courseInstanceId } = req.params;

            // Verify the teacher is assigned to this course instance (or user is admin)
            const userRoles = req.user.roles || (req.user.role ? [req.user.role] : []);
            const isAdmin = userRoles.some(r => ["admin", "systemadmin", "tester"].includes(r));

            if (!isAdmin) {
                const instance = await CourseInstance.findById(courseInstanceId);
                if (!instance) {
                    return res.status(404).json({ error: "Course instance not found." });
                }
                const isAssigned =
                    instance.responsibleTeacher?.toString() === id ||
                    instance.assistantTeacher?.toString() === id;
                if (!isAssigned) {
                    return res.status(403).json({ error: "You are not assigned to this course instance." });
                }
            }

            const enrollments = await StudentEnrollment.find({ courseInstanceId })
                .populate("studentId", "name email personalNumber phone dropout")
                .sort({ "studentId.name": 1 });

            const students = enrollments
                .filter(e => e.studentId)
                .map(e => ({
                    enrollmentId: e._id,
                    studentId: e.studentId._id,
                    name: e.studentId.name,
                    email: e.studentId.email,
                    personalNumber: e.studentId.personalNumber,
                    phone: e.studentId.phone,
                    dropout: e.studentId.dropout,
                    status: e.status,
                    grade: e.grade,
                    enrollmentDate: e.enrollmentDate,
                    startDate: e.startDate,
                    endDate: e.endDate,
                }));

            res.json(students);
        } catch (error) {
            logger.error({ err: error }, "Error fetching course students")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// PUT /teachers/:id/vacation — set or clear vacation on the linked User
router.put(
    "/teachers/:id/vacation",
    isAuthenticated,
    can("teachers:update"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { onVacation, vacationStart, vacationEnd, vacationNote } = req.body;

            const teacher = await findTeacherUser(id, { select: "_id" });
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            // Only admin or the teacher themselves can update vacation
            const userRoles = req.user.roles || (req.user.role ? [req.user.role] : []);
            const isAdmin = userRoles.some(r => ["admin", "systemadmin", "tester"].includes(r));
            const isSelf = req.user.userId?.toString() === teacher._id.toString();

            if (!isAdmin && !isSelf) {
                return res.status(403).json({ error: "You can only update your own vacation." });
            }

            const updateData = {};
            if (typeof onVacation === "boolean") {
                updateData.onVacation = onVacation;
            }
            if (vacationStart !== undefined) {
                updateData.vacationStart = vacationStart ? new Date(vacationStart) : null;
            }
            if (vacationEnd !== undefined) {
                updateData.vacationEnd = vacationEnd ? new Date(vacationEnd) : null;
            }
            if (vacationNote !== undefined) {
                updateData.vacationNote = vacationNote || "";
            }

            // If clearing vacation, reset all fields
            if (onVacation === false) {
                updateData.onVacation = false;
                updateData.vacationStart = null;
                updateData.vacationEnd = null;
                updateData.vacationNote = "";
            }

            await User.findByIdAndUpdate(teacher._id, { $set: updateData });

            const updatedUser = await User.findById(teacher._id)
                .select("username email roles onVacation vacationStart vacationEnd vacationNote");

            res.json({
                success: true,
                message: onVacation === false ? "Vacation cleared." : "Vacation updated.",
                user: updatedUser,
            });
        } catch (error) {
            logger.error({ err: error }, "Error updating vacation")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// PUT /teachers/:id — update teacher profile info (subject, phoneNumbers)
router.put(
    "/teachers/:id/profile",
    isAuthenticated,
    can("teachers:update"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { subject, phoneNumbers } = req.body;

            const teacher = await findTeacherUser(id, { select: "_id" });
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            const updateData = {};
            if (subject !== undefined) updateData["teacherProfile.subject"] = subject;
            const phones = cleanPhoneNumbers(phoneNumbers);
            if (phones) updateData["teacherProfile.phoneNumbers"] = phones;

            const updated = await User.findOneAndUpdate(
                teacherUserFilter({ _id: teacher._id }),
                { $set: updateData },
                { returnDocument: "after" }
            ).lean();

            res.json({
                success: true,
                message: "Profile updated.",
                teacher: toTeacherDTO(updated),
            });
        } catch (error) {
            logger.error({ err: error }, "Error updating teacher profile")
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

export default router;
