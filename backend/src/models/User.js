import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        username: { type: String },
        name: { type: String },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        roles: {
            type: [
                {
                    type: String,
                    enum: [
                        "guest",
                        "user",
                        "student",
                        "coordinator",
                        "specped",
                        "syv",
                        "teacher",
                        "admin",
                        "systemadmin",
                    ],
                },
            ],
            default: ["user"],
            required: true,
        },
        permissions: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        // Tenant (kommun) data scope. Which municipalities this user may read
        // / mutate. An empty list means global/system-wide access (no scoping).
        municipalities: { type: [String], default: [] },
        mustChangePassword: { type: Boolean, default: false },
        lastLoginAt: { type: Date, default: null },
        // When false the account is disabled/deactivated: protected operations
        // are denied regardless of any roles/permissions in a valid JWT.
        active: { type: Boolean, default: true },
        // Staff vacation tracking (Section 6.7)
        onVacation: { type: Boolean, default: false },
        vacationStart: { type: Date },
        vacationEnd: { type: Date },
        vacationNote: { type: String },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

UserSchema.virtual("role")
    .get(function () {
        return this.roles && this.roles.length > 0 ? this.roles[0] : null;
    })
    .set(function (value) {
        if (!Array.isArray(this.roles)) {
            this.roles = [];
        }
        if (value) {
            this.roles[0] = value;
        } else {
            this.roles = [];
        }
    });

UserSchema.index({ lastLoginAt: 1 });
UserSchema.index({ name: 1 });
UserSchema.index({ username: "text", name: "text", email: "text" });

export default mongoose.model("User", UserSchema);
