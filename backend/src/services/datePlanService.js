import CourseInstance from "../models/CourseInstance.js";
import TeacherScheduleParameters from "../models/TeacherScheduleParameters.js";
import { AppError } from "../utils/errorHandler.js";
import {
    PLAN_LENGTHS,
    formatDateOnly,
    generateDatePlan,
    nearestPlanLength,
} from "../utils/datePlan.js";

/** Turns the internal plan (Dates) into the API representation (YYYY-MM-DD). */
export const serializeDatePlan = (plan) => ({
    lengthWeeks: plan.lengthWeeks,
    startDate: formatDateOnly(plan.startDate),
    endDate: formatDateOnly(plan.endDate),
    sectionOffsets: plan.sectionOffsets,
    sectionDates: plan.sectionDates.map(formatDateOnly),
    moduleDates: plan.moduleDates.map((moduleDate) => ({
        startDate: formatDateOnly(moduleDate.startDate),
        endDate: formatDateOnly(moduleDate.endDate),
    })),
    avsnittDates: (plan.avsnittDates || []).map((dates) => dates.map(formatDateOnly)),
    source: plan.source,
});

const buildPlan = async (instance, options = {}) => {
    const { lengthWeeks, sectionOffsets, endDate } = options;
    const lengthWasGiven =
        lengthWeeks !== undefined && lengthWeeks !== null && lengthWeeks !== "";
    const resolvedLength = lengthWasGiven
        ? Number(lengthWeeks)
        : nearestPlanLength(instance.startDate, instance.endDate);

    if (!PLAN_LENGTHS.includes(resolvedLength)) {
        throw new AppError("lengthWeeks must be 5, 10 or 20", 400);
    }

    let savedOffsets = sectionOffsets;
    if (!savedOffsets && instance.responsibleTeacher) {
        const params = await TeacherScheduleParameters.findOne({
            teacherId: instance.responsibleTeacher,
            courseId: String(instance.mainCourseId),
            lengthWeeks: resolvedLength,
        }).lean();
        savedOffsets = params?.sectionOffsets;
    }

    // When the length is inferred from an existing instance, keep its end date.
    // An explicit length (or endDate) means the caller wants a new span.
    const plan = generateDatePlan({
        startDate: instance.startDate,
        endDate: endDate || (lengthWasGiven ? undefined : instance.endDate),
        lengthWeeks: resolvedLength,
        sectionOffsets: savedOffsets,
        moduleCount: instance.modules?.length || 5,
        avsnittCounts: (instance.modules || []).map((m) => m.avsnitt?.length || 0),
    });

    if (!plan) throw new AppError("Invalid course dates", 400);
    return plan;
};

const loadInstance = async (instanceId) => {
    const instance = await CourseInstance.findById(instanceId);
    if (!instance) throw new AppError("Course instance not found", 404);
    return instance;
};

/**
 * Calculates a plan for an existing instance without writing anything.
 */
export const previewDatePlan = async (instanceId, options = {}) => {
    const instance = await loadInstance(instanceId);
    const plan = await buildPlan(instance, options);

    return {
        success: true,
        instance: {
            _id: instance._id,
            courseName: instance.courseName,
            startDate: formatDateOnly(plan.startDate),
            endDate: formatDateOnly(plan.endDate),
        },
        datePlan: serializeDatePlan(plan),
    };
};

/**
 * Persists the plan as the instance's authoritative section/module/Avsnitt
 * dates and keeps a snapshot in `datePlan` for later inspection.
 */
export const applyDatePlan = async (instanceId, options = {}) => {
    const instance = await loadInstance(instanceId);
    const plan = await buildPlan(instance, options);

    instance.endDate = plan.endDate;
    instance.sectionDates = plan.sectionDates;
    (instance.modules || []).forEach((module, index) => {
        const dates = plan.moduleDates[index];
        if (!dates) return;
        module.startDate = dates.startDate;
        module.endDate = dates.endDate;

        // Slice 4 / D2: persist the generated date on each Avsnitt. Clear any
        // stale value when the plan has no date for that position.
        const avsnittDates = plan.avsnittDates[index] || [];
        (module.avsnitt || []).forEach((avsnitt, avsnittIndex) => {
            avsnitt.plannedDate = avsnittDates[avsnittIndex] ?? null;
        });
    });
    instance.datePlan = { ...plan, appliedAt: new Date() };

    await instance.save();
    return {
        success: true,
        message: "Date plan applied",
        datePlan: serializeDatePlan(plan),
        instance,
    };
};
