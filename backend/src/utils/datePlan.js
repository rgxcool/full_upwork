/**
 * Shared date-plan rules for 5, 10 and 20 week courses.
 *
 * The same offset table used to be duplicated in the course-matching service,
 * the course-instance controller, the activity-status service and the schedule
 * parameter model. Keeping the rules here makes new plans predictable and lets
 * the preview/apply endpoints return exactly what would be persisted.
 *
 * Calendar dates are normalized to UTC midnight. Adding whole weeks to a UTC
 * instant keeps the weekday stable on DST boundaries, which is why the new
 * planning endpoints avoid the local-time `setDate()` arithmetic used by the
 * older creation paths.
 */

import { parseSearchDate } from "./dateSearch.js";

export const PLAN_LENGTHS = [5, 10, 20];
export const SECTION_COUNT = 5;

export const DEFAULT_SECTION_OFFSETS = {
    5: [0, 1, 2, 3, 4],
    10: [0, 2, 4, 6, 8],
    20: [0, 4, 8, 12, 16],
};

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Interprets a date-only value as a calendar day at UTC midnight.
 * Date objects use their local calendar parts so a date created at local
 * midnight by the existing forms keeps the same calendar day.
 *
 * @param {unknown} value
 * @returns {Date|null}
 */
export const toUtcCalendarDate = (value) => {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return new Date(
            Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
        );
    }
    const parsed = parseSearchDate(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
};

/** @param {Date} date @returns {string} Calendar day in YYYY-MM-DD form. */
export const formatDateOnly = (date) => date.toISOString().slice(0, 10);

/**
 * Returns the saved offsets when they are valid, otherwise the defaults for
 * the requested course length.
 *
 * @param {number} lengthWeeks - 5, 10 or 20
 * @param {unknown} savedOffsets - offsets stored on TeacherScheduleParameters
 * @returns {{offsets: number[], source: "saved"|"default"}}
 */
export const resolveSectionOffsets = (lengthWeeks, savedOffsets) => {
    if (!PLAN_LENGTHS.includes(lengthWeeks)) {
        throw new Error("lengthWeeks must be 5, 10 or 20");
    }

    const savedIsValid =
        Array.isArray(savedOffsets) &&
        savedOffsets.length === SECTION_COUNT &&
        savedOffsets.every(
            (n) => typeof n === "number" && Number.isFinite(n) && n >= 0
        );

    if (savedIsValid) return { offsets: [...savedOffsets], source: "saved" };
    return { offsets: [...DEFAULT_SECTION_OFFSETS[lengthWeeks]], source: "default" };
};

/**
 * Picks the supported course length closest to the start/end span.
 *
 * @param {unknown} startDate
 * @param {unknown} endDate
 * @returns {number|null}
 */
export const nearestPlanLength = (startDate, endDate) => {
    const start = toUtcCalendarDate(startDate);
    const end = toUtcCalendarDate(endDate);
    if (!start || !end || end < start) return null;

    const weeks = Math.round((end - start) / MS_PER_WEEK);
    return PLAN_LENGTHS.reduce((prev, curr) =>
        Math.abs(curr - weeks) < Math.abs(prev - weeks) ? curr : prev
    );
};

/**
 * Builds a complete 5/10/20 week plan without touching the database.
 *
 * @param {object} options
 * @param {unknown} options.startDate - Course start calendar date
 * @param {unknown} [options.endDate] - Course end calendar date; defaults to
 *   `lengthWeeks` after the start
 * @param {number} options.lengthWeeks - 5, 10 or 20
 * @param {unknown} [options.sectionOffsets] - Teacher's saved offsets
 * @param {number} [options.moduleCount] - Number of modules to date (max 5)
 * @param {number[]} [options.avsnittCounts] - Avsnitt count per module; each
 *   module slot is divided evenly by its count, starting at the module start
 *   date (so one Avsnitt inherits the module start date, matching D8).
 * @returns {{lengthWeeks: number, startDate: Date, endDate: Date,
 *   sectionOffsets: number[], sectionDates: Date[],
 *   moduleDates: Array<{startDate: Date, endDate: Date}>,
 *   avsnittDates: Date[][], source: "saved"|"default"}|null}
 */
export const generateDatePlan = ({
    startDate,
    endDate,
    lengthWeeks,
    sectionOffsets,
    moduleCount = SECTION_COUNT,
    avsnittCounts = [],
}) => {
    const start = toUtcCalendarDate(startDate);
    if (!start) return null;

    const length = Number(lengthWeeks);
    const { offsets, source } = resolveSectionOffsets(length, sectionOffsets);
    const end =
        toUtcCalendarDate(endDate) ||
        new Date(start.getTime() + length * MS_PER_WEEK);
    if (end < start) return null;

    const sectionDates = offsets.map(
        (offsetWeeks) => new Date(start.getTime() + offsetWeeks * MS_PER_WEEK)
    );
    const datedModuleCount = Math.max(
        0,
        Math.min(Number(moduleCount) || SECTION_COUNT, sectionDates.length)
    );
    const moduleDates = sectionDates
        .slice(0, datedModuleCount)
        .map((sectionDate, index) => ({
            startDate: sectionDate,
            endDate: sectionDates[index + 1] || end,
        }));

    // Slice 4 / D3: split each module slot evenly by its Avsnitt count.
    // The first Avsnitt gets the module start date, keeping generated plans
    // consistent with the migration backfill in D8.
    const avsnittDates = moduleDates.map((moduleDate, moduleIndex) => {
        const count = Math.max(0, Number(avsnittCounts[moduleIndex]) || 0);
        if (count === 0) return [];
        const span = moduleDate.endDate.getTime() - moduleDate.startDate.getTime();
        const step = span > 0 ? span / count : 0;
        return Array.from({ length: count }, (_, index) =>
            new Date(moduleDate.startDate.getTime() + index * step)
        );
    });

    return {
        lengthWeeks: length,
        startDate: start,
        endDate: end,
        sectionOffsets: offsets,
        sectionDates,
        moduleDates,
        avsnittDates,
        source,
    };
};

export default {
    PLAN_LENGTHS,
    SECTION_COUNT,
    DEFAULT_SECTION_OFFSETS,
    toUtcCalendarDate,
    formatDateOnly,
    resolveSectionOffsets,
    nearestPlanLength,
    generateDatePlan,
};
