import mongoose from "mongoose";

const studentEnrollmentSchema = new mongoose.Schema(
    {
        // Student reference
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },

        // Course instance reference
        courseInstanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CourseInstance",
            required: true,
        },

        // Main course reference (for easy querying)
        mainCourseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: false,
        },
        // Course package reference (for package enrollments)
        coursePackageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CoursePackage",
            required: false,
        },
        // Program reference (for program enrollments)
        programId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            required: false,
        },

        // Enrollment dates
        enrollmentDate: {
            type: Date,
            default: Date.now,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },

        // Status tracking
        status: {
            type: String,
            enum: [
                "enrolled",
                "active",
                "completed",
                "dropped",
                "inactive",
                "suspended",
                "reviderad",
            ],
            default: "enrolled",
        },

        // Status change history
        statusHistory: [
            {
                status: {
                    type: String,
                    enum: [
                        "enrolled",
                        "active",
                        "completed",
                        "dropped",
                        "inactive",
                        "suspended",
                        "reviderad",
                    ],
                },
                changedAt: { type: Date, default: Date.now },
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                reason: String,
                notes: String,
            },
        ],

        // Academic information
        grade: { type: String, default: null },
        gradeDate: { type: Date, default: null },
        gradeBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        
        // Slutprov (final exam) date
        slutprovDate: { type: Date, default: null },

        // Attendance tracking
        attendancePercentage: { type: Number, min: 0, max: 100, default: null },
        lastAttendanceDate: { type: Date, default: null },

        // Financial tracking
        paymentStatus: {
            type: String,
            enum: ["pending", "paid", "partial", "overdue", "waived"],
            default: "pending",
        },

        // Metadata
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },

        notes: String,
        tags: [String],

        // Completion tracking
        completedAt: { type: Date, default: null },
        completionCertificate: { type: String, default: null },

        // Dropout information
        dropoutReason: String,
        dropoutDate: { type: Date, default: null },
        dropoutBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

        // Re-enrollment tracking
        isReEnrollment: { type: Boolean, default: false },
        previousEnrollmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StudentEnrollment",
        },
    },
    {
        timestamps: true,
        indexes: [
            { studentId: 1, courseInstanceId: 1 },
            { studentId: 1, status: 1 },
            { courseInstanceId: 1, status: 1 },
            { startDate: 1, endDate: 1 },
            { status: 1, startDate: 1 },
        ],
    }
);

// Pre-save middleware to update status history
studentEnrollmentSchema.pre("save", function () {
    if (this.isModified("status")) {
        this.statusHistory.push({
            status: this.status,
            changedAt: new Date(),
            changedBy: this.updatedBy || null,
            reason: this.statusChangeReason || null,
            notes: this.statusChangeNotes || null,
        });

        // Clear temporary fields
        delete this.updatedBy;
        delete this.statusChangeReason;
        delete this.statusChangeNotes;
    }
});

// Method to change status with reason
studentEnrollmentSchema.methods.changeStatus = function (
    newStatus,
    reason = null,
    notes = null,
    changedBy = null
) {
    this.status = newStatus;
    this.updatedBy = changedBy;
    this.statusChangeReason = reason;
    this.statusChangeNotes = notes;

    // Set specific dates based on status
    if (newStatus === "completed") {
        this.completedAt = new Date();
    } else if (newStatus === "dropped") {
        this.dropoutDate = new Date();
        this.dropoutBy = changedBy;
    }

    return this.save();
};

// Method to calculate duration
studentEnrollmentSchema.methods.getDuration = function () {
    return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
};

// Method to check if enrollment is currently active
studentEnrollmentSchema.methods.isCurrentlyActive = function () {
    const now = new Date();
    return (
        this.status === "active" && this.startDate <= now && this.endDate >= now
    );
};

export default mongoose.model(
    "StudentEnrollment",
    studentEnrollmentSchema,
    "studentEnrollments"
);
