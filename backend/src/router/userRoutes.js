import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Student from "../models/Student.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { validate, validateId } from "../middleware/validation.js";
import { asyncHandler } from "../utils/errorHandler.js";
import { recordAudit } from "../utils/auditLog.js";
import { PERMISSION_FEATURES } from "../config/permissions.js";
import { ALL_MUNICIPALITIES } from "../config/municipalities.js";
import logger from "../utils/logger.js";

const LOGBOOK_ROLES = ["admin", "systemadmin", "teacher"];

const VALID_USER_ROLES = [
    "guest", "user", "student", "coordinator", "specped",
    "syv", "teacher", "admin", "systemadmin",
];

const VALID_FEATURE_KEYS = Object.values(PERMISSION_FEATURES);


const router = express.Router();

const registerSchema = {
    name: { type: "string", required: true, min: 1, max: 100, sanitize: true },
    email: { type: "string", required: true, email: true },
    password: { type: "string", required: true, password: true },
};

const resetPasswordSchema = {
    token: { type: "string", required: true },
    newPassword: { type: "string", required: true, password: true },
};

router.post("/register", isAuthenticated, hasRole(["admin", "systemadmin"]), validate(registerSchema), async (req, res) => {
    try {
        const { email, password, name, role } = req.body;

        if (!email || !password || !name) {
            return res
                .status(400)
                .send({ message: "Alla fält är obligatoriska!" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).send({
                message: "Emailadressen finns redan, var vänlig att logga in!",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const primaryRole = role && VALID_USER_ROLES.includes(role) ? role : "user";
        const newUser = new User({ name, email, password: hashedPassword, roles: [primaryRole] });
        await newUser.save();

        return res.status(201).send({ message: "Användare registrerad!" });
    } catch (error) {
        logger.error({ err: error }, "Error during registration");
        return res
            .status(500)
            .send({ message: "Ett fel uppstod vid registrering." });
    }
});

router.post("/reset-password", validate(resetPasswordSchema), async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res
                .status(400)
                .send({ message: "Token och nytt lösenord krävs" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await User.findByIdAndUpdate(decoded.id, {
            password: hashedPassword,
            mustChangePassword: false,
        });

        return res.send({ message: "Lösenordet har ändrats!" });
    } catch (error) {
        logger.error({ err: error }, "Error during password reset");
        if (error.name === "TokenExpiredError") {
            return res.status(401).send({ message: "Token har löpt ut." });
        }
        return res
            .status(500)
            .send({ message: "Ett fel uppstod vid lösenordsändring." });
    }
});

/**
 * List / search users
 * GET /api/users
 * Requires admin or systemadmin role.
 * Supports query params: firstName, lastName, username, role, email, q (text search), page, limit
 */
router.get(
    "/users",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(async (req, res) => {
        try {
            const { firstName, lastName, username, role, email, q, page, limit } = req.query;
            const query = {};

            if (q && q.length >= 1) {
                const regex = { $regex: q, $options: "i" };
                query.$or = [
                    { name: regex },
                    { username: regex },
                    { email: regex },
                ];
            } else {
                if (firstName) query.name = { $regex: firstName, $options: "i" };
                if (lastName) query.name = { ...query.name, $regex: lastName, $options: "i" };
                if (username) query.username = { $regex: username, $options: "i" };
                if (email) query.email = { $regex: email, $options: "i" };
            }

            if (role) {
                query.roles = { $in: [role] };
            }

            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
            const skip = (pageNum - 1) * limitNum;

            const [users, total] = await Promise.all([
                User.find(query)
                    .select("-password")
                    .sort({ name: 1 })
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                User.countDocuments(query),
            ]);

            res.setHeader("X-Total-Count", total);
            res.setHeader("X-Total-Pages", Math.ceil(total / limitNum));
            res.setHeader("X-Current-Page", pageNum);

            res.json({ users, total });
        } catch (error) {
            logger.error({ err: error }, "Error listing users");
            res.status(500).json({ message: "Kunde inte hämta användare" });
        }
    })
);

/**
 * Get a single user by ID
 * GET /api/users/:userId
 */
router.get(
    "/users/:userId",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    validateId("userId"),
    asyncHandler(async (req, res) => {
        try {
            const user = await User.findById(req.params.userId).select("-password").lean();
            if (!user) {
                return res.status(404).json({ message: "User not found." });
            }
            res.json(user);
        } catch (error) {
            logger.error({ err: error }, "Error fetching user");
            res.status(500).json({ message: "Kunde inte hämta användare" });
        }
    })
);

router.put(
    "/users/:userId/roles",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { roles } = req.body;
            const { userId } = req.params;

            if (!roles || !Array.isArray(roles)) {
                return res
                    .status(400)
                    .send({ message: "Roles must be an array." });
            }

            const invalidRoles = roles.filter((r) => !VALID_USER_ROLES.includes(r));
            if (invalidRoles.length > 0) {
                return res
                    .status(400)
                    .send({ message: `Invalid role(s): ${invalidRoles.join(", ")}. Valid roles: ${VALID_USER_ROLES.join(", ")}` });
            }

            if (roles.length === 0) {
                return res
                    .status(400)
                    .send({ message: "At least one role is required." });
            }

            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).send({ message: "User not found." });
            }

            user.roles = roles;
            await user.save();

            res.send({ message: "User roles updated successfully.", user: { _id: user._id, name: user.name, email: user.email, roles: user.roles } });
        } catch (error) {
            logger.error({ err: error }, "Error updating user roles");
            res.status(500).send({
                message: "An error occurred while updating user roles.",
            });
        }
    }
);

/**
 * Update user permissions
 * PUT /api/users/:userId/permissions
 */
router.put(
    "/users/:userId/permissions",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { permissions } = req.body;
            const { userId } = req.params;

            if (!permissions || typeof permissions !== "object") {
                return res
                    .status(400)
                    .send({ message: "Permissions must be an object." });
            }

            const invalidKeys = Object.keys(permissions).filter(
                (k) => !VALID_FEATURE_KEYS.includes(k)
            );
            if (invalidKeys.length > 0) {
                return res
                    .status(400)
                    .send({ message: `Invalid permission key(s): ${invalidKeys.join(", ")}. Valid keys: ${VALID_FEATURE_KEYS.join(", ")}` });
            }

            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).send({ message: "User not found." });
            }

            user.permissions = permissions;
            await user.save();

            res.send({ message: "User permissions updated successfully.", user: { _id: user._id, name: user.name, email: user.email, permissions: user.permissions } });
        } catch (error) {
            logger.error({ err: error }, "Error updating user permissions");
            res.status(500).send({
                message: "An error occurred while updating user permissions.",
            });
        }
    }
);

/**
 * Get permission matrix and role/feature definitions
 * GET /api/permissions
 */
router.get(
    "/permissions",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const matrix = {
                calendar_final_exam: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
                search_content: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: false },
                search_users: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: false },
                statistics: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
                manage_users_permissions: { systemadmin: true, admin: true, teacher: false, syv: false, specped: false, coordinator: false, student: false },
                hierarchy_management: { systemadmin: true, admin: false, teacher: false, syv: false, specped: false, coordinator: false, student: false },
                own_settings: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: true },
                add_municipalities_courses: { systemadmin: true, admin: false, teacher: false, syv: false, specped: false, coordinator: false, student: false },
                course_templates: { systemadmin: true, admin: true, teacher: true, syv: false, specped: false, coordinator: false, student: false },
            };

            const rbacPermissions = {
                systemadmin: ['users:create', 'users:read', 'users:update', 'users:delete', 'teachers:read', 'teachers:create', 'teachers:update', 'teachers:delete', 'teachers:unassign', 'assignments:create', 'assignments:read:own', 'assignments:update:own', 'assignments:grade', 'students:view_list:assigned', 'students:view_grades:assigned', 'analytics:read', 'inactivity:read', 'courseTemplates:create', 'courseTemplates:read', 'courseTemplates:update', 'courseTemplates:delete'],
                admin: ['users:create', 'users:read', 'users:update', 'users:delete', 'teachers:read', 'teachers:create', 'teachers:update', 'teachers:delete', 'teachers:unassign', 'analytics:read', 'inactivity:read', 'courseTemplates:create', 'courseTemplates:read', 'courseTemplates:update', 'courseTemplates:delete'],
                teacher: ['inactivity:read', 'assignments:create', 'assignments:read:own', 'assignments:update:own', 'assignments:grade', 'students:view_list:assigned', 'students:view_grades:assigned', 'courseTemplates:create', 'courseTemplates:read', 'courseTemplates:update'],
                coordinator: ['students:view_list:assigned', 'students:view_grades:assigned', 'analytics:read', 'inactivity:read'],
                syv: ['students:view_list:assigned', 'students:view_grades:assigned', 'analytics:read', 'inactivity:read'],
                specped: ['students:view_list:assigned', 'students:view_grades:assigned', 'analytics:read', 'inactivity:read'],
                student: ['viewOwnGrades', 'viewOwnSchedule', 'viewOwnProfile', 'viewCourseInfo', 'viewNotifications'],
            };

            const ALL_RBAC_KEYS = [...new Set(Object.values(RBAC_PERMISSIONS).flat())].sort();

            const RBAC_LABELS = {
                'users:create': 'Skapa användare',
                'users:read': 'Visa användare',
                'users:update': 'Uppdatera användare',
                'users:delete': 'Ta bort användare',
                'teachers:read': 'Visa lärare',
                'teachers:create': 'Skapa lärare',
                'teachers:update': 'Uppdatera lärare',
                'teachers:delete': 'Ta bort lärare',
                'teachers:unassign': 'Avlotta lärare',
                'assignments:create': 'Skapa uppgifter',
                'assignments:read:own': 'Visa egna uppgifter',
                'assignments:update:own': 'Uppdatera egna uppgifter',
                'assignments:grade': 'Betygsätt',
                'students:view_list:assigned': 'Visa elever (tilldelade)',
                'students:view_grades:assigned': 'Visa betyg (tilldelade)',
                'analytics:read': 'Statistik & analys',
                'inactivity:read': 'Inaktivitetsrapport',
                'courseTemplates:create': 'Skapa kursmallar',
                'courseTemplates:read': 'Visa kursmallar',
                'courseTemplates:update': 'Uppdatera kursmallar',
                'courseTemplates:delete': 'Ta bort kursmallar',
                'viewOwnGrades': 'Visa egna betyg',
                'viewOwnSchedule': 'Visa eget schema',
                'viewOwnProfile': 'Visa egen profil',
                'viewCourseInfo': 'Visa kursinfo',
                'viewNotifications': 'Visa aviseringar',
            };

            const roles = [
                { key: 'systemadmin', label: 'Systemadmin' },
                { key: 'admin', label: 'Admin' },
                { key: 'teacher', label: 'Lärare' },
                { key: 'coordinator', label: 'Koordinator' },
                { key: 'syv', label: 'SYV' },
                { key: 'specped', label: 'Specped' },
                { key: 'student', label: 'Elev' },
            ];

            const features = [
                { key: 'calendar_final_exam', label: 'Kalender (slutprov)' },
                { key: 'search_content', label: 'Söka efter innehåll' },
                { key: 'search_users', label: 'Söka efter användare' },
                { key: 'statistics', label: 'Statistik' },
                { key: 'manage_users_permissions', label: 'Hantering av användare och åtkomstbehörigheter' },
                { key: 'hierarchy_management', label: 'Hierarkihantering' },
                { key: 'own_settings', label: 'Egna inställningar' },
                { key: 'add_municipalities_courses', label: 'Lägga till kommuner, kurser etc.' },
                { key: 'course_templates', label: 'Kursmallar (kursmoduler)' },
            ];

            res.send({ roles, features, permissionMatrix: matrix, rbacPermissions, ALL_RBAC_KEYS, RBAC_LABELS });
        } catch (error) {
            logger.error({ err: error }, "Error fetching permissions");
            res.status(500).send({ message: "Could not fetch permissions." });
        }
    }
);

/**
 * Update user municipality (tenant) scope
 * PUT /api/users/:userId/municipalities
 */
router.put(
    "/users/:userId/municipalities",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { municipalities } = req.body;
            const { userId } = req.params;

            if (!municipalities || !Array.isArray(municipalities)) {
                return res
                    .status(400)
                    .send({ message: "Municipalities must be an array." });
            }

            const unique = [...new Set(municipalities)];
            const invalid = unique.filter(
                (m) => !ALL_MUNICIPALITIES.includes(m)
            );
            if (invalid.length > 0) {
                return res
                    .status(400)
                    .send({ message: `Invalid municipality: ${invalid.join(", ")}. Valid: ${ALL_MUNICIPALITIES.join(", ")}` });
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).send({ message: "User not found." });
            }

            user.municipalities = unique;
            await user.save();

            res.send({
                message: "User municipality scope updated successfully.",
                user: { _id: user._id, name: user.name, email: user.email, municipalities: user.municipalities },
            });
        } catch (error) {
            logger.error({ err: error }, "Error updating user municipality scope");
            res.status(500).send({
                message: "An error occurred while updating user municipality scope.",
            });
        }
    }
);

/**
 * Reset user password and return new temporary password
 * POST /api/users/:userId/reset-password
 */
router.post(
    "/users/:userId/reset-password",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { userId } = req.params;

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).send({ message: "User not found." });
            }

            // Generate a new temporary password
            const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase();
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            user.password = hashedPassword;
            user.mustChangePassword = true; // temp password — force change on next login
            await user.save();

            res.send({
                message: "Password reset successfully.",
                tempPassword: tempPassword, // Return the plain text password for admin display
            });
        } catch (error) {
            logger.error({ err: error }, "Error resetting password");
            res.status(500).send({
                message: "An error occurred while resetting password.",
            });
        }
    }
);

/**
 * Create a user account for a student
 * POST /api/users/create-for-student
 */
router.post(
    "/users/create-for-student",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { studentId, email, name } = req.body;
            const Student = (await import("../models/Student.js")).default;

            if (!studentId || !email) {
                return res.status(400).send({
                    message: "Student ID and email are required.",
                });
            }

            // Check if student exists
            const student = await Student.findById(studentId);
            if (!student) {
                return res.status(404).send({ message: "Student not found." });
            }

            // Check if user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(409).send({
                    message: "A user with this email already exists.",
                    user: existingUser,
                });
            }

            // Generate a temporary password
            const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase();
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            // Create user with student role by default
            const newUser = new User({
                username: name || student.name,
                email: email,
                password: hashedPassword,
                roles: ["student"],
                mustChangePassword: true, // temp password — force change on first login
            });

            await newUser.save();

            // Send the temp password to the student (fire-and-log; a failure
            // must never break user creation). The password stays in the
            // response for the admin to see.
            try {
                const { sendEmail, renderTempPasswordEmail } = await import(
                    "../services/emailService.js"
                );
                const { subject, text } = renderTempPasswordEmail({
                    studentName: name || student.name,
                    email,
                    tempPassword,
                });
                await sendEmail({ to: email, subject, text });
            } catch (emailError) {
                logger.warn({ err: emailError }, "Temp-password email skipped (non-fatal)");
            }

            res.status(201).send({
                message: "User created successfully for student.",
                user: {
                    _id: newUser._id,
                    email: newUser.email,
                    username: newUser.username,
                    roles: newUser.roles,
                },
                // The temp password is emailed to the student AND returned here
                // so the admin can pass it along if the mail cannot be delivered.
                tempPassword: tempPassword,
            });
        } catch (error) {
            logger.error({ err: error }, "Error creating user for student");
            res.status(500).send({
                message: "An error occurred while creating user for student.",
            });
        }
    }
);

router.get(
    "/students/:studentId/logbook",
    isAuthenticated,
    hasRole(LOGBOOK_ROLES),
    validateId("studentId"),
    asyncHandler(async (req, res) => {
        try {
            const student = await Student.findById(req.params.studentId);
            if (!student) {
                return res.status(404).send({ message: "Student not found." });
            }
            res.send({
                success: true,
                logbook: student.logbook || [],
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching student logbook");
            res.status(500).send({ message: "Internal server error." });
        }
    })
);

router.post(
    "/students/:studentId/logbook",
    isAuthenticated,
    hasRole(LOGBOOK_ROLES),
    validateId("studentId"),
    asyncHandler(async (req, res) => {
        try {
            const student = await Student.findById(req.params.studentId);
            if (!student) {
                return res.status(404).send({ message: "Student not found." });
            }

            const { title, description, startDate, endDate, placementId, coursePackageId } = req.body;
            if (!title) {
                return res.status(400).send({ message: "Titel krävs." });
            }

            const newKit = {
                id: new mongoose.Types.ObjectId(),
                title,
                description,
                startDate: startDate || new Date(),
                endDate,
                status: "pending",
                placementId,
                coursePackageId,
            };

            student.logbook = (student.logbook || []).concat(newKit);
            await student.save();

            await recordAudit(req, {
                entityType: "Student",
                entityId: student._id,
                action: "logbook:create",
                description: `Lade till loggboks-kit "${title}" för elev ${student.name || req.params.studentId}`,
            });

            res.send({
                success: true,
                logbook: student.logbook,
                message: "Logboken uppdaterades med ny kit.",
            });
        } catch (error) {
            logger.error({ err: error }, "Error adding logbook kit");
            res.status(500).send({ message: "Internal server error." });
        }
    })
);


router.patch(
    "/students/:studentId/logbook/:kitId",
    isAuthenticated,
    hasRole(LOGBOOK_ROLES),
    validateId("studentId"),
    asyncHandler(async (req, res) => {
        const student = await Student.findById(req.params.studentId);
        if (!student) return res.status(404).send({ message: "Student not found." });
        const kit = student.logbook?.id(req.params.kitId);
        if (!kit) return res.status(404).send({ message: "Logbook kit not found." });
        const { title, description, startDate, endDate } = req.body;
        if (typeof title !== "string" || !title.trim()) return res.status(400).send({ message: "Titel krävs." });
        kit.title = title.trim();
        kit.description = typeof description === "string" ? description.trim() : undefined;
        if (startDate !== undefined) kit.startDate = startDate || null;
        if (endDate !== undefined) kit.endDate = endDate || null;
        await student.save();
        await recordAudit(req, { entityType: "Student", entityId: student._id, action: "logbook:update", description: `Uppdaterade loggboks-kit för elev ${student.name || req.params.studentId}` });
        res.send({ success: true, logbook: student.logbook });
    })
);

router.delete(
    "/students/:studentId/logbook/:kitId",
    isAuthenticated,
    hasRole(LOGBOOK_ROLES),
    validateId("studentId"),
    asyncHandler(async (req, res) => {
        const student = await Student.findById(req.params.studentId);
        if (!student) return res.status(404).send({ message: "Student not found." });
        const originalLength = student.logbook?.length || 0;
        student.logbook = (student.logbook || []).filter((kit) => String(kit.id) !== req.params.kitId);
        if (student.logbook.length === originalLength) return res.status(404).send({ message: "Logbook kit not found." });
        await student.save();
        await recordAudit(req, { entityType: "Student", entityId: student._id, action: "logbook:delete", description: `Tog bort loggboks-kit för elev ${student.name || req.params.studentId}` });
        res.send({ success: true, logbook: student.logbook });
    })
);

router.get(
    "/student-details/:studentId/logbook",
    isAuthenticated,
    hasRole(LOGBOOK_ROLES),
    validateId("studentId"),
    asyncHandler(async (req, res) => {
        try {
            const student = await Student.findById(req.params.studentId);
            if (!student) {
                return res.status(404).send({ message: "Student not found." });
            }
            res.send({
                success: true,
                logbook: student.logbook || [],
                aplStatus: student.aplStatus,
                aplStatusHistory: student.aplStatusHistory,
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching student logbook details");
            res.status(500).send({ message: "Internal server error." });
        }
    })
);

export default router;
