import {
    INACTIVITY_WITHDRAW_DAYS,
    INACTIVITY_WARNING_DAYS,
} from "../utils/inactivityStatus.js";
import { InactivitySettings } from "../models/inactivitySettingsModel.js";

const DEFAULT_SCAN_HOUR_UTC = (() => {
    const raw = parseInt(process.env.INACTIVITY_SCAN_HOUR_UTC, 10);
    return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : 2;
})();

const DEFAULT_AUTO_WARNING = process.env.INACTIVITY_AUTO_WARNING_ENABLED !== "false";
const DEFAULT_AUTO_WITHDRAW = process.env.INACTIVITY_AUTO_WITHDRAW_ENABLED !== "false";

/**
 * Load the current inactivity settings as a plain snapshot. Env constants are
 * the fallback so existing deployments behave exactly as before any settings
 * document has been saved.
 */
export async function getInactivitySettingsSnapshot() {
    const s = await InactivitySettings.findOne({}).lean();
    return {
        withdrawDays: s?.withdrawDays ?? INACTIVITY_WITHDRAW_DAYS,
        warningDays: s?.warningDays ?? INACTIVITY_WARNING_DAYS,
        autoWarningEnabled: s?.autoWarningEnabled ?? DEFAULT_AUTO_WARNING,
        autoWithdrawEnabled: s?.autoWithdrawEnabled ?? DEFAULT_AUTO_WITHDRAW,
        scanHourUtc: s?.scanHourUtc ?? DEFAULT_SCAN_HOUR_UTC,
        configVersion: s?.configVersion ?? 1,
        updatedBy: s?.updatedBy || null,
        updatedAt: s?.updatedAt || null,
    };
}

/** Just the two day thresholds, for callers that only need those. */
export async function getInactivityThresholds() {
    const snapshot = await getInactivitySettingsSnapshot();
    return {
        withdrawDays: snapshot.withdrawDays,
        warningDays: snapshot.warningDays,
    };
}
