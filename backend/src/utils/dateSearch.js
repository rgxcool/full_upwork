/**
 * Helpers for interpreting date-only search values as calendar days.
 *
 * Search dates are entered as calendar dates (YYYY-MM-DD), not as instants.
 * Converting them with `new Date("YYYY-MM-DD")` depends on the server's
 * timezone, which makes the same search return different results on different
 * machines. The helpers below turn a calendar date into an explicit instant
 * range for the application's timezone instead.
 */

// The application serves Swedish municipalities and formats dates with sv-SE
// throughout the UI, so calendar days are interpreted in Swedish time.
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Europe/Stockholm";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})T/;

const formatterCache = new Map();

const getFormatter = (timeZone) => {
    if (!formatterCache.has(timeZone)) {
        formatterCache.set(
            timeZone,
            new Intl.DateTimeFormat("en-US", {
                timeZone,
                hourCycle: "h23",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            })
        );
    }
    return formatterCache.get(timeZone);
};

/**
 * Returns the offset of a timezone at a specific instant, in milliseconds.
 * Positive values mean the zone is ahead of UTC.
 *
 * @param {Date} date - Instant to inspect
 * @param {string} timeZone - IANA timezone name
 * @returns {number} Offset in milliseconds
 */
export const getTimeZoneOffsetMs = (date, timeZone = APP_TIME_ZONE) => {
    const parts = getFormatter(timeZone).formatToParts(date);
    const values = {};
    for (const part of parts) {
        if (part.type !== "literal") values[part.type] = Number(part.value);
    }

    const wallClockAsUtc = Date.UTC(
        values.year,
        values.month - 1,
        values.day,
        values.hour,
        values.minute,
        values.second
    );

    // Intl does not expose milliseconds; ignore them when comparing offsets.
    return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/**
 * Strictly parses a YYYY-MM-DD value and verifies that it is a real calendar
 * date (for example, rejects 2024-02-30 instead of letting Date roll it over).
 *
 * @param {unknown} value
 * @returns {{year: number, month: number, day: number, dateOnly: string}|null}
 */
export const parseDateOnly = (value) => {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    const match = DATE_ONLY_PATTERN.exec(trimmed);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (
        candidate.getUTCFullYear() !== year ||
        candidate.getUTCMonth() !== month - 1 ||
        candidate.getUTCDate() !== day
    ) {
        return null;
    }

    return { year, month, day, dateOnly: trimmed };
};

/**
 * Accepts the date-only values used by the UI and, for backwards
 * compatibility, ISO timestamps. A timestamp is reduced to its calendar date
 * (the date part of the ISO string) before the range is built.
 *
 * @param {unknown} value
 * @returns {{year: number, month: number, day: number, dateOnly: string}|null}
 */
export const parseSearchDate = (value) => {
    const dateOnly = parseDateOnly(value);
    if (dateOnly) return dateOnly;

    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    const isoPrefix = ISO_DATE_PREFIX_PATTERN.exec(trimmed);
    if (!isoPrefix || Number.isNaN(new Date(trimmed).getTime())) return null;

    return parseDateOnly(isoPrefix[1]);
};

/**
 * Builds the inclusive start/end instants for one calendar day in a timezone.
 * The end boundary is the last millisecond before the next local midnight, so
 * DST transitions are handled correctly (23- and 25-hour days).
 *
 * @param {string} dateOnly - Calendar date in YYYY-MM-DD form
 * @param {string} timeZone - IANA timezone name
 * @returns {{startOfDay: Date, endOfDay: Date, start: Date, end: Date}|null}
 */
export const getDateOnlyRange = (dateOnly, timeZone = APP_TIME_ZONE) => {
    const parsed = parseDateOnly(dateOnly);
    if (!parsed) return null;

    const { year, month, day } = parsed;
    const startWallClock = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const nextWallClock = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0);

    const toInstant = (wallClockMs) => {
        let instant = new Date(
            wallClockMs - getTimeZoneOffsetMs(new Date(wallClockMs), timeZone)
        );

        // Re-evaluate once at the resolved instant so DST transitions that
        // happen exactly at midnight still converge on the correct offset.
        instant = new Date(
            wallClockMs - getTimeZoneOffsetMs(instant, timeZone)
        );
        return instant;
    };

    const startOfDay = toInstant(startWallClock);
    const nextStartOfDay = toInstant(nextWallClock);
    const endOfDay = new Date(nextStartOfDay.getTime() - 1);

    return { startOfDay, endOfDay, start: startOfDay, end: endOfDay };
};
