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
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import Teacher from "../../src/models/Teacher.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Program from "../../src/models/Program.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import searchRoutes from "../../src/router/searchRoutes.js";
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
    };
    req.userId = req.user.userId;
    next();
});

vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: mockAuthenticateUser,
}));

let searchApp;

describe("Search Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        searchApp = express();
        searchApp.use(express.json());
        searchApp.use("/api", searchRoutes);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            User.deleteMany({}),
            Student.deleteMany({}),
            Teacher.deleteMany({}),
            Course.deleteMany({}),
            CoursePackage.deleteMany({}),
            Program.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /api/courses", () => {
        it("returns unique courses for non-teacher users", async () => {
            const course = await Course.create({
                courseName: "Math 101",
                courseCode: "M101",
                coursePoints: "5",
            });

            const studentOneId = new mongoose.Types.ObjectId();
            const studentTwoId = new mongoose.Types.ObjectId();

            await Student.collection.insertOne({
                _id: studentOneId,
                name: "Student One",
                personalNumber: "111111-1111",
                email: "student1@example.com",
                education: [{ type: "Course", refId: course._id }],
            });

            await Student.collection.insertOne({
                _id: studentTwoId,
                name: "Student Two",
                personalNumber: "222222-2222",
                email: "student2@example.com",
                education: [{ type: "Course", refId: course._id }],
            });

            await StudentEnrollment.create({
                studentId: studentOneId,
                courseInstanceId: new mongoose.Types.ObjectId(),
                mainCourseId: course._id,
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-02-01"),
            });

            await StudentEnrollment.create({
                studentId: studentTwoId,
                courseInstanceId: new mongoose.Types.ObjectId(),
                mainCourseId: course._id,
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-02-01"),
            });

            const response = await request(searchApp)
                .get("/api/courses")
                .expect(200);

            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toMatchObject({
                _id: course._id.toString(),
                name: "Math 101",
            });
        });

        it("returns 403 when teacher profile is missing", async () => {
            const response = await request(searchApp)
                .get("/api/courses")
                .set("x-test-role", "teacher")
                .set("x-test-userid", new mongoose.Types.ObjectId().toString())
                .expect(403);

            expect(response.body).toEqual({
                error: "Teacher profile not found",
            });
        });

        it("filters courses for teacher users", async () => {
            const courseOne = await Course.create({
                courseName: "Teacher Course",
                courseCode: "T101",
                coursePoints: "5",
            });
            const courseTwo = await Course.create({
                courseName: "Other Course",
                courseCode: "O101",
                coursePoints: "5",
            });

            const teacherUserId = new mongoose.Types.ObjectId();
            const teacher = await Teacher.create({
                userId: teacherUserId,
                subject: "Math",
            });

            const teacherStudentId = new mongoose.Types.ObjectId();
            const otherStudentId = new mongoose.Types.ObjectId();

            await Student.collection.insertOne({
                _id: teacherStudentId,
                name: "Teacher Student",
                personalNumber: "333333-3333",
                email: "teacher-student@example.com",
                teacherId: teacher._id,
                education: [{ type: "Course", refId: courseOne._id }],
            });

            await Student.collection.insertOne({
                _id: otherStudentId,
                name: "Other Student",
                personalNumber: "444444-4444",
                email: "other-student@example.com",
                teacherId: new mongoose.Types.ObjectId(),
                education: [{ type: "Course", refId: courseTwo._id }],
            });

            await StudentEnrollment.create({
                studentId: teacherStudentId,
                courseInstanceId: new mongoose.Types.ObjectId(),
                mainCourseId: courseOne._id,
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-02-01"),
            });

            await StudentEnrollment.create({
                studentId: otherStudentId,
                courseInstanceId: new mongoose.Types.ObjectId(),
                mainCourseId: courseTwo._id,
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-02-01"),
            });

            const response = await request(searchApp)
                .get("/api/courses")
                .set("x-test-role", "teacher")
                .set("x-test-userid", teacherUserId.toString())
                .expect(200);

            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toMatchObject({
                _id: courseOne._id.toString(),
                name: "Teacher Course",
            });
        });

        it("returns 500 when course lookup fails", async () => {
            vi.spyOn(Student, "find").mockRejectedValue(new Error("boom"));

            const response = await request(searchApp)
                .get("/api/courses")
                .expect(500);

            expect(response.body).toEqual({
                message: "Serverfel vid hämtning av kurser",
            });
        });
    });

    describe("GET /api/search", () => {
        it("returns 403 when teacher profile is missing", async () => {
            const response = await request(searchApp)
                .get("/api/search")
                .query({ type: "Alla", q: "Test" })
                .set("x-test-role", "teacher")
                .set("x-test-userid", new mongoose.Types.ObjectId().toString())
                .expect(403);

            expect(response.body).toEqual({
                error: "Teacher profile not found",
            });
        });

        it("rejects invalid date search", async () => {
            const response = await request(searchApp)
                .get("/api/search")
                .query({ type: "Datum", date: "not-a-date" })
                .expect(400);

            expect(response.body).toEqual({ message: "Ogiltigt datum" });
        });

        it("returns students matching the date range", async () => {
            const matchingStudent = await Student.create({
                name: "Date Student",
                personalNumber: "555555-5555",
                email: "date-student@example.com",
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-01-10"),
            });

            await Student.create({
                name: "Outside Student",
                personalNumber: "666666-6666",
                email: "outside-student@example.com",
                startDate: new Date("2024-02-01"),
                endDate: new Date("2024-02-10"),
            });

            const response = await request(searchApp)
                .get("/api/search")
                .query({ type: "Datum", date: "2024-01-05" })
                .expect(200);

            expect(response.body).toEqual([
                {
                    id: matchingStudent._id.toString(),
                    name: "Date Student",
                    type: "Elev",
                    extra: "Email: date-student@example.com",
                },
            ]);
        });

        it("returns user and student results for user searches", async () => {
            const student = await Student.create({
                name: "Ann Student",
                personalNumber: "777777-7777",
                email: "ann-student@example.com",
            });

            const user = await User.create({
                username: "AnnUser",
                email: "ann-user@example.com",
                password: "password",
            roles: ["admin"],
            });

            const response = await request(searchApp)
                .get("/api/search")
                .query({ type: "Användare", q: "ann" })
                .expect(200);

            expect(response.body).toEqual(
                expect.arrayContaining([
                    {
                        id: student._id.toString(),
                        name: "Ann Student",
                        type: "Elev",
                        extra: "Email: ann-student@example.com",
                    },
                    {
                        id: user._id.toString(),
                        name: "AnnUser",
                        type: "admin",
                        extra: "Email: ann-user@example.com",
                    },
                ])
            );
        });

        it("returns unique course results for course searches", async () => {
            const course = await Course.create({
                courseName: "Alpha Course",
                courseCode: "A101",
                coursePoints: "5",
            });
            const extraCourse = await Course.create({
                courseName: "Beta Course",
                courseCode: "B101",
                coursePoints: "5",
            });

            const coursePackage = await CoursePackage.create({
                coursePackageName: "Alpha Package",
                coursePackageCode: "AP101",
                coursePackagePoints: "10",
                coursePackageExtent: "10 weeks",
                coursePackageCourses: [course._id],
            });

            const program = await Program.create({
                programName: "Alpha Program",
            });

            const studentOne = await Student.create({
                name: "Course Student",
                personalNumber: "888888-8888",
                email: "course-student@example.com",
            });

            const studentTwo = await Student.create({
                name: "Course Student Two",
                personalNumber: "999999-9999",
                email: "course-student-two@example.com",
            });

            const baseEnrollment = {
                courseInstanceId: new mongoose.Types.ObjectId(),
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-02-01"),
            };

            await StudentEnrollment.create({
                ...baseEnrollment,
                studentId: studentOne._id,
                mainCourseId: course._id,
            });

            await StudentEnrollment.create({
                ...baseEnrollment,
                studentId: studentTwo._id,
                mainCourseId: course._id,
            });

            await StudentEnrollment.create({
                ...baseEnrollment,
                studentId: studentOne._id,
                coursePackageId: coursePackage._id,
            });

            await StudentEnrollment.create({
                ...baseEnrollment,
                studentId: studentOne._id,
                programId: program._id,
            });

            await StudentEnrollment.create({
                ...baseEnrollment,
                studentId: studentOne._id,
                mainCourseId: extraCourse._id,
            });

            const response = await request(searchApp)
                .get("/api/search")
                .query({ type: "Kurs", q: "Alpha" })
                .expect(200);

            expect(response.body).toEqual(
                expect.arrayContaining([
                    {
                        id: course._id.toString(),
                        name: "Alpha Course",
                        type: "Course",
                        extra: "Typ: Course",
                    },
                    {
                        id: coursePackage._id.toString(),
                        name: "Alpha Package",
                        type: "CoursePackage",
                        extra: "Typ: CoursePackage",
                    },
                    {
                        id: program._id.toString(),
                        name: "Alpha Program",
                        type: "Program",
                        extra: "Typ: Program",
                    },
                ])
            );

            const courseMatches = response.body.filter(
                (item) => item.id === course._id.toString()
            );
            expect(courseMatches).toHaveLength(1);
        });

        it("returns 500 when search fails", async () => {
            vi.spyOn(Student, "find").mockImplementation(() => {
                throw new Error("boom");
            });

            const response = await request(searchApp)
                .get("/api/search")
                .query({ type: "Kurs", q: "Alpha" })
                .expect(500);

            expect(response.body).toEqual({
                message: "Serverfel under sökning.",
            });
        });

        it("filters date searches for teacher-owned students", async () => {
            const teacherUserId = new mongoose.Types.ObjectId();
            const teacher = await Teacher.create({
                userId: teacherUserId,
                subject: "Science",
            });

            const matchStudent = await Student.create({
                name: "Teacher Match",
                personalNumber: "141414-1414",
                email: "teacher-match@example.com",
                startDate: new Date("2024-02-01"),
                endDate: new Date("2024-02-10"),
                teacherId: teacher._id,
            });

            await Student.create({
                name: "Other Teacher",
                personalNumber: "151515-1515",
                email: "other-teacher@example.com",
                startDate: new Date("2024-02-01"),
                endDate: new Date("2024-02-10"),
                teacherId: new mongoose.Types.ObjectId(),
            });

            const response = await request(searchApp)
                .get("/api/search")
                .query({ type: "Datum", date: "2024-02-05" })
                .set("x-test-role", "teacher")
                .set("x-test-userid", teacherUserId.toString())
                .expect(200);

            expect(response.body).toEqual([
                {
                    id: matchStudent._id.toString(),
                    name: "Teacher Match",
                    type: "Elev",
                    extra: "Email: teacher-match@example.com",
                },
            ]);
        });
    });

    describe("GET /api/details/:type/:id", () => {
        it("returns 404 when the student is missing", async () => {
            const response = await request(searchApp)
                .get(`/api/details/Elev/${new mongoose.Types.ObjectId()}`)
                .expect(404);

            expect(response.body).toEqual({ message: "Student not found" });
        });

        it("returns basic student data when found", async () => {
            const studentId = new mongoose.Types.ObjectId();
            const teacherId = new mongoose.Types.ObjectId();

            await Student.collection.insertOne({
                _id: studentId,
                name: "Details Student",
                personalNumber: "121212-1212",
                email: "details-student@example.com",
                startDate: new Date("2024-03-01"),
                endDate: new Date("2024-04-01"),
                teacherId,
                education: [{ type: "Course", refId: new mongoose.Types.ObjectId() }],
            });

            const response = await request(searchApp)
                .get(`/api/details/Elev/${studentId}`)
                .expect(200);

            expect(response.body).toMatchObject({
                _id: studentId.toString(),
                name: "Details Student",
                email: "details-student@example.com",
                education: expect.any(Array),
                teacherId: teacherId.toString(),
            });
        });

        it("returns teacher user details", async () => {
            const user = await User.create({
                username: "TeacherUser",
                email: "teacher-user@example.com",
                password: "password",
                roles: ["teacher"],
            });

            const response = await request(searchApp)
                .get(`/api/details/Lärare/${user._id}`)
                .expect(200);

            expect(response.body).toEqual({
                _id: user._id.toString(),
                id: user._id.toString(),
                username: "TeacherUser",
                email: "teacher-user@example.com",
                role: "teacher",
                roles: ["teacher"],
            });
        });

        it("returns staff user details", async () => {
            const user = await User.create({
                username: "AdminUser",
                email: "admin-user@example.com",
                password: "password",
                roles: ["admin"],
            });

            const response = await request(searchApp)
                .get(`/api/details/Personal/${user._id}`)
                .expect(200);

            expect(response.body).toEqual({
                _id: user._id.toString(),
                id: user._id.toString(),
                username: "AdminUser",
                email: "admin-user@example.com",
                role: "admin",
                roles: ["admin"],
            });
        });

        it("returns 404 when staff user is missing", async () => {
            const response = await request(searchApp)
                .get(`/api/details/Personal/${new mongoose.Types.ObjectId()}`)
                .expect(404);

            expect(response.body).toEqual({
                message: "Objektet hittades inte",
            });
        });

        it("falls back to student education for course details", async () => {
            const courseId = new mongoose.Types.ObjectId();
            const studentId = new mongoose.Types.ObjectId();

            const studentFindQuery = {
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([
                    {
                        _id: studentId,
                        name: "Course Student",
                        email: "course-detail@example.com",
                    },
                ]),
            };

            const enrollmentQuery = {
                populate: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([
                    {
                        studentId: {
                            _id: studentId,
                            name: "Course Student",
                        },
                    },
                ]),
            };

            const studentWithEdu = {
                education: [
                    {
                        refId: {
                            _id: courseId,
                            courseName: "Fallback Course",
                        },
                    },
                ],
            };

            vi.spyOn(Course, "findById").mockResolvedValue(null);
            vi.spyOn(Student, "find").mockReturnValue(studentFindQuery);
            vi.spyOn(StudentEnrollment, "find").mockReturnValue(
                enrollmentQuery
            );
            vi.spyOn(Student, "findById").mockReturnValue({
                populate: vi.fn().mockResolvedValue(studentWithEdu),
            });

            const response = await request(searchApp)
                .get(`/api/details/Kurs/${courseId}`)
                .expect(200);

            expect(response.body).toMatchObject({
                courseId: courseId.toString(),
                courseName: "Fallback Course",
                teacher: {
                    _id: null,
                    username: "Okänd lärare",
                },
                students: [
                    {
                        _id: studentId.toString(),
                        name: "Course Student",
                        email: "course-detail@example.com",
                    },
                ],
            });
        });

        it("returns fallback data when course lookup fails", async () => {
            const courseId = new mongoose.Types.ObjectId();

            vi.spyOn(Course, "findById").mockRejectedValue(
                new Error("boom")
            );

            const response = await request(searchApp)
                .get(`/api/details/Kurs/${courseId}`)
                .expect(200);

            expect(response.body).toEqual({
                courseId: courseId.toString(),
                courseName: "Fel vid hämtning av kurs",
                teacher: {
                    _id: null,
                    username: "Okänd lärare",
                },
                students: [],
            });
        });

        it("returns 400 for invalid detail types", async () => {
            const response = await request(searchApp)
                .get(`/api/details/Okänd/${new mongoose.Types.ObjectId()}`)
                .expect(400);

            expect(response.body).toEqual({
                message: "Ogiltig typ av objekt",
            });
        });

        it("returns 500 when detail lookup throws", async () => {
            vi.spyOn(Student, "findById").mockRejectedValue(
                new Error("boom")
            );

            const response = await request(searchApp)
                .get(`/api/details/Elev/${new mongoose.Types.ObjectId()}`)
                .expect(500);

            expect(response.body).toEqual({
                message: "Serverfel vid hämtning av detaljer",
            });
        });
    });

    describe("PUT /api/update-student/:id", () => {
        it("updates a student record", async () => {
            const student = await Student.create({
                name: "Update Student",
                personalNumber: "131313-1313",
                email: "update-student@example.com",
            });

            const response = await request(searchApp)
                .put(`/api/update-student/${student._id}`)
                .send({ name: "Updated Student" })
                .expect(200);

            expect(response.body).toMatchObject({
                _id: student._id.toString(),
                name: "Updated Student",
            });
        });

        it("returns 500 when student update fails", async () => {
            vi.spyOn(Student, "findByIdAndUpdate").mockRejectedValue(
                new Error("boom")
            );

            const response = await request(searchApp)
                .put(`/api/update-student/${new mongoose.Types.ObjectId()}`)
                .send({ name: "Updated Student" })
                .expect(500);

            expect(response.body).toEqual({
                message: "Kunde inte uppdatera studenten",
            });
        });
    });

    describe("PUT /api/update-user/:id", () => {
        it("updates a user record", async () => {
            const user = await User.create({
                username: "Update User",
                email: "update-user@example.com",
                password: "password",
                roles: ["admin"],
            });

            const response = await request(searchApp)
                .put(`/api/update-user/${user._id}`)
                .send({ username: "Updated User" })
                .expect(200);

            expect(response.body).toMatchObject({
                _id: user._id.toString(),
                username: "Updated User",
            });
        });

        it("returns 500 when user update fails", async () => {
            vi.spyOn(User, "findByIdAndUpdate").mockRejectedValue(
                new Error("boom")
            );

            const response = await request(searchApp)
                .put(`/api/update-user/${new mongoose.Types.ObjectId()}`)
                .send({ username: "Updated User" })
                .expect(500);

            expect(response.body).toEqual({
                message: "Kunde inte uppdatera användaren",
            });
        });
    });
});
