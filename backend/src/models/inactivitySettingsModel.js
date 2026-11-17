import mongoose from "mongoose";

// Singleton document holding org-level inactivity automation settings.
// Env variables remain the fallback defaults, but admins can adjust the
// thresholds and toggles at runtime without a restart.
const inactivitySettingsSchema = new mongoose.Schema(
    {
        withdrawDays: { type: Number, default: 5 },
        warningDays: { type: Number, default: 14 },
        autoWarningEnabled: { type: Boolean, default: true },
        autoWithdrawEnabled: { type: Boolean, default: true },
        scanHourUtc: { type: Number, default: 2 },
        configVersion: { type: Number, default: 1 },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

export const InactivitySettings = mongoose.model(
    "InactivitySettings",
    inactivitySettingsSchema,
    "inactivitysettings"
);
