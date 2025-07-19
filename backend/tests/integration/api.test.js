import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";

let mongoServer;
let authToken;
let testUser;
let testStudent;
let testCourse;

describe("API Integration Tests", () => {
    beforeAll(async () => {
        // Start in-memory MongoDB server
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();

        // Connect to test database
        await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
        // Clean up
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        // Clear database before each test
        await User.deleteMany({});
        await Student.deleteMany({});
        await Course.deleteMany({});

        // Create test user
        testUser = new User({
            name: "Test Admin",
            email: "testadmin@example.com",
            password: "$2a$10$test.hash.for.testing",
            role: "admin",
        });
        await testUser.save();

        // Create test student
        testStudent = new Student({
            name: "Test Student",
            email: "teststudent@example.com",
            personalNumber: "123456789012",
            role: "student",
        });
        await testStudent.save();

        // Create test course
        testCourse = new Course({
            courseName: "Test Course",
            courseCode: "TC101",
            coursePoints: "5",
            courseExtent: "10 weeks",
        });
        await testCourse.save();
    });

    afterEach(async () => {
        // Clean up after each test
        await User.deleteMany({});
        await Student.deleteMany({});
        await Course.deleteMany({});
    });

    describe("Authentication Endpoints", () => {
        describe("POST /api/auth/login", () => {
            it("should login with valid credentials", async () => {
                const loginData = {
                    email: "testadmin@example.com",
                    password: "testPassword123!",
                };

                const response = await request(app)
                    .post("/api/auth/login")
                    .send(loginData)
                    .expect(200);

                expect(response.body).toHaveProperty(
                    "message",
                    "Login successful"
                );
                expect(response.body).toHaveProperty("user");
                expect(response.body.user).toHaveProperty(
                    "email",
                    "testadmin@example.com"
                );
                expect(response.body.user).toHaveProperty("role", "admin");
                expect(response.headers).toHaveProperty("set-cookie");
            });

            it("should reject invalid credentials", async () => {
                const loginData = {
                    email: "testadmin@example.com",
                    password: "wrongpassword",
                };

                const response = await request(app)
                    .post("/api/auth/login")
                    .send(loginData)
                    .expect(401);

                expect(response.body).toHaveProperty("error");
                expect(response.body.error).toContain(
                    "Fel email eller lösenord"
                );
            });

            it("should reject non-existent user", async () => {
                const loginData = {
                    email: "nonexistent@example.com",
                    password: "testPassword123!",
                };

                const response = await request(app)
                    .post("/api/auth/login")
                    .send(loginData)
                    .expect(401);

                expect(response.body).toHaveProperty("error");
                expect(response.body.error).toContain(
                    "Fel email eller lösenord"
                );
            });
        });

        describe("GET /api/auth/session", () => {
            it("should return user session when authenticated", async () => {
                // First login to get session
                const loginResponse = await request(app)
                    .post("/api/auth/login")
                    .send({
                        email: "testadmin@example.com",
                        password: "testPassword123!",
                    });

                const cookies = loginResponse.headers["set-cookie"];

                const response = await request(app)
                    .get("/api/auth/session")
                    .set("Cookie", cookies)
                    .expect(200);

                expect(response.body).toHaveProperty("user");
                expect(response.body.user).toHaveProperty(
                    "email",
                    "testadmin@example.com"
                );
            });

            it("should return 401 when not authenticated", async () => {
                const response = await request(app)
                    .get("/api/auth/session")
                    .expect(401);

                expect(response.body).toHaveProperty("error");
            });
        });

        describe("POST /api/auth/logout", () => {
            it("should logout successfully", async () => {
                // First login to get session
                const loginResponse = await request(app)
                    .post("/api/auth/login")
                    .send({
                        email: "testadmin@example.com",
                        password: "testPassword123!",
                    });

                const cookies = loginResponse.headers["set-cookie"];

                const response = await request(app)
                    .post("/api/auth/logout")
                    .set("Cookie", cookies)
                    .expect(200);

                expect(response.body).toHaveProperty(
                    "message",
                    "Logout successful"
                );
            });
        });
    });

    describe("Student Endpoints", () => {
        beforeEach(async () => {
            // Login and get auth token
            const loginResponse = await request(app)
                .post("/api/auth/login")
                .send({
                    email: "testadmin@example.com",
                    password: "testPassword123!",
                });

            authToken = loginResponse.headers["set-cookie"];
        });

        describe("GET /api/students", () => {
            it("should return all students when authenticated as admin", async () => {
                const response = await request(app)
                    .get("/api/students")
                    .set("Cookie", authToken)
                    .expect(200);

                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.length).toBeGreaterThan(0);
                expect(response.body[0]).toHaveProperty("name");
                expect(response.body[0]).toHaveProperty("email");
            });

            it("should return 403 when not authenticated as admin", async () => {
                const response = await request(app)
                    .get("/api/students")
                    .expect(401);
            });
        });

        describe("GET /api/student/:id", () => {
            it("should return specific student when authenticated", async () => {
                const response = await request(app)
                    .get(`/api/student/${testStudent._id}`)
                    .set("Cookie", authToken)
                    .expect(200);

                expect(response.body).toHaveProperty("name", "Test Student");
                expect(response.body).toHaveProperty(
                    "email",
                    "teststudent@example.com"
                );
            });

            it("should return 404 for non-existent student", async () => {
                const fakeId = new mongoose.Types.ObjectId();
                const response = await request(app)
                    .get(`/api/student/${fakeId}`)
                    .set("Cookie", authToken)
                    .expect(404);
            });
        });

        describe("POST /api/student", () => {
            it("should create new student when authenticated as admin", async () => {
                const newStudent = {
                    name: "New Student",
                    email: "newstudent@example.com",
                    personalNumber: "987654321098",
                    role: "student",
                };

                const response = await request(app)
                    .post("/api/student")
                    .set("Cookie", authToken)
                    .send(newStudent)
                    .expect(201);

                expect(response.body).toHaveProperty("name", "New Student");
                expect(response.body).toHaveProperty(
                    "email",
                    "newstudent@example.com"
                );
            });

            it("should validate required fields", async () => {
                const invalidStudent = {
                    name: "", // Empty name
                    email: "invalid-email", // Invalid email
                };

                const response = await request(app)
                    .post("/api/student")
                    .set("Cookie", authToken)
                    .send(invalidStudent)
                    .expect(400);

                expect(response.body).toHaveProperty("error");
            });
        });

        describe("PUT /api/student/:id", () => {
            it("should update student when authenticated as admin", async () => {
                const updateData = {
                    name: "Updated Student Name",
                    email: "updated@example.com",
                };

                const response = await request(app)
                    .put(`/api/student/${testStudent._id}`)
                    .set("Cookie", authToken)
                    .send(updateData)
                    .expect(200);

                expect(response.body).toHaveProperty(
                    "name",
                    "Updated Student Name"
                );
                expect(response.body).toHaveProperty(
                    "email",
                    "updated@example.com"
                );
            });

            it("should return 404 for non-existent student", async () => {
                const fakeId = new mongoose.Types.ObjectId();
                const updateData = { name: "Updated Name" };

                const response = await request(app)
                    .put(`/api/student/${fakeId}`)
                    .set("Cookie", authToken)
                    .send(updateData)
                    .expect(404);
            });
        });

        describe("DELETE /api/student/:id", () => {
            it("should delete student when authenticated as admin", async () => {
                const response = await request(app)
                    .delete(`/api/student/${testStudent._id}`)
                    .set("Cookie", authToken)
                    .expect(200);

                expect(response.body).toHaveProperty(
                    "message",
                    "Student deleted successfully"
                );

                // Verify student is actually deleted
                const deletedStudent = await Student.findById(testStudent._id);
                expect(deletedStudent).toBeNull();
            });

            it("should return 404 for non-existent student", async () => {
                const fakeId = new mongoose.Types.ObjectId();

                const response = await request(app)
                    .delete(`/api/student/${fakeId}`)
                    .set("Cookie", authToken)
                    .expect(404);
            });
        });
    });

    describe("Course Endpoints", () => {
        beforeEach(async () => {
            // Login and get auth token
            const loginResponse = await request(app)
                .post("/api/auth/login")
                .send({
                    email: "testadmin@example.com",
                    password: "testPassword123!",
                });

            authToken = loginResponse.headers["set-cookie"];
        });

        describe("GET /api/courses", () => {
            it("should return all courses when authenticated", async () => {
                const response = await request(app)
                    .get("/api/courses")
                    .set("Cookie", authToken)
                    .expect(200);

                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.length).toBeGreaterThan(0);
                expect(response.body[0]).toHaveProperty("courseName");
                expect(response.body[0]).toHaveProperty("courseCode");
            });
        });

        describe("GET /api/course/:id", () => {
            it("should return specific course when authenticated", async () => {
                const response = await request(app)
                    .get(`/api/course/${testCourse._id}`)
                    .set("Cookie", authToken)
                    .expect(200);

                expect(response.body).toHaveProperty(
                    "courseName",
                    "Test Course"
                );
                expect(response.body).toHaveProperty("courseCode", "TC101");
            });
        });

        describe("POST /api/course", () => {
            it("should create new course when authenticated as admin", async () => {
                const newCourse = {
                    courseName: "New Course",
                    courseCode: "NC101",
                    coursePoints: "10",
                    courseExtent: "15 weeks",
                };

                const response = await request(app)
                    .post("/api/course")
                    .set("Cookie", authToken)
                    .send(newCourse)
                    .expect(201);

                expect(response.body).toHaveProperty(
                    "courseName",
                    "New Course"
                );
                expect(response.body).toHaveProperty("courseCode", "NC101");
            });
        });
    });

    describe("Search Endpoints", () => {
        beforeEach(async () => {
            // Login and get auth token
            const loginResponse = await request(app)
                .post("/api/auth/login")
                .send({
                    email: "testadmin@example.com",
                    password: "testPassword123!",
                });

            authToken = loginResponse.headers["set-cookie"];
        });

        describe("GET /api/search", () => {
            it("should search for students", async () => {
                const response = await request(app)
                    .get("/api/search")
                    .query({
                        type: "Användare",
                        q: "Test Student",
                    })
                    .set("Cookie", authToken)
                    .expect(200);

                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.length).toBeGreaterThan(0);
                expect(response.body[0]).toHaveProperty("name", "Test Student");
            });

            it("should search for courses", async () => {
                const response = await request(app)
                    .get("/api/search")
                    .query({
                        type: "Kurs",
                        q: "Test Course",
                    })
                    .set("Cookie", authToken)
                    .expect(200);

                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.length).toBeGreaterThan(0);
                expect(response.body[0]).toHaveProperty(
                    "courseName",
                    "Test Course"
                );
            });

            it("should return empty array for no matches", async () => {
                const response = await request(app)
                    .get("/api/search")
                    .query({
                        type: "Användare",
                        q: "NonExistentUser",
                    })
                    .set("Cookie", authToken)
                    .expect(200);

                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.length).toBe(0);
            });
        });

        describe("GET /api/details/:type/:id", () => {
            it("should return student details", async () => {
                const response = await request(app)
                    .get(`/api/details/Elev/${testStudent._id}`)
                    .set("Cookie", authToken)
                    .expect(200);

                expect(response.body).toHaveProperty("name", "Test Student");
                expect(response.body).toHaveProperty(
                    "email",
                    "teststudent@example.com"
                );
            });

            it("should return course details", async () => {
                const response = await request(app)
                    .get(`/api/details/Kurs/${testCourse._id}`)
                    .set("Cookie", authToken)
                    .expect(200);

                expect(response.body).toHaveProperty(
                    "courseName",
                    "Test Course"
                );
                expect(response.body).toHaveProperty("courseCode", "TC101");
            });
        });
    });

    describe("Error Handling", () => {
        it("should handle 404 for non-existent routes", async () => {
            const response = await request(app)
                .get("/api/nonexistent-route")
                .expect(404);
        });

        it("should handle malformed JSON", async () => {
            const response = await request(app)
                .post("/api/student")
                .set("Content-Type", "application/json")
                .send('{"invalid": json}')
                .expect(400);
        });

        it("should handle missing required fields", async () => {
            const response = await request(app)
                .post("/api/student")
                .set("Cookie", authToken)
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty("error");
        });
    });

    describe("Rate Limiting", () => {
        it("should limit requests per IP", async () => {
            // Make multiple requests quickly
            const promises = Array.from({ length: 10 }, () =>
                request(app).get("/api/students")
            );

            const responses = await Promise.all(promises);

            // Some requests should be rate limited
            const rateLimited = responses.some((res) => res.status === 429);
            expect(rateLimited).toBe(true);
        });
    });
});
