const FEATURE_KEYS = [
    "MESSAGING",
    "CERTIFICATES",
    "FAQ",
    "LMS",
    "APL",
    "PROVNINGAR",
    "INACTIVITY",
    "ANALYTICS",
    "QUESTION_BANK",
    "ACTION_PLANS",
    "APPOINTMENTS",
];

const parseEnvironmentValue = (value) => {
    if (value === undefined) {
        return true;
    }
    return !["false", "0", "no", "off"].includes(String(value).trim().toLowerCase());
};

const readFeatureFlags = () =>
    Object.fromEntries(
        FEATURE_KEYS.map((key) => [
            key,
            parseEnvironmentValue(process.env[`FEATURE_${key}`]),
        ])
    );

const normalizeFeatureKey = (feature) => {
    if (typeof feature !== "string") {
        return null;
    }
    return feature.replace(/^FEATURE_/i, "").toUpperCase();
};

export const FEATURE_FLAGS = Object.freeze(readFeatureFlags());

export function isFeatureEnabled(feature) {
    const key = normalizeFeatureKey(feature);
    if (!key || !FEATURE_KEYS.includes(key)) {
        return true;
    }

    return parseEnvironmentValue(process.env[`FEATURE_${key}`]);
}

export function requireFeature(feature) {
    return (_req, res, next) => {
        if (!isFeatureEnabled(feature)) {
            return res.status(404).json({
                success: false,
                error: { message: "Feature not available" },
            });
        }
        return next();
    };
}

export function getPublicFeatureFlags() {
    return readFeatureFlags();
}
