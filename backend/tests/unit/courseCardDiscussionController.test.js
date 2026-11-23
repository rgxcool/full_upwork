import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/CourseCardDiscussion.js", () => ({
    __esModule: true,
    default: {
        create: vi.fn(),
        find: vi.fn(),
        findOne: vi.fn(),
    },
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: { findById: vi.fn() },
}));
vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: { findById: vi.fn(), findOne: vi.fn() },
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: { findOne: vi.fn() },
}));

import {
    addModuleDiscussionMessage,
    createModuleDiscussion,
    getModuleDiscussions,
} from "../../src/controllers/courseCardDiscussionController.js";
import CourseCardDiscussion from "../../src/models/CourseCardDiscussion.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";

const INSTANCE_ID = "507f1f77bcf86cd799439011";
const DISCUSSION_ID = "507f1f77bcf86cd799439012";
const STUDENT_ID = "507f1f77bcf86cd799439013";

const createRes = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
});

const createInstance = () => ({
    _id: INSTANCE_ID,
    modules: [{ moduleNumber: 1 }],
});

const createSelectResult = (value) => ({
    select: vi.fn().mockResolvedValue(value),
});

beforeEach(() => {
    vi.resetAllMocks();
    CourseInstance.findById.mockResolvedValue(createInstance());
    Student.findOne.mockReturnValue(createSelectResult({ _id: STUDENT_ID }));
    StudentEnrollment.findOne.mockReturnValue(createSelectResult({ _id: "enrollment-1" }));
});

describe("course-card discussions", () => {
    it("does not allow students to start a thread", async () => {
        const res = createRes();

        await createModuleDiscussion(
            {
                params: { instanceId: INSTANCE_ID },
                body: { moduleNumber: 1, title: "Uppgift", text: "Börja här" },
                user: { userId: "student-user", role: "student" },
            },
            res
        );

        expect(CourseCardDiscussion.create).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("allows staff to start a thread with an initial prompt", async () => {
        const discussion = { _id: DISCUSSION_ID };
        CourseCardDiscussion.create.mockResolvedValue(discussion);
        const res = createRes();

        await createModuleDiscussion(
            {
                params: { instanceId: INSTANCE_ID },
                body: { moduleNumber: 1, title: "Uppgift", text: "Börja här", category: "assignment" },
                user: { userId: "teacher-1", role: "teacher" },
            },
            res
        );

        expect(CourseCardDiscussion.create).toHaveBeenCalledWith(
            expect.objectContaining({
                courseInstanceId: INSTANCE_ID,
                moduleNumber: 1,
                title: "Uppgift",
                promptText: "Börja här",
            })
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ success: true, discussion });
    });

    it("returns only the current student's private conversation", async () => {
        const discussions = [
            {
                _id: DISCUSSION_ID,
                studentConversations: [
                    { studentId: { _id: STUDENT_ID }, messages: [{ text: "min dialog" }] },
                    { studentId: { _id: "other-student" }, messages: [{ text: "privat" }] },
                ],
            },
        ];
        const query = {
            populate: vi.fn(),
            sort: vi.fn(),
            lean: vi.fn().mockResolvedValue(discussions),
        };
        query.populate.mockReturnValue(query);
        query.sort.mockReturnValue(query);
        CourseCardDiscussion.find.mockReturnValue(query);
        const res = createRes();

        await getModuleDiscussions(
            {
                params: { instanceId: INSTANCE_ID },
                query: { moduleNumber: "1" },
                user: { role: "student", email: "student@example.test" },
            },
            res
        );

        expect(res.json).toHaveBeenCalledWith({
            success: true,
            discussions: [
                expect.objectContaining({
                    studentConversations: [
                        expect.objectContaining({ messages: [{ text: "min dialog" }] }),
                    ],
                }),
            ],
        });
    });

    it("prevents a student from posting twice without a staff response", async () => {
        const conversation = {
            studentId: STUDENT_ID,
            messages: [{ authorRole: "student", text: "mitt svar" }],
        };
        const discussion = {
            studentConversations: [conversation],
            save: vi.fn(),
        };
        CourseCardDiscussion.findOne.mockResolvedValue(discussion);
        const res = createRes();

        await addModuleDiscussionMessage(
            {
                params: { instanceId: INSTANCE_ID, discussionId: DISCUSSION_ID },
                body: { moduleNumber: 1, text: "ett till svar" },
                user: { userId: "student-user", role: "student", email: "student@example.test" },
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(discussion.save).not.toHaveBeenCalled();
    });

    it("lets a student answer after staff has replied", async () => {
        const conversation = {
            studentId: STUDENT_ID,
            messages: [{ authorRole: "staff", text: "mitt svar" }],
        };
        const discussion = {
            studentConversations: [conversation],
            save: vi.fn().mockResolvedValue(undefined),
        };
        CourseCardDiscussion.findOne.mockResolvedValue(discussion);
        const res = createRes();

        await addModuleDiscussionMessage(
            {
                params: { instanceId: INSTANCE_ID, discussionId: DISCUSSION_ID },
                body: { moduleNumber: 1, text: "tack för svaret" },
                user: { userId: "student-user", role: "student", email: "student@example.test" },
            },
            res
        );

        expect(discussion.save).toHaveBeenCalledOnce();
        expect(conversation.messages.at(-1)).toMatchObject({
            authorId: "student-user",
            authorRole: "student",
            text: "tack för svaret",
        });
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });
});
