import {
    describe,
    it,
    expect,
    vi,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
} from "vitest";
import mongoose from "mongoose";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

vi.mock("../../src/controllers/notificationController.js", () => ({
    sendStudyplanChangedNotification: vi.fn(),
}));

const buildEnrollmentData = (overrides = {}) => ({
    studentId: new mongoose.Types.ObjectId(),
    courseInstanceId: new mongoose.Types.ObjectId(),
    startDate: new Date("2024-01-01T00:00:00.000Z"),
    endDate: new Date("2024-02-01T00:00:00.000Z"),
    ...overrides,
});

describe("StudentEnrollment model notifications", () => {
    let StudentEnrollment;
    let sendStudyplanChangedNotification;

    beforeAll(async () => {
        await connectTestDatabase();

        ({ default: StudentEnrollment } = await import(
            "../../src/models/StudentEnrollment.js"
        ));

        ({ sendStudyplanChangedNotification } = await import(
            "../../src/controllers/notificationController.js"
        ));
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        sendStudyplanChangedNotification.mockClear();
        await StudentEnrollment.deleteMany({});
    });

    afterEach(async () => {
        await StudentEnrollment.deleteMany({});
    });

    it("sends changes when a meaningful update is detected", async () => {
        const enrollment = new StudentEnrollment(buildEnrollmentData());
        await enrollment.save();

        sendStudyplanChangedNotification.mockClear();

        enrollment.notes = "updated notes";
        enrollment.isModified = (path) => path === "notes";
        await enrollment.save();

        expect(sendStudyplanChangedNotification).toHaveBeenCalledTimes(1);

        const [{ doc, changeType, changes }] =
            sendStudyplanChangedNotification.mock.calls[0];

        expect(changeType).toBe("updated");
        expect(doc._id.toString()).toBe(enrollment._id.toString());
        expect(changes).toEqual({
            changedFields: ["notes"],
            previousValues: { notes: undefined },
            newValues: { notes: "updated notes" },
        });
    });

    it("sends a deleted notification when an enrollment is removed", async () => {
        const enrollment = await StudentEnrollment.create(buildEnrollmentData());

        sendStudyplanChangedNotification.mockClear();

        const deletedDoc = await StudentEnrollment.findByIdAndDelete(
            enrollment._id
        );

        expect(deletedDoc).not.toBeNull();
        expect(sendStudyplanChangedNotification).toHaveBeenCalledTimes(1);
        expect(sendStudyplanChangedNotification).toHaveBeenCalledWith({
            doc: expect.objectContaining({ _id: enrollment._id }),
            changeType: "deleted",
        });
    });
});

