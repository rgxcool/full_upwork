import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import express from "express";
import inertiaRoutes from "../../src/router/inactivityRoutes.js";
import studentDetailsRoutes from "../../src/router/studentDetailsRoutes.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import AssignmentSubmission from "../../src/models/AssignmentSubmission.js";
import Notification from "../../src/models/Notification.js";
import Conversation from "../../src/models/Conversation.js";
import Message from "../../src/models/Message.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const dayMs = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * dayMs);
const daysAhead = (days) => new Date(Date.now() + days * dayMs);

const buildAuthHeader = (role, userId = null, extra = {}) => {
    const token = jwt.sign(
        {
            userId: userId || new mongoose.Types.ObjectId().toString(),
            role,
            roles: [role],
            ...extra,
        },
        process.env.JWT_SECRET || "test-secret"
    );
    return { Authorization: `Bearer ${token}` };
};

// Standalone router mount: replicate the authenticateUser JWT decoding inline
// (it short-circuits when req.user is already set) so we never import the full
// app graph, which currently cannot boot in tests due to messagingRoutes.
const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const decoded = jwt.verify(
                    authHeader.split(" ")[1],
                    process.env.JWT_SECRET || "test-secret"
                );
                const roles = decoded.roles || (decoded.role ? [decoded.role] : []);
                req.user = { ...decoded, roles, role: decoded.role || roles[0] || null };
                req.userId = req.user.userId;
            } catch {
                // leave req.user unset → authenticateUser returns 401
            }
        }
        next();
    });
    app.use("/api/inactivity", inertiaRoutes);
    app.use("/api", studentDetailsRoutes);
    return app;
};

describe("Inactivity Report Routes Integration Tests", () => {
    let app;
    let studentA;
    let studentB;
    let course;
    let instance;

    beforeAll(async () => {
        await connectTestDatabase();
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
        app = buildApp();
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            User.deleteMany({}),
            Teacher.deleteMany({}),
            AssignmentSubmission.deleteMany({}),
            Notification.deleteMany({}),
            Conversation.deleteMany({}),
            Message.deleteMany({}),
        ]);

        course = await Course.create({
            courseName: "Matematik 1",
            courseCode: "MAT101",
        });

        instance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: daysAgo(60),
            endDate: daysAhead(60),
            courseName: course.courseName,
            courseCode: course.courseCode,
        });

        studentA = await Student.create({
            name: "Anna Svensson",
            personalNumber: "19950101-1234",
            email: "anna@elev.se",
            municipality: { type: "Sollentuna" },
        });

        studentB = await Student.create({
            name: "Erik Karlsson",
            personalNumber: "19960101-5678",
            email: "erik@elev.se",
        });

        await User.create({
            email: "anna@elev.se",
            password: "hashed-placeholder",
            roles: ["student"],
            lastLoginAt: daysAgo(6),
        });

        await User.create({
            email: "erik@elev.se",
            password: "hashed-placeholder",
            roles: ["student"],
            lastLoginAt: daysAgo(2),
        });

        await StudentEnrollment.create({
            studentId: studentA._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: daysAgo(40),
            endDate: daysAhead(20),
            status: "active",
        });

        await StudentEnrollment.create({
            studentId: studentB._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: daysAgo(40),
            endDate: daysAhead(20),
            status: "completed",
        });
    });

    describe("Access Control", () => {
        it("returns 401 for unauthenticated request", async () => {
            await request(app).get("/api/inactivity/report").expect(401);
        });

        it("returns 403 for student-role token", async () => {
            await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("student"))
                .expect(403);
        });

        it("allows admin tokens", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body).toHaveProperty("students");
            expect(res.body).toHaveProperty("summary");
            expect(res.body).toHaveProperty("thresholds");
        });

        it("allows teacher tokens", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("teacher"))
                .expect(200);

            expect(res.body).toHaveProperty("students");
        });
    });

    describe("Report content", () => {
        it("flags students who have not logged in for the withdraw threshold", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = res.body.students.find((s) => s.studentId === studentA._id.toString());
            expect(anna).toBeDefined();
            expect(anna.daysSinceLastLogin).toBe(6);
            expect(anna.mustWithdraw).toBe(true);
            expect(anna.level).toBe("withdraw");
            expect(anna.name).toBe("Anna Svensson");
            expect(anna.municipality).toBe("Sollentuna");
            expect(anna.enrollments[0].courseName).toBe("Matematik 1");
        });

        it("does not flag students whose enrollments are terminal", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const erik = res.body.students.find(
                (s) => s.studentId === studentB._id.toString()
            );
            expect(erik).toBeUndefined();
        });

        it("reports the warning flag from a stale submission", async () => {
            await User.updateOne(
                { email: "anna@elev.se" },
                { $set: { lastLoginAt: daysAgo(20) } }
            );
            await AssignmentSubmission.create({
                studentId: studentA._id,
                enrollmentId: (
                    await StudentEnrollment.findOne({ studentId: studentA._id }).lean()
                )._id,
                courseInstanceId: instance._id,
                moduleNumber: 1,
                submittedText: "Inlämning",
                submittedAt: daysAgo(20),
                feedback: { status: "", comment: "" },
            });

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = res.body.students.find((s) => s.studentId === studentA._id.toString());
            expect(anna).toBeDefined();
            expect(anna.daysSinceLastSubmission).toBe(20);
            expect(anna.inactiveForWarning).toBe(true);
            expect(anna.openSubmissions).toBe(1);
        });

        it("summarizes report counts", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body.summary.evaluated).toBe(1);
            expect(res.body.summary.mustWithdraw).toBe(1);
            expect(res.body.thresholds).toEqual({ withdrawDays: 5, warningDays: 14 });
        });
    });

    describe("Teacher scope", () => {
        it("only shows students on the teacher's own enrollments", async () => {
            const teacherUser = await User.create({
                email: "karin@larare.se",
                password: "hashed-placeholder",
                roles: ["teacher"],
            });
            const teacher = await Teacher.create({
                userId: teacherUser._id,
                subject: "Matematik",
            });

            const otherCourse = await Course.create({
                courseName: "Svenska 1",
                courseCode: "SVE101",
            });
            const otherInstance = await CourseInstance.create({
                mainCourseId: otherCourse._id,
                startDate: daysAgo(60),
                endDate: daysAhead(60),
                courseName: otherCourse.courseName,
                courseCode: otherCourse.courseCode,
            });
            const otherStudent = await Student.create({
                name: "Lisa Nilsson",
                personalNumber: "19970101-0001",
                email: "lisa@elev.se",
            });
            await User.create({
                email: "lisa@elev.se",
                password: "hashed-placeholder",
                roles: ["student"],
                lastLoginAt: daysAgo(30),
            });
            await StudentEnrollment.create({
                studentId: otherStudent._id,
                courseInstanceId: otherInstance._id,
                mainCourseId: otherCourse._id,
                startDate: daysAgo(40),
                endDate: daysAhead(20),
                status: "active",
                teacherId: teacher._id,
            });

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("teacher", teacherUser._id.toString()))
                .expect(200);

            const studentIds = res.body.students.map((s) => s.studentId);
            expect(studentIds).toEqual([otherStudent._id.toString()]);
            expect(studentIds).not.toContain(studentA._id.toString());

            const adminRes = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const adminIds = adminRes.body.students.map((s) => s.studentId);
            expect(adminIds).toContain(otherStudent._id.toString());
            expect(adminIds).toContain(studentA._id.toString());
        });

        it("returns an empty report when the teacher has no enrollments", async () => {
            const teacherUser = await User.create({
                email: "noenrollments@larare.se",
                password: "hashed-placeholder",
                roles: ["teacher"],
            });
            await Teacher.create({ userId: teacherUser._id, subject: "Matematik" });

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("teacher", teacherUser._id.toString()))
                .expect(200);

            expect(res.body.students).toEqual([]);
            expect(res.body.summary.evaluated).toBe(0);
        });
    });

    describe("Warning email action", () => {
        it("returns 401 for unauthenticated request", async () => {
            await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .expect(401);
        });

        it("returns 403 for student tokens", async () => {
            await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("student"))
                .expect(403);
        });

        it("returns 403 for teacher tokens (decision UI is admin-only)", async () => {
            await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("teacher"))
                .expect(403);
        });

        it("returns 404 for an unknown student", async () => {
            await request(app)
                .post(`/api/inactivity/${new mongoose.Types.ObjectId()}/warning-email`)
                .set(buildAuthHeader("admin"))
                .expect(404);
        });

        it("sends the warning email and records it for the report", async () => {
            const res = await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.warningSentAt).toBeTruthy();
            expect(res.body.withdrawalDate).toBeTruthy();

            const report = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = report.body.students.find(
                (s) => s.studentId === studentA._id.toString()
            );
            expect(anna).toBeDefined();
            expect(anna.warningSentAt).toBeTruthy();
            expect(anna.warnedWithdrawalDate).toBeTruthy();
        });
    });

    describe("Phase 4D — teacher discussion loop", () => {
        let teacherUser;
        let teacher;
        let adminUser;

        beforeEach(async () => {
            teacherUser = await User.create({
                email: "loop-larare@mindful.se",
                password: "hashed-placeholder",
                roles: ["teacher"],
            });
            teacher = await Teacher.create({
                userId: teacherUser._id,
                subject: "Matematik",
            });
            adminUser = await User.create({
                email: "loop-admin@mindful.se",
                password: "hashed-placeholder",
                roles: ["admin"],
            });
            await StudentEnrollment.updateOne(
                { studentId: studentA._id, status: "active" },
                { $set: { teacherId: teacher._id } }
            );
        });

        it("sending a warning email notifies the teacher and opens a discussion thread", async () => {
            const res = await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.conversationId).toBeTruthy();

            const notification = await Notification.findOne({
                type: "inactivity_action",
                teacher: teacher._id,
                "meta.studentId": studentA._id,
            }).lean();
            expect(notification).toBeTruthy();
            expect(notification.createdByAdmin.toString()).toBe(adminUser._id.toString());
            expect(notification.message).toContain("Varningsmail");

            const conversation = await Conversation.findById(res.body.conversationId).lean();
            expect(conversation).toBeTruthy();
            expect(conversation.studentId.toString()).toBe(studentA._id.toString());
            const participantIds = conversation.participants.map((p) => p.toString());
            expect(participantIds).toContain(teacherUser._id.toString());
            expect(participantIds).toContain(adminUser._id.toString());

            const firstMessage = await Message.findOne({ conversationId: conversation._id }).lean();
            expect(firstMessage).toBeTruthy();
            expect(firstMessage.senderId.toString()).toBe(adminUser._id.toString());
            expect(firstMessage.body).toContain("Senast inloggning: 6 dagar sedan");
            expect(firstMessage.body).toContain("Ska avslutas");
        });

        it("reuses an existing thread instead of duplicating it", async () => {
            const first = await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .expect(200);

            const second = await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .expect(200);

            expect(second.body.conversationId).toBe(first.body.conversationId);
            const count = await Conversation.countDocuments({
                studentId: studentA._id,
            });
            expect(count).toBe(1);
            expect(
                await Notification.countDocuments({ type: "inactivity_action" })
            ).toBe(1);
        });

        it("does not open a thread when no responsible teacher exists", async () => {
            await StudentEnrollment.updateOne(
                { studentId: studentA._id, status: "active" },
                { $unset: { teacherId: 1 } }
            );

            const res = await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.conversationId).toBeNull();
            expect(await Notification.countDocuments({ type: "inactivity_action" })).toBe(0);
            expect(await Conversation.countDocuments({ studentId: studentA._id })).toBe(0);
        });

        it("surfaces the responsible teacher and thread in the report", async () => {
            await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .expect(200);

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = res.body.students.find(
                (s) => s.studentId === studentA._id.toString()
            );
            expect(anna).toBeDefined();
            expect(anna.responsibleTeacher).toBe("loop-larare@mindful.se");
            expect(anna.conversationId).toBeTruthy();
        });

        it("creates a discussion thread when an admin withdraws the student", async () => {
            await Student.updateOne({ _id: studentA._id }, { $set: { teacherId: teacher._id } });

            const res = await request(app)
                .post(`/api/student-details/${studentA._id}/dropout`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.conversationId).toBeTruthy();

            const conversation = await Conversation.findById(res.body.conversationId).lean();
            const participantIds = conversation.participants.map((p) => p.toString());
            expect(participantIds).toContain(teacherUser._id.toString());
            expect(participantIds).toContain(adminUser._id.toString());

            const dropoutNotification = await Notification.findOne({
                type: "dropout",
                teacher: teacher._id,
                "meta.studentId": studentA._id,
            }).lean();
            expect(dropoutNotification).toBeTruthy();
        });
    });

    describe("Notification action (P0)", () => {
        let teacherUser;
        let teacher;
        let adminUser;

        const createInactivityNotification = async () => {
            const notification = await Notification.create({
                type: "inactivity_action",
                teacher: teacher._id,
                message: "Varningsmail om inaktivitet har skickats",
                meta: { studentId: studentA._id },
                createdByAdmin: adminUser._id,
            });
            return notification;
        };

        beforeEach(async () => {
            teacherUser = await User.create({
                email: "action-larare@mindful.se",
                password: "hashed-placeholder",
                roles: ["teacher"],
            });
            teacher = await Teacher.create({
                userId: teacherUser._id,
                subject: "Matematik",
            });
            adminUser = await User.create({
                email: "action-admin@mindful.se",
                password: "hashed-placeholder",
                roles: ["admin"],
            });
            await StudentEnrollment.updateOne(
                { studentId: studentA._id, status: "active" },
                { $set: { teacherId: teacher._id } }
            );
        });

        it("requires authentication", async () => {
            const notification = await createInactivityNotification();
            await request(app)
                .post(`/api/inactivity/notifications/${notification._id}/action`)
                .send({ action: "warning" })
                .expect(401);
        });

        it("rejects student tokens", async () => {
            const notification = await createInactivityNotification();
            await request(app)
                .post(`/api/inactivity/notifications/${notification._id}/action`)
                .set(buildAuthHeader("student"))
                .send({ action: "warning" })
                .expect(403);
        });

        it("rejects an invalid action", async () => {
            const notification = await createInactivityNotification();
            const res = await request(app)
                .post(`/api/inactivity/notifications/${notification._id}/action`)
                .set(buildAuthHeader("admin"))
                .send({ action: "spam" })
                .expect(400);
            expect(res.body.error).toContain("action");
        });

        it("returns 404 for an unknown notification", async () => {
            await request(app)
                .post(`/api/inactivity/notifications/${new mongoose.Types.ObjectId()}/action`)
                .set(buildAuthHeader("admin"))
                .send({ action: "warning" })
                .expect(404);
        });

        it("rejects notifications that are not inactivity notifications", async () => {
            const other = await Notification.create({
                type: "dropout",
                teacher: teacher._id,
                message: "hej",
                meta: { studentId: studentA._id },
                createdByAdmin: adminUser._id,
            });
            const res = await request(app)
                .post(`/api/inactivity/notifications/${other._id}/action`)
                .set(buildAuthHeader("admin"))
                .send({ action: "warning" })
                .expect(400);
            expect(res.body.error).toContain("inactivity");
        });

        it("sends a warning email and resolves the notification for the admin", async () => {
            const notification = await createInactivityNotification();

            const res = await request(app)
                .post(`/api/inactivity/notifications/${notification._id}/action`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .send({ action: "warning" })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.action).toBe("warning");
            expect(res.body.warning.warningSentAt).toBeTruthy();
            expect(res.body.warning.withdrawalDate).toBeTruthy();

            const reloaded = await Notification.findById(notification._id).lean();
            expect(reloaded.resolvedByUsers.map((u) => u.toString())).toContain(
                adminUser._id.toString()
            );

            const student = await Student.findById(studentA._id).lean();
            const warningEntry = student.changeHistory.find((e) =>
                e.changes.includes("inactivity_warning_email")
            );
            expect(warningEntry).toBeTruthy();
            expect(warningEntry.changedByRole).toBe("admin");
            expect(warningEntry.changedBy.toString()).toBe(adminUser._id.toString());
        });

        it("withdraws the student through the cascade and resolves the notification", async () => {
            const notification = await createInactivityNotification();

            const res = await request(app)
                .post(`/api/inactivity/notifications/${notification._id}/action`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .send({ action: "withdraw" })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.action).toBe("withdraw");

            const student = await Student.findById(studentA._id).lean();
            expect(student.dropout).toBe(true);

            const enrollments = await StudentEnrollment.find({ studentId: studentA._id }).lean();
            expect(enrollments.every((e) => e.status === "dropped")).toBe(true);

            const reloaded = await Notification.findById(notification._id).lean();
            expect(reloaded.resolvedByUsers.map((u) => u.toString())).toContain(
                adminUser._id.toString()
            );
        });
    });

    describe("Part 6 — review flow, tenant isolation, package cascade", () => {
        it("does not withdraw a stale login when the student has recent learning activity", async () => {
            await User.updateOne(
                { email: "anna@elev.se" },
                { $set: { lastLoginAt: daysAgo(20) } }
            );
            await Student.updateOne(
                { _id: studentA._id },
                { $set: { lastLearningActivityAt: daysAgo(2) } }
            );

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = res.body.students.find(
                (s) => s.studentId === studentA._id.toString()
            );
            expect(anna).toBeDefined();
            expect(anna.mustWithdraw).toBe(false);
            expect(anna.inactiveForWarning).toBe(false);
            expect(anna.level).toBe("ok");
            expect(anna.daysSinceLastLogin).toBe(20);
            expect(anna.daysWithoutLoginInEnrollment).toBe(20);
            expect(anna.daysSinceLastLearningActivity).toBe(2);
        });

        it("reports the learning-activity signal when it drives the inactivity window", async () => {
            await User.updateOne(
                { email: "anna@elev.se" },
                { $set: { lastLoginAt: daysAgo(10) } }
            );
            await Student.updateOne(
                { _id: studentA._id },
                { $set: { lastLearningActivityAt: daysAgo(6) } }
            );

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = res.body.students.find(
                (s) => s.studentId === studentA._id.toString()
            );
            expect(anna).toBeDefined();
            expect(anna.mustWithdraw).toBe(true);
            expect(anna.daysSinceLastLearningActivity).toBe(6);
            expect(anna.daysSinceLastLogin).toBe(10);
            expect(anna.activityBasis).toBeDefined();
        });

        it("scopes the report to the admin's municipality (tenant isolation)", async () => {
            const scopedAdmin = await User.create({
                email: "sollentuna-admin@mindful.se",
                password: "hashed-placeholder",
                roles: ["admin"],
                municipalities: ["Sollentuna"],
            });

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin", scopedAdmin._id.toString()))
                .expect(200);

            const ids = res.body.students.map((s) => s.studentId);
            expect(ids).toContain(studentA._id.toString());
            expect(ids).not.toContain(
                (
                    await Student.create({
                        name: "Täby Elev",
                        personalNumber: "19990101-9999",
                        email: "taby@elev.se",
                        municipality: { type: "Täby" },
                    })
                )._id.toString()
            );
        });

        it("blocks a scoped admin from acting on a student outside their municipality", async () => {
            const scopedAdmin = await User.create({
                email: "sollentuna-admin2@mindful.se",
                password: "hashed-placeholder",
                roles: ["admin"],
                municipalities: ["Sollentuna"],
            });

            await request(app)
                .post(`/api/inactivity/${studentB._id}/warning-email`)
                .set(buildAuthHeader("admin", scopedAdmin._id.toString()))
                .expect(403);
        });

        it("lets an admin resolve an inactivity_review notification with a warning email", async () => {
            const adminUser = await User.create({
                email: "review-admin@mindful.se",
                password: "hashed-placeholder",
                roles: ["admin"],
            });
            const review = await Notification.create({
                type: "inactivity_review",
                message: "Inaktivitetsgranskning krävs",
                meta: {
                    studentId: studentA._id,
                    studentName: "Anna Svensson",
                    courseNames: ["Matematik 1"],
                    url: "/admin/inactivity",
                },
                resolvedByUsers: [],
            });

            const res = await request(app)
                .post(`/api/inactivity/notifications/${review._id}/action`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .send({ action: "warning" })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.action).toBe("warning");

            const reloaded = await Notification.findById(review._id).lean();
            expect(reloaded.resolvedByUsers.map((u) => u.toString())).toContain(
                adminUser._id.toString()
            );

            const student = await Student.findById(studentA._id).lean();
            expect(
                student.changeHistory.some((e) =>
                    e.changes.includes("inactivity_warning_email")
                )
            ).toBe(true);
        });

        it("withdraws through the review notification and cascades the course package", async () => {
            const packageId = new mongoose.Types.ObjectId();
            await StudentEnrollment.create({
                studentId: studentA._id,
                courseInstanceId: instance._id,
                mainCourseId: course._id,
                coursePackageId: packageId,
                startDate: daysAgo(40),
                endDate: daysAhead(20),
                status: "active",
            });

            const adminUser = await User.create({
                email: "review-admin2@mindful.se",
                password: "hashed-placeholder",
                roles: ["admin"],
            });
            const review = await Notification.create({
                type: "inactivity_review",
                message: "Inaktivitetsgranskning krävs",
                meta: { studentId: studentA._id, studentName: "Anna Svensson", url: "/admin/inactivity" },
                resolvedByUsers: [],
            });

            const res = await request(app)
                .post(`/api/inactivity/notifications/${review._id}/action`)
                .set(buildAuthHeader("admin", adminUser._id.toString()))
                .send({ action: "withdraw" })
                .expect(200);

            expect(res.body.success).toBe(true);

            const student = await Student.findById(studentA._id).lean();
            expect(student.dropout).toBe(true);

            // Course package cascade: every non-terminal enrollment of the
            // package (and the standalone one) is dropped.
            const enrollments = await StudentEnrollment.find({ studentId: studentA._id }).lean();
            expect(enrollments.length).toBeGreaterThanOrEqual(2);
            expect(enrollments.every((e) => e.status === "dropped")).toBe(true);

            // Student is notified of the avbrott (meta.studentUserId channel).
            const studentNotif = await Notification.findOne({ type: "dropout" }).lean();
            expect(studentNotif).toBeTruthy();
            expect(studentNotif.meta && studentNotif.meta.studentUserId).toBeTruthy();
            expect(String(studentNotif.meta.studentId)).toBe(String(studentA._id));
            expect(studentNotif.meta.url).toBe("/");
        });
    });
});
