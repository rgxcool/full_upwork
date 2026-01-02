import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findById: vi.fn(),
    },
}));

vi.mock("../../src/controllers/notificationController.js", () => ({
    sendDropoutNotification: vi.fn(),
}));

import Student from "../../src/models/Student.js";
import { sendDropoutNotification } from "../../src/controllers/notificationController.js";
import router from "../../src/router/studentRoutes.js";

const findRouteHandler = (path, method) => {
    const layer = router.stack.find((layer) => layer.route?.path === path);
    if (!layer) {
        throw new Error(`Route ${path} not found`);
    }
    const stackEntry = layer.route.stack.find(
        (entry) => entry.method === method.toLowerCase()
    );
    if (!stackEntry) {
        throw new Error(`Method ${method} not found for ${path}`);
    }
    return stackEntry.handle;
};

const createRes = () => {
    const res = {
        status: vi.fn(function () {
            return this;
        }),
        json: vi.fn(function () {
            return this;
        }),
    };
    return res;
};

beforeEach(() => {
    Student.find.mockReset();
    Student.findById.mockReset();
    sendDropoutNotification.mockReset();
});

describe("studentRoutes router", () => {
    it("GET /students/by-teacher/:teacherId returns filtered students", async () => {
        const handler = findRouteHandler(
            "/students/by-teacher/:teacherId",
            "GET"
        );
        Student.find.mockResolvedValue([
            {
                _id: "student-1",
                name: "Ida",
                personalNumber: "19900101-1234",
                attendedExam: true,
                additionalInfo: "notes",
            },
        ]);
        const req = { params: { teacherId: "teacher-1" } };
    const res = createRes();

        sendDropoutNotification.mockResolvedValue({ id: "notif" });

        await handler(req, res);

        expect(Student.find).toHaveBeenCalledWith({
            teacherId: "teacher-1",
            dropout: { $ne: true },
        });
        expect(res.json).toHaveBeenCalledWith([
            {
                _id: "student-1",
                name: "Ida",
                personalNumber: "19900101-1234",
                attended: true,
                additionalInfo: "notes",
            },
        ]);
    });

    it("GET /students/by-teacher/:teacherId handles failures", async () => {
        const handler = findRouteHandler(
            "/students/by-teacher/:teacherId",
            "GET"
        );
        Student.find.mockRejectedValue(new Error("boom"));
        const req = { params: { teacherId: "teacher-1" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
    });

    it("PUT /students/:studentId/education/:educationId/status sends notification when status is Avbrott", async () => {
        const handler = findRouteHandler(
            "/students/:studentId/education/:educationId/status",
            "PUT"
        );
        const educationId = "edu-1";
        const educationEntry = {
            refId: {
                toString: () => educationId,
            },
            status: "Pågående",
        };
        const studentDoc = {
            _id: "student-1",
            education: [educationEntry],
            dropout: false,
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = {
            params: { studentId: "student-1", educationId },
            body: { status: "Avbrott" },
        };
        const res = createRes();

        await handler(req, res);

        expect(Student.findById).toHaveBeenCalledWith("student-1");
        expect(studentDoc.dropout).toBe(true);
        expect(sendDropoutNotification).toHaveBeenCalledWith({
            student: studentDoc,
            education: educationEntry,
        });
        expect(studentDoc.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Status updated and notification sent",
            notification: undefined,
        });
    });

    it("PUT /students/:studentId/education/:educationId/status updates status without notification when needed", async () => {
        const handler = findRouteHandler(
            "/students/:studentId/education/:educationId/status",
            "PUT"
        );
        const educationId = "edu-2";
        const educationEntry = {
            refId: {
                toString: () => educationId,
            },
            status: "Pågående",
        };
        const studentDoc = {
            _id: "student-2",
            education: [educationEntry],
            dropout: true,
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = {
            params: { studentId: "student-2", educationId },
            body: { status: "Pågående" },
        };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.dropout).toBe(false);
        expect(sendDropoutNotification).not.toHaveBeenCalled();
        expect(studentDoc.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Status updated successfully",
        });
    });
});
