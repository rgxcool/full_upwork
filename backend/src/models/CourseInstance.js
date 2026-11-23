import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { courseModuleSchema } from "./courseModuleSchema.js";
import { PLAN_LENGTHS } from "../utils/datePlan.js";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_VALID_SLUTPROV_YEAR = 1970;

// Optional snapshot of a 5/10/20 week plan applied by the date-planning UI.
// The legacy `sectionDates` and module dates remain the dates that drive
// students' course cards; this field records the plan that produced them.
const datePlanSchema = new mongoose.Schema(
    {
        lengthWeeks: { type: Number, enum: PLAN_LENGTHS },
        startDate: Date,
        endDate: Date,
        sectionOffsets: [Number],
        sectionDates: [Date],
        moduleDates: [
            {
                startDate: Date,
                endDate: Date,
                _id: false,
            },
        ],
        // Generated per-module Avsnitt planned dates (Slice 4).
        avsnittDates: [[Date]],
        source: String,
        appliedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const moduleContentEntrySchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    instructions: { type: String, default: "" },
    isHiddenFromStudent: { type: Boolean, default: false },
  },
  { _id: false },
);

const activityFeedItemSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    text: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
    // Begränsa till en specifik kursinstans om satt
    courseInstanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseInstance",
    },
  },
  { _id: false },
);

const courseInstanceSchema = new mongoose.Schema(
  {
    // Referens till huvudkursen (statisk definition)
    mainCourseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    // Tidsperiod
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    // Instansspecifika kursuppgifter
    courseName: { type: String, required: true },
    courseCode: { type: String, required: true },
    coursePoints: { type: String },
    courseExtent: { type: String },

    // Versionering och status
    version: { type: String, default: "1.0" },
    isActive: { type: Boolean, default: true },

    // Metadata och personal
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    responsibleTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
    },
    assistantTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
    },
    notes: { type: String },
    slutprovDate: { type: Date },

    // Kopierade moduler från kursmall / kurskort
    modules: { type: [courseModuleSchema], default: [] },
    courseTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseTemplate",
    },
    cardContent: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Startdatum per modul/sektion
    sectionDates: [{ type: Date }],

    // Optional saved plan from the date-planning preview/apply endpoints
    datePlan: { type: datePlanSchema, default: null },

    // Kurskortsinnehåll per modulnyckel (strängnycklar i MongooseMap)
    content: {
      type: Map,
      of: moduleContentEntrySchema,
      default: () => new Map(),
    },

    // Aktivitetsflöde / anslagstavla
    activityFeed: {
      type: [activityFeedItemSchema],
      default: [],
    },

    // Beräknas vid läsning från AssignmentSubmission (modulnyckel -> antal)
    submittedAssignments: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },

    // Beräknas vid läsning utifrån studieperiodsordning (studentId -> studieperiod)
    sectionPositions: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },

    // Statistik
    enrollmentCount: { type: Number, default: 0 },
    completionCount: { type: Number, default: 0 },
    dropoutCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

// Validering: slutdatum måste vara efter startdatum
courseInstanceSchema.pre("validate", function () {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    this.invalidate("endDate", "End date must be after start date");
  }
});

// Beräkna slutprovDate automatiskt om det saknas eller är ogiltigt
courseInstanceSchema.pre("save", async function () {
  if (this._slutprovDateExplicitlySet) {
    delete this._slutprovDateExplicitlySet;
    return;
  }

  const parsedDate = this.slutprovDate ? new Date(this.slutprovDate) : null;
  const hasValidSlutprovDate =
    parsedDate !== null &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.getFullYear() > MIN_VALID_SLUTPROV_YEAR;

  if (hasValidSlutprovDate || !this.responsibleTeacher || !this.endDate) {
    return;
  }

  try {
    const { calculateSlutprovDate } =
      await import("../utils/slutprovDateCalculator.js");
    const calculatedDate = await calculateSlutprovDate(
      this.responsibleTeacher,
      this.endDate,
    );

    if (calculatedDate) {
      this.slutprovDate = calculatedDate;
      logger.info(
        {
          courseName: this.courseName,
          calculatedDate: calculatedDate.toDateString(),
        },
        "Auto-calculated slutprovDate for course",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Error calculating slutprovDate");
  }
});

// Instansmetoder
courseInstanceSchema.methods.overlapsWith = function (startDate, endDate) {
  return this.startDate < endDate && this.endDate > startDate;
};

courseInstanceSchema.methods.getDuration = function () {
  return Math.ceil((this.endDate - this.startDate) / MS_PER_DAY);
};

// Index
courseInstanceSchema.index({ mainCourseId: 1, startDate: 1, endDate: 1 });
courseInstanceSchema.index({ startDate: 1, endDate: 1 });
courseInstanceSchema.index({ isActive: 1 });
courseInstanceSchema.index(
  { mainCourseId: 1, startDate: 1, endDate: 1, responsibleTeacher: 1 },
  { unique: true },
);

export default mongoose.model(
  "CourseInstance",
  courseInstanceSchema,
  "courseInstances",
);
