import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import express from "express";
import Course from "../../src/models/Course.js";
import CourseTemplate from "../../src/models/CourseTemplate.js";
import User from "../../src/models/User.js";
import courseTemplateRoutes from "../../src/router/courseTemplateRoutes.js";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const mockAuthenticateUser = vi.hoisted(() => (req, _res, next) => {
    const roleHeader = req.headers["x-test-role"];
    const userHeader = req.headers["x-test-userid"];
    const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;

    req.user = {
        role: role || "admin",
        roles: role ? [role] : ["admin"],
        userId: userId || "test-user",
        permissions: [],
    };
    req.userId = req.user.userId;
    next();
});

vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: mockAuthenticateUser,
}));

let app;

const createCourse = async (overrides = {}) =>
    Course.create({
        courseName: overrides.courseName ?? "Test Course",
        courseCode: overrides.courseCode ?? "TC101",
        coursePoints: overrides.coursePoints ?? "5",
        courseExtent: overrides.courseExtent ?? "10 weeks",
    });

describe("Course Template Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        app = express();
        app.use(express.json());
        app.use("/api", courseTemplateRoutes);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await CourseTemplate.deleteMany({});
        await Course.deleteMany({});
        await User.deleteMany({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /api/course-templates", () => {
        it("returns 403 for a role without template permissions", async () => {
            const response = await request(app)
                .get("/api/course-templates")
                .set("x-test-role", "student")
                .expect(403);

            expect(response.body.message).toContain("Forbidden");
        });

        it("lists templates for an admin and populates creator", async () => {
            const creator = await User.create({
                email: "anna@example.com",
                username: "Anna",
                password: "hashed-placeholder",
            });
            await CourseTemplate.create({
                templateName: "Demo Template",
                modules: [],
                createdBy: creator._id,
            });

            const response = await request(app)
                .get("/api/course-templates")
                .set("x-test-role", "admin")
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.templates).toHaveLength(1);
            expect(response.body.templates[0].templateName).toBe("Demo Template");
            expect(response.body.templates[0].createdBy?.username).toBe("Anna");
        });

        it("filters inactive templates by default", async () => {
            await CourseTemplate.create({ templateName: "Active", modules: [], isActive: true });
            await CourseTemplate.create({ templateName: "Inactive", modules: [], isActive: false });

            const response = await request(app)
                .get("/api/course-templates")
                .set("x-test-role", "admin")
                .expect(200);

            expect(response.body.templates).toHaveLength(1);
            expect(response.body.templates[0].templateName).toBe("Active");
        });
    });

    describe("POST /api/course-templates", () => {
        it("creates a template with the default 5-module structure", async () => {
            const course = await createCourse();

            const response = await request(app)
                .post("/api/course-templates")
                .set("x-test-role", "teacher")
                .send({ templateName: "New Template", courseId: String(course._id) })
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.template.templateName).toBe("New Template");
            expect(response.body.template.modules).toHaveLength(5);
            expect(response.body.template.modules[2].isPartialExam).toBe(true);
            expect(response.body.template.modules[4].isCaseStudy).toBe(true);
            expect(response.body.template.modules[0].sections).toHaveLength(2);
        });

        it("returns 400 when template name is missing", async () => {
            const response = await request(app)
                .post("/api/course-templates")
                .set("x-test-role", "teacher")
                .send({ courseId: "" })
                .expect(400);

            expect(response.body.error).toBe("Template name is required");
        });

        it("returns 404 when the linked course does not exist", async () => {
            const response = await request(app)
                .post("/api/course-templates")
                .set("x-test-role", "teacher")
                .send({
                    templateName: "Orphan",
                    courseId: String(new mongoose.Types.ObjectId()),
                })
                .expect(404);

            expect(response.body.error).toBe("Course not found");
        });
    });

    describe("POST /api/course-templates/:templateId/duplicate", () => {
        it("creates a deep copy of the template with a (kopia) suffix", async () => {
            const template = await CourseTemplate.create({
                templateName: "Grundmall",
                courseId: (await createCourse())._id,
                modules: [
                    {
                        moduleNumber: 1,
                        title: "Modul 1",
                        isPartialExam: true,
                        sections: [{ title: "A", description: "d", instructions: "i" }],
                        assignment: { title: "Uppgift", description: "Skriv" },
                    },
                    {
                        moduleNumber: 2,
                        title: "Modul 2",
                        isCaseStudy: true,
                        sections: [],
                    },
                ],
                createdBy: new mongoose.Types.ObjectId(),
            });

            const response = await request(app)
                .post(`/api/course-templates/${template._id}/duplicate`)
                .set("x-test-role", "teacher")
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.isDuplicate).toBe(true);
            expect(response.body.template.templateName).toBe("Grundmall (kopia)");
            expect(response.body.template.modules).toHaveLength(2);
            expect(response.body.template.modules[0].isPartialExam).toBe(true);
            expect(response.body.template.modules[1].isCaseStudy).toBe(true);
            expect(response.body.template.modules[0].sections).toHaveLength(1);
            expect(String(response.body.template.courseId)).toBe(String(template.courseId));
            expect(String(response.body.template._id)).not.toBe(String(template._id));

            const original = await CourseTemplate.findById(template._id);
            expect(original.templateName).toBe("Grundmall");
        });

        it("clones the default 5-module structure for a default template", async () => {
            const template = await CourseTemplate.create({
                templateName: "Default Mall",
                modules: [],
                createdBy: new mongoose.Types.ObjectId(),
            });

            const response = await request(app)
                .post(`/api/course-templates/${template._id}/duplicate`)
                .set("x-test-role", "admin")
                .expect(201);

            expect(response.body.template.modules).toHaveLength(5);
            expect(response.body.template.modules[2].isPartialExam).toBe(true);
            expect(response.body.template.modules[4].isCaseStudy).toBe(true);
        });

        it("returns 404 for a missing template", async () => {
            const response = await request(app)
                .post(`/api/course-templates/${new mongoose.Types.ObjectId()}/duplicate`)
                .set("x-test-role", "teacher")
                .expect(404);

            expect(response.body.error).toBe("Course template not found");
        });
    });

    describe("PUT /api/course-templates/:templateId", () => {
        it("updates the template", async () => {
            const template = await CourseTemplate.create({
                templateName: "Before",
                modules: [],
                createdBy: new mongoose.Types.ObjectId(),
            });

            const response = await request(app)
                .put(`/api/course-templates/${template._id}`)
                .set("x-test-role", "admin")
                .send({ templateName: "After", isActive: false })
                .expect(200);

            expect(response.body.template.templateName).toBe("After");
            expect(response.body.template.isActive).toBe(false);
        });

        it("returns 404 for a missing template", async () => {
            const response = await request(app)
                .put(`/api/course-templates/${new mongoose.Types.ObjectId()}`)
                .set("x-test-role", "admin")
                .send({ templateName: "Nope" })
                .expect(404);

            expect(response.body.error).toBe("Course template not found");
        });
    });

    describe("DELETE /api/course-templates/:templateId", () => {
        it("deletes the template", async () => {
            const template = await CourseTemplate.create({
                templateName: "To Delete",
                modules: [],
                createdBy: new mongoose.Types.ObjectId(),
            });

            const response = await request(app)
                .delete(`/api/course-templates/${template._id}`)
                .set("x-test-role", "admin")
                .expect(200);

            expect(response.body.success).toBe(true);

            const remaining = await CourseTemplate.findById(template._id);
            expect(remaining).toBeNull();
        });

        it("returns 404 for a missing template", async () => {
            const response = await request(app)
                .delete(`/api/course-templates/${new mongoose.Types.ObjectId()}`)
                .set("x-test-role", "admin")
                .expect(404);

            expect(response.body.error).toBe("Course template not found");
        });
    });
    // #31: templates saved from the builder (course code, no courseId) must be
    // linked so admission auto-applies them, and editing must not duplicate.
    describe("builder templates link to the course and update in place (#31)", () => {
        const builderPayload = (overrides = {}) => ({
            templateName: "Svenska 1 – Kursmall",
            title: "Svenska 1 – Kursmall",
            courseCode: "svesve01",
            modules: [{ moduleNumber: 1, title: "Modul 1", sections: [] }],
            content: { 1: { title: "Modul 1", isHiddenFromStudent: false } },
            isTemplate: true,
            ...overrides,
        });

        it("links a new template to the course with the same code (case-insensitive)", async () => {
            const course = await createCourse({ courseName: "Svenska 1", courseCode: "SVESVE01" });

            const res = await request(app).post("/api/course-templates").send(builderPayload()).expect(201);
            expect(String(res.body.template.courseId)).toBe(String(course._id));

            // Admission uses this lookup when it creates a kurskort.
            const resolved = await CourseMatchingService.resolveCourseTemplate(course._id);
            expect(String(resolved._id)).toBe(String(res.body.template._id));
        });

        it("leaves the template unlinked for an unknown or ambiguous code", async () => {
            await createCourse({ courseName: "A", courseCode: "DUP01" });
            await createCourse({ courseName: "B", courseCode: "dup01" });

            const unknown = await request(app)
                .post("/api/course-templates")
                .send(builderPayload({ courseCode: "FINNSINTE" }))
                .expect(201);
            expect(unknown.body.template.courseId).toBeUndefined();

            const ambiguous = await request(app)
                .post("/api/course-templates")
                .send(builderPayload({ courseCode: "DUP01" }))
                .expect(201);
            expect(ambiguous.body.template.courseId).toBeUndefined();
        });

        it("updating a loaded template keeps one template and links it if it was unlinked", async () => {
            const created = await request(app)
                .post("/api/course-templates")
                .send(builderPayload({ courseCode: "SVESVE01" }))
                .expect(201);
            expect(created.body.template.courseId).toBeUndefined();

            const course = await createCourse({ courseName: "Svenska 1", courseCode: "SVESVE01" });
            const id = created.body.template._id;
            await request(app)
                .put(`/api/course-templates/${id}`)
                .send(builderPayload({ modules: [{ moduleNumber: 1, title: "Modul 1 (ändrad)" }] }))
                .expect(200);

            expect(await CourseTemplate.countDocuments({})).toBe(1);
            const saved = await CourseTemplate.findById(id).lean();
            expect(saved.modules[0].title).toBe("Modul 1 (ändrad)");
            expect(String(saved.courseId)).toBe(String(course._id));
        });

        it("never overrides an existing explicit course link on update", async () => {
            const explicit = await createCourse({ courseName: "Explicit", courseCode: "EXP01" });
            await createCourse({ courseName: "Svenska 1", courseCode: "SVESVE01" });
            const created = await request(app)
                .post("/api/course-templates")
                .send(builderPayload({ courseId: String(explicit._id) }))
                .expect(201);

            await request(app)
                .put(`/api/course-templates/${created.body.template._id}`)
                .send(builderPayload())
                .expect(200);
            const saved = await CourseTemplate.findById(created.body.template._id).lean();
            expect(String(saved.courseId)).toBe(String(explicit._id));
        });
    });
});
