/**
 * Student-level Startdatum / Slutdatum / Slutprov derived from the student's
 * enrollments (StudentEnrollment is the source of truth, #103).
 *
 * The stored `Student.startDate / endDate / finalExamDate` fields are only
 * filled by the Excel import, so students placed in the app (placement wizard,
 * "Lägg till student", the demo seed) showed empty dates in the Elever list.
 *
 * Rule: earliest start, latest end and latest slutprov over the enrollments
 * that are not dropped. A student whose enrollments are all dropped (avbrott)
 * gets the dates of those, so the INAKTIV row still shows when they studied.
 * Fields no enrollment has a value for return null (caller keeps stored value).
 */

const toTime = (value) => {
    if (!value) return null;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
};

const pick = (enrollments, field, choose) => {
    const times = enrollments.map((e) => toTime(e?.[field])).filter((t) => t !== null);
    return times.length ? new Date(choose(...times)) : null;
};

/**
 * @param {Array<{status?: string, startDate?: Date, endDate?: Date, slutprovDate?: Date}>} enrollments
 * @returns {{startDate: Date|null, endDate: Date|null, finalExamDate: Date|null}}
 */
export function summariseEnrollmentDates(enrollments) {
    const all = Array.isArray(enrollments) ? enrollments.filter(Boolean) : [];
    const current = all.filter((e) => e.status !== "dropped");
    const source = current.length ? current : all;
    return {
        startDate: pick(source, "startDate", Math.min),
        endDate: pick(source, "endDate", Math.max),
        finalExamDate: pick(source, "slutprovDate", Math.max),
    };
}

/**
 * Overwrite the student's summary dates with the enrollment-derived ones
 * where an enrollment provides a value; otherwise keep what is stored.
 * Mutates and returns `student` (a lean object).
 */
export function applyEnrollmentDateSummary(student, enrollments) {
    const summary = summariseEnrollmentDates(enrollments);
    for (const key of ["startDate", "endDate", "finalExamDate"]) {
        if (summary[key]) student[key] = summary[key];
    }
    return student;
}
