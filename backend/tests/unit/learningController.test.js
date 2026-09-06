import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
    const studentEnrollment = vi.fn(function (doc) {
        Object.assign(this, doc);
        this.save = vi.fn().mockResolvedValue(this);
    });
    studentEnrollment.find = vi.fn();
    studentEnrollment.findOne = vi.fn();
    studentEnrollment.findById = vi.fn();
    return { studentEnrollment };
});

vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: { findOne: vi.fn(), findById: vi.fn() },
}));
vi.mock("../../src/models/Teacher.js", () => ({
    __esModule: true,
    default: { findOne: vi.fn() },
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: { find: vi.fn(), findById: vi.fn() },
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: h.studentEnrollment,
}));
vi.mock("../../src/models/AssignmentSubmission.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findById: vi.fn(),
        findOne: vi.fn(),
        findOneAndUpdate: vi.fn(),
    },
}));
vi.mock("../../src/models/User.js", () => ({
    __esModule: true,
    default: { findById: vi.fn() },
}));

import Student from "../../src/models/Student.js";
import Teacher from "../../src/models/Teacher.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import AssignmentSubmission from "../../src/models/AssignmentSubmission.js";
import User from "../../src/models/User.js";
import {
    getInstanceModules,
    getInstanceSubmissions,
    getPendingSubmissions,
    setSubmissionFeedback,
    submitAssignment,
    getCourseInstanceReport,
    getCourseInstanceParticipants,
    addCourseInstanceParticipant,
    removeCourseInstanceParticipant,
    getStudentLastAccess,
    getCourseInstanceReports,
    getSubmissionComments,
    addSubmissionComment,
} from "../../src/controllers/learningController.js";

const STUDENT_ID = "111111111111111111111111";
const ENROLLMENT_ID = "222222222222222222222222";
const INSTANCE_ID = "333333333333333333333333";
const SUBMISSION_ID = "444444444444444444444444";
const TEACHER_ID = "555555555555555555555555";
const USER_ID = "666666666666666666666666";

// Makes a mongoose-style chainable query resolve to `data` when awaited.
const chainable = (data) => {
    const chain = {
        populate: () => chain,
        select: () => chain,
        sort: () => chain,
        lean: () => chain,
        then: (resolve) => resolve(data),
    };
    return chain;
};

const makeRes = () => {
    const res = { json: vi.fn(), status: vi.fn(() => res) };
    return res;
};

const reqFor = (overrides = {}) => ({
    params: {},
    query: {},
    body: {},
    user: { userId: USER_ID, email: "student@mindful.se", roles: ["student"], role: "student" },
    ...overrides,
});

describe("learningController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    const moduleWithAssignment = {
        moduleNumber: 1,
        title: "Modul 1",
        sections: [{ title: "S1", description: "d", instructions: "Läs." }],
        assignment: { title: "Inlämning", description: "Skriv." },
    };
    const moduleWithoutAssignment = {
        moduleNumber: 2,
        title: "Modul 2",
        sections: [{ title: "S1" }],
    };
    const instance = {
        _id: INSTANCE_ID,
        courseName: "Svenska 1",
        courseCode: "SVASVE01",
        responsibleTeacher: TEACHER_ID,
        assistantTeacher: null,
        modules: [moduleWithAssignment, moduleWithoutAssignment],
    };
    const enrollment = {
        _id: ENROLLMENT_ID,
        studentId: STUDENT_ID,
        courseInstanceId: INSTANCE_ID,
        status: "active",
    };
    const teacher = { _id: TEACHER_ID, name: "Eva" };

    describe("getInstanceModules", () => {
        it("returns modules + the student's own submissions for an enrolled student", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);
            AssignmentSubmission.find.mockReturnValue(
                chainable([
                    {
                        moduleNumber: 1,
                        submittedText: "svar",
                        feedback: { status: "godkänd", comment: "Bra" },
                        toObject: () => ({
                            moduleNumber: 1,
                            submittedText: "svar",
                            feedback: { status: "godkänd", comment: "Bra" },
                        }),
                    },
                ])
            );

            const req = reqFor({ params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(CourseInstance.findById).toHaveBeenCalledWith(INSTANCE_ID);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    instance: { _id: INSTANCE_ID, courseName: "Svenska 1", courseCode: "SVASVE01" },
                    modules: [moduleWithAssignment, moduleWithoutAssignment],
                    enrollmentId: ENROLLMENT_ID,
                })
            );
            const payload = res.json.mock.calls[0][0];
            expect(payload.submissions[1]).toMatchObject({ submittedText: "svar" });
        });

        it("forbids a student who is not enrolled", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(null);
            CourseInstance.findById.mockResolvedValue(instance);

            const req = reqFor({ params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: "Du är inte inskriven på den här kursen" });
        });

        it("allows a teacher who owns the instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
            });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, modules: [moduleWithAssignment, moduleWithoutAssignment] })
            );
        });

        it("forbids a teacher who does not own the instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue({ ...instance, responsibleTeacher: "999999999999999999999999" });

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
            });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: "Du ansvarar inte för den här kursen" });
        });

        it("returns 404 when the instance does not exist", async () => {
            CourseInstance.findById.mockResolvedValue(null);

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                user: { userId: USER_ID, roles: ["admin"], role: "admin" },
            });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: "Course instance not found" });
        });
    });

    describe("submitAssignment", () => {
        it("creates a submission for an enrolled student with text", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);
            const saved = { _id: SUBMISSION_ID, moduleNumber: 1, submittedText: "svar" };
            AssignmentSubmission.findOneAndUpdate.mockResolvedValue(saved);

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "1" }, body: { submittedText: "svar" } });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(AssignmentSubmission.findOneAndUpdate).toHaveBeenCalledWith(
                { studentId: STUDENT_ID, enrollmentId: ENROLLMENT_ID, moduleNumber: 1 },
                expect.objectContaining({
                    $set: expect.objectContaining({ courseInstanceId: INSTANCE_ID, submittedText: "svar" }),
                }),
                expect.objectContaining({ upsert: true, new: true })
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({ success: true, submission: saved });
        });

        it("clears previous feedback on resubmission", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);
            AssignmentSubmission.findOneAndUpdate.mockResolvedValue({ _id: SUBMISSION_ID });

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "1" }, body: { submittedText: "ny version" } });
            const res = makeRes();
            await submitAssignment(req, res);

            const updateCall = AssignmentSubmission.findOneAndUpdate.mock.calls[0][1];
            expect(updateCall.$set.feedback).toEqual({ comment: "", status: "", by: null, at: null });
        });

        it("rejects empty text and no file", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "1" }, body: {} });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Ange en text eller ladda upp en fil" });
        });

        it("rejects a module without an assignment", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "2" }, body: { submittedText: "svar" } });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Den här modulen har ingen inlämningsuppgift" });
        });

        it("forbids non-students", async () => {
            const req = reqFor({ user: { userId: USER_ID, roles: ["teacher"], role: "teacher" }, params: { instanceId: INSTANCE_ID, moduleNumber: "1" } });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: "Only students can submit assignments" });
        });
    });

    describe("getInstanceSubmissions", () => {
        it("returns submissions for the owning teacher", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);
            const submissions = [{ _id: SUBMISSION_ID, moduleNumber: 1 }];
            AssignmentSubmission.find.mockReturnValue(chainable(submissions));

            const req = reqFor({ user: { userId: USER_ID, roles: ["teacher"], role: "teacher" }, params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceSubmissions(req, res);

            expect(res.json).toHaveBeenCalledWith({ success: true, submissions });
        });

        it("forbids a teacher who does not own the instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue({ ...instance, responsibleTeacher: "999999999999999999999999" });

            const req = reqFor({ user: { userId: USER_ID, roles: ["teacher"], role: "teacher" }, params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceSubmissions(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("lets staff see submissions of any instance", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            const submissions = [{ _id: SUBMISSION_ID, moduleNumber: 1 }];
            AssignmentSubmission.find.mockReturnValue(chainable(submissions));

            const req = reqFor({ user: { userId: USER_ID, roles: ["admin"], role: "admin" }, params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceSubmissions(req, res);

            expect(Teacher.findOne).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ success: true, submissions });
        });
    });

    describe("setSubmissionFeedback", () => {
        it("sets godkänd feedback", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);
            const submission = {
                _id: SUBMISSION_ID,
                courseInstanceId: INSTANCE_ID,
                feedback: {},
                save: vi.fn().mockResolvedValue(true),
            };
            AssignmentSubmission.findById.mockResolvedValue(submission);

            const req = reqFor({
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
                params: { submissionId: SUBMISSION_ID },
                body: { comment: "Bra jobbat!", status: "godkänd" },
            });
            const res = makeRes();
            await setSubmissionFeedback(req, res);

            expect(submission.feedback).toMatchObject({ comment: "Bra jobbat!", status: "godkänd", by: USER_ID });
            expect(submission.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ success: true, submission });
        });

        it("rejects an invalid status", async () => {
            const req = reqFor({ params: { submissionId: SUBMISSION_ID }, body: { status: "underkänd" } });
            const res = makeRes();
            await setSubmissionFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Status måste vara godkänd eller komplettera" });
        });

        it("forbids a teacher who does not own the submission's instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue({ ...instance, responsibleTeacher: "999999999999999999999999" });
            AssignmentSubmission.findById.mockResolvedValue({ _id: SUBMISSION_ID, courseInstanceId: INSTANCE_ID, feedback: {} });

            const req = reqFor({
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
                params: { submissionId: SUBMISSION_ID },
                body: { comment: "Komplettera", status: "komplettera" },
            });
            const res = makeRes();
            await setSubmissionFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe("getPendingSubmissions", () => {
        it("scopes to the teacher's own instances", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            const owned = [{ _id: INSTANCE_ID }];
            CourseInstance.find.mockReturnValue(chainable(owned));
            const submissions = [{ _id: SUBMISSION_ID, moduleNumber: 1 }];
            AssignmentSubmission.find.mockReturnValue(chainable(submissions));

            const req = reqFor({ user: { userId: USER_ID, roles: ["teacher"], role: "teacher" } });
            const res = makeRes();
            await getPendingSubmissions(req, res);

            const query = AssignmentSubmission.find.mock.calls[0][0];
            expect(query["feedback.status"]).toBe("");
            expect(query.courseInstanceId).toEqual({ $in: [INSTANCE_ID] });
            expect(res.json).toHaveBeenCalledWith({ success: true, submissions });
        });

        it("returns all pending submissions for staff", async () => {
            const submissions = [{ _id: SUBMISSION_ID }];
            AssignmentSubmission.find.mockReturnValue(chainable(submissions));

            const req = reqFor({ user: { userId: USER_ID, roles: ["admin"], role: "admin" } });
            const res = makeRes();
            await getPendingSubmissions(req, res);

            expect(Teacher.findOne).not.toHaveBeenCalled();
            expect(AssignmentSubmission.find.mock.calls[0][0]).toEqual({ "feedback.status": "" });
            expect(res.json).toHaveBeenCalledWith({ success: true, submissions });
        });
    });

    describe("completedComponents tracking", () => {
        it("resets module completion on resubmission", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            const completedComponents = { set: vi.fn() };
            const enrollmentWithTracking = {
                _id: ENROLLMENT_ID,
                studentId: STUDENT_ID,
                courseInstanceId: INSTANCE_ID,
                status: "active",
                completedComponents,
                skipNotification: false,
                save: vi.fn().mockResolvedValue(true),
            };
            StudentEnrollment.findOne.mockResolvedValue(enrollmentWithTracking);
            CourseInstance.findById.mockResolvedValue(instance);
            AssignmentSubmission.findOneAndUpdate.mockResolvedValue({ _id: SUBMISSION_ID });

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "1" }, body: { submittedText: "igen" } });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(completedComponents.set).toHaveBeenCalledWith("1", "✗");
            expect(enrollmentWithTracking.skipNotification).toBe(true);
            expect(enrollmentWithTracking.save).toHaveBeenCalled();
        });

        it("marks a godkänd module complete on feedback", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);
            const completedComponents = { set: vi.fn(), get: vi.fn() };
            StudentEnrollment.findById.mockResolvedValue({
                _id: ENROLLMENT_ID,
                completedComponents,
                skipNotification: false,
                save: vi.fn().mockResolvedValue(true),
            });
            const submission = {
                _id: SUBMISSION_ID,
                courseInstanceId: INSTANCE_ID,
                enrollmentId: ENROLLMENT_ID,
                moduleNumber: 1,
                feedback: {},
                save: vi.fn().mockResolvedValue(true),
            };
            AssignmentSubmission.findById.mockResolvedValue(submission);

            const req = reqFor({
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
                params: { submissionId: SUBMISSION_ID },
                body: { comment: "Bra!", status: "godkänd" },
            });
            const res = makeRes();
            await setSubmissionFeedback(req, res);

            expect(StudentEnrollment.findById).toHaveBeenCalledWith(ENROLLMENT_ID);
            expect(completedComponents.set).toHaveBeenCalledWith("1", "✓");
            expect(submission.feedback.status).toBe("godkänd");
        });

        it("marks a komplettera module as needing revision", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);
            const completedComponents = { set: vi.fn() };
            StudentEnrollment.findById.mockResolvedValue({
                _id: ENROLLMENT_ID,
                completedComponents,
                skipNotification: false,
                save: vi.fn().mockResolvedValue(true),
            });
            const submission = {
                _id: SUBMISSION_ID,
                courseInstanceId: INSTANCE_ID,
                enrollmentId: ENROLLMENT_ID,
                moduleNumber: 2,
                feedback: {},
                save: vi.fn().mockResolvedValue(true),
            };
            AssignmentSubmission.findById.mockResolvedValue(submission);

            const req = reqFor({
                user: { userId: USER_ID, roles: ["admin"], role: "admin" },
                params: { submissionId: SUBMISSION_ID },
                body: { comment: "Komplettera", status: "komplettera" },
            });
            const res = makeRes();
            await setSubmissionFeedback(req, res);

            expect(completedComponents.set).toHaveBeenCalledWith("2", "✗");
            expect(res.json).toHaveBeenCalledWith({ success: true, submission });
        });

        it("returns 404 when the submission is missing", async () => {
            AssignmentSubmission.findById.mockResolvedValue(null);
            const req = reqFor({
                user: { userId: USER_ID, roles: ["admin"], role: "admin" },
                params: { submissionId: SUBMISSION_ID },
                body: { status: "godkänd" },
            });
            const res = makeRes();
            await setSubmissionFeedback(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe("getCourseInstanceReport", () => {
        const reportInstance = {
            _id: INSTANCE_ID,
            courseName: "Svenska 1",
            modules: [
                { moduleNumber: 1, title: "Modul 1", isPartialExam: false, isCaseStudy: false },
                { moduleNumber: 2, title: "Modul 2", isPartialExam: true, isCaseStudy: true },
            ],
            sectionDates: [new Date("2026-09-21"), new Date("2026-10-05")],
        };

        beforeEach(() => {
            CourseInstance.findById.mockResolvedValue(reportInstance);
            Student.findById.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue({
                _id: ENROLLMENT_ID,
                studentId: STUDENT_ID,
                completedComponents: new Map([
                    ["1", "✓"],
                    ["2", "✗"],
                ]),
                students: [],
            });
            AssignmentSubmission.find.mockReturnValue(
                chainable([
                    {
                        moduleNumber: 1,
                        submittedText: "svar",
                        fileId: null,
                        submittedAt: new Date("2026-09-22"),
                        feedback: { status: "godkänd", comment: "Bra" },
                    },
                ])
            );
        });

        it("returns a full per-student completion report", async () => {
            User.findById.mockReturnValue({
                select: vi.fn().mockResolvedValue({ lastLoginAt: new Date("2026-09-20") }),
            });

            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getCourseInstanceReport(req, res);

            const payload = res.json.mock.calls[0][0];
            expect(payload.success).toBe(true);
            expect(payload.totalModules).toBe(2);
            expect(payload.completedModules).toBe(1);
            expect(payload.completionRate).toBe("50.0");
            expect(payload.modules[0].completed).toBe(true);
            expect(payload.assignmentStatus[1].status).toBe("godkänd");
            expect(payload.scheduledDates).toHaveLength(2);
            expect(payload.studentActivity.lastAccess).toBeInstanceOf(Date);
        });

        it("returns 400 for invalid ids", async () => {
            const req = reqFor({ params: { instanceId: "bad", studentId: STUDENT_ID } });
            const res = makeRes();
            await getCourseInstanceReport(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when the instance is missing", async () => {
            CourseInstance.findById.mockResolvedValue(null);
            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getCourseInstanceReport(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("returns 404 when the student is missing", async () => {
            Student.findById.mockResolvedValue(null);
            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getCourseInstanceReport(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("handles a student without enrollment or activity", async () => {
            StudentEnrollment.findOne.mockResolvedValue(null);
            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
            AssignmentSubmission.findOne.mockReturnValue(chainable(null));

            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getCourseInstanceReport(req, res);

            const payload = res.json.mock.calls[0][0];
            expect(payload.totalModules).toBe(0);
            expect(payload.completedModules).toBe(0);
            expect(payload.completionRate).toBe(0);
            expect(payload.studentActivity.lastAccess).toBeNull();
        });

        it("falls back to the latest submission for activity", async () => {
            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
            AssignmentSubmission.findOne.mockReturnValue(
                chainable({ submittedAt: new Date("2026-09-19") })
            );

            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getCourseInstanceReport(req, res);

            const payload = res.json.mock.calls[0][0];
            expect(payload.studentActivity.lastAccess).toBeInstanceOf(Date);
        });
    });

    describe("getCourseInstanceParticipants", () => {
        it("returns participants from enrollments", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            StudentEnrollment.find.mockReturnValue(
                chainable([
                    {
                        _id: ENROLLMENT_ID,
                        studentId: { _id: STUDENT_ID, name: "Anna", email: "anna@x.se" },
                        status: "active",
                    },
                ])
            );

            const req = reqFor({ params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getCourseInstanceParticipants(req, res);

            const payload = res.json.mock.calls[0][0];
            expect(payload.success).toBe(true);
            expect(payload.participants).toEqual([
                {
                    participantId: STUDENT_ID,
                    name: "Anna",
                    email: "anna@x.se",
                    role: "student",
                    status: "active",
                },
            ]);
        });

        it("returns 400 for invalid input", async () => {
            const req = reqFor({ params: { instanceId: "bad" } });
            const res = makeRes();
            await getCourseInstanceParticipants(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when the instance is missing", async () => {
            CourseInstance.findById.mockResolvedValue(null);
            const req = reqFor({ params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getCourseInstanceParticipants(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe("addCourseInstanceParticipant", () => {
        const body = { participantId: STUDENT_ID, role: "student" };

        it("lets an admin add a participant", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            StudentEnrollment.findOne.mockReturnValue(chainable(null));

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                body,
                user: { userId: USER_ID, roles: ["admin"] },
            });
            const res = makeRes();
            await addCourseInstanceParticipant(req, res);

            const payload = res.json.mock.calls[0][0];
            expect(payload.success).toBe(true);
            expect(payload.enrollment.studentId).toBe(STUDENT_ID);
            expect(h.studentEnrollment).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it("lets a teacher add a student to an owned course", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            StudentEnrollment.findOne.mockReturnValue(chainable(null));

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                body,
                user: { userId: TEACHER_ID, role: "teacher" },
            });
            const res = makeRes();
            await addCourseInstanceParticipant(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it("returns 400 when participantId or role is missing", async () => {
            const req = reqFor({ params: { instanceId: INSTANCE_ID }, body: {} });
            const res = makeRes();
            await addCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 400 for an invalid participantId", async () => {
            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                body: { participantId: "junk", role: "student" },
            });
            const res = makeRes();
            await addCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when the instance is missing", async () => {
            CourseInstance.findById.mockResolvedValue(null);
            const req = reqFor({ params: { instanceId: INSTANCE_ID }, body });
            const res = makeRes();
            await addCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("forbids callers without permission", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                body,
                user: { userId: USER_ID, roles: ["student"], role: "student" },
            });
            const res = makeRes();
            await addCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("returns 409 when the student is already enrolled", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            StudentEnrollment.findOne.mockReturnValue(chainable({ _id: ENROLLMENT_ID }));

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                body,
                user: { userId: USER_ID, roles: ["admin"], role: "admin" },
            });
            const res = makeRes();
            await addCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(409);
        });
    });

    describe("removeCourseInstanceParticipant", () => {
        it("removes a participant as admin", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            const enrollment = {
                _id: ENROLLMENT_ID,
                status: "enrolled",
                save: vi.fn().mockResolvedValue(true),
            };
            StudentEnrollment.findOne.mockResolvedValue(enrollment);

            const req = reqFor({
                params: { instanceId: INSTANCE_ID, participantId: STUDENT_ID },
                user: { userId: USER_ID, roles: ["systemadmin"] },
            });
            const res = makeRes();
            await removeCourseInstanceParticipant(req, res);

            expect(enrollment.status).toBe("withdrawn");
            expect(enrollment.dropoutDate).toBeInstanceOf(Date);
            expect(enrollment.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: "Deltagare har tagits bort från kursen",
            });
        });

        it("returns 400 for invalid ids", async () => {
            const req = reqFor({ params: { instanceId: "bad", participantId: STUDENT_ID } });
            const res = makeRes();
            await removeCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when the instance is missing", async () => {
            CourseInstance.findById.mockResolvedValue(null);
            const req = reqFor({ params: { instanceId: INSTANCE_ID, participantId: STUDENT_ID } });
            const res = makeRes();
            await removeCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("forbids callers without permission", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            const req = reqFor({
                params: { instanceId: INSTANCE_ID, participantId: STUDENT_ID },
                user: { userId: USER_ID, roles: ["student"], role: "student" },
            });
            const res = makeRes();
            await removeCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("returns 404 when the enrollment is missing", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            StudentEnrollment.findOne.mockResolvedValue(null);
            const req = reqFor({
                params: { instanceId: INSTANCE_ID, participantId: STUDENT_ID },
                user: { userId: USER_ID, roles: ["admin"] },
            });
            const res = makeRes();
            await removeCourseInstanceParticipant(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe("getStudentLastAccess", () => {
        beforeEach(() => {
            CourseInstance.findById.mockResolvedValue(instance);
            Student.findById.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
        });

        it("returns last login and submission", async () => {
            User.findById.mockReturnValue({
                select: vi.fn().mockResolvedValue({ lastLoginAt: new Date("2026-09-01") }),
            });
            AssignmentSubmission.findOne.mockReturnValue(
                chainable({ submittedAt: new Date("2026-09-10") })
            );

            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getStudentLastAccess(req, res);

            const payload = res.json.mock.calls[0][0];
            expect(payload.lastLogin).toBeInstanceOf(Date);
            expect(payload.lastSubmission).toBeInstanceOf(Date);
        });

        it("returns nulls when there is no activity", async () => {
            User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
            AssignmentSubmission.findOne.mockReturnValue(chainable(null));

            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getStudentLastAccess(req, res);

            const payload = res.json.mock.calls[0][0];
            expect(payload.lastLogin).toBeNull();
            expect(payload.lastSubmission).toBeNull();
        });

        it("returns 400 for invalid ids", async () => {
            const req = reqFor({ params: { instanceId: "bad", studentId: STUDENT_ID } });
            const res = makeRes();
            await getStudentLastAccess(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when the instance is missing", async () => {
            CourseInstance.findById.mockResolvedValue(null);
            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getStudentLastAccess(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("returns 404 when the student is missing", async () => {
            Student.findById.mockResolvedValue(null);
            const req = reqFor({ params: { instanceId: INSTANCE_ID, studentId: STUDENT_ID } });
            const res = makeRes();
            await getStudentLastAccess(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe("getCourseInstanceReports", () => {
        it("computes enrollment completion metrics", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            StudentEnrollment.find.mockReturnValue(
                chainable([
                    {
                        _id: ENROLLMENT_ID,
                        completedAt: new Date("2026-10-01"),
                        completedComponents: { 1: "✓", 2: "✓", 3: "✗" },
                    },
                    { _id: "x2", completedAt: null, completedComponents: { 1: "✓" } },
                ])
            );

            const req = reqFor({ params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getCourseInstanceReports(req, res);

            const payload = res.json.mock.calls[0][0];
            expect(payload.totalEnrollments).toBe(2);
            expect(payload.totalCompletedStudents).toBe(1);
            expect(payload.totalCompletedModules).toBe(3);
            expect(payload.overallCompletionRate).toBe("50.0");
        });

        it("returns 400 for invalid input", async () => {
            const req = reqFor({ params: { instanceId: "bad" } });
            const res = makeRes();
            await getCourseInstanceReports(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when the instance is missing", async () => {
            CourseInstance.findById.mockResolvedValue(null);
            const req = reqFor({ params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getCourseInstanceReports(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe("getSubmissionComments", () => {
        const submission = { _id: SUBMISSION_ID, studentId: STUDENT_ID, comments: [{ id: "c1" }] };

        beforeEach(() => {
            AssignmentSubmission.findById.mockResolvedValue(submission);
        });

        it("returns comments for a teacher", async () => {
            const req = reqFor({
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
                params: { submissionId: SUBMISSION_ID },
            });
            const res = makeRes();
            await getSubmissionComments(req, res);
            expect(res.json).toHaveBeenCalledWith({ success: true, comments: [{ id: "c1" }] });
        });

        it("lets a student read their own submission comments", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            const req = reqFor({ params: { submissionId: SUBMISSION_ID } });
            const res = makeRes();
            await getSubmissionComments(req, res);
            expect(res.json).toHaveBeenCalledWith({ success: true, comments: [{ id: "c1" }] });
        });

        it("forbids a student reading someone else's comments", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            AssignmentSubmission.findById.mockResolvedValue({
                ...submission,
                studentId: "999999999999999999999999",
            });
            const req = reqFor({ params: { submissionId: SUBMISSION_ID } });
            const res = makeRes();
            await getSubmissionComments(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("returns 400 for invalid input", async () => {
            const req = reqFor({ params: { submissionId: "bad" } });
            const res = makeRes();
            await getSubmissionComments(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when the submission is missing", async () => {
            AssignmentSubmission.findById.mockResolvedValue(null);
            const req = reqFor({ params: { submissionId: SUBMISSION_ID } });
            const res = makeRes();
            await getSubmissionComments(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe("addSubmissionComment", () => {
        let submission;

        beforeEach(() => {
            submission = {
                _id: SUBMISSION_ID,
                studentId: STUDENT_ID,
                courseInstanceId: INSTANCE_ID,
                comments: [],
                save: vi.fn().mockResolvedValue(true),
            };
            AssignmentSubmission.findById.mockResolvedValue(submission);
        });

        it("adds a top-level comment for the owning student", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            const req = reqFor({
                params: { submissionId: SUBMISSION_ID },
                body: { text: "Tack för feedbacken!" },
            });
            const res = makeRes();
            await addSubmissionComment(req, res);

            expect(submission.comments).toHaveLength(1);
            expect(submission.comments[0].text).toBe("Tack för feedbacken!");
            expect(submission.comments[0].parentCommentId).toBeNull();
            expect(submission.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                comments: submission.comments,
            });
        });

        it("adds a reply for the owning teacher", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);
            const req = reqFor({
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
                params: { submissionId: SUBMISSION_ID },
                body: { text: "Bra ", parentCommentId: "507f1f77bcf86cd799439011" },
            });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(submission.comments).toHaveLength(1);
            expect(submission.comments[0].parentCommentId).toBe("507f1f77bcf86cd799439011");
        });

        it("returns 400 for invalid input", async () => {
            const req = reqFor({ params: { submissionId: "bad" }, body: { text: "hej" } });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 400 when text is empty", async () => {
            const req = reqFor({ params: { submissionId: SUBMISSION_ID }, body: { text: " " } });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 400 for an invalid parentCommentId", async () => {
            const req = reqFor({
                params: { submissionId: SUBMISSION_ID },
                body: { text: "hej", parentCommentId: "junk" },
            });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when the submission is missing", async () => {
            AssignmentSubmission.findById.mockResolvedValue(null);
            const req = reqFor({
                params: { submissionId: SUBMISSION_ID },
                body: { text: "hej" },
            });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("forbids callers with no recognized role", async () => {
            const req = reqFor({
                user: { userId: USER_ID, roles: ["mentor"] },
                params: { submissionId: SUBMISSION_ID },
                body: { text: "hej" },
            });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("forbids a teacher who does not own the instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue({
                ...instance,
                responsibleTeacher: "999999999999999999999999",
            });
            const req = reqFor({
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
                params: { submissionId: SUBMISSION_ID },
                body: { text: "hej" },
            });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("forbids a student commenting on someone else's submission", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            AssignmentSubmission.findById.mockResolvedValue({
                ...submission,
                studentId: "999999999999999999999999",
            });
            const req = reqFor({
                params: { submissionId: SUBMISSION_ID },
                body: { text: "hej" },
            });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("returns 403 when the student profile is missing", async () => {
            Student.findOne.mockResolvedValue(null);
            const req = reqFor({
                params: { submissionId: SUBMISSION_ID },
                body: { text: "hej" },
            });
            const res = makeRes();
            await addSubmissionComment(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });
});
