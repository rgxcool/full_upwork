import mongoose from "mongoose";

const studentAttendedSchema = new mongoose.Schema(
    {
      _id: { type: mongoose.Schema.Types.ObjectId, auto: false },
      name: String,
      personalNumber: String,
      attended: { type: Boolean, default: false },
      // Per-student "Information" note from the slutprov modal. Without this
      // path Mongoose silently dropped the note on save (audit E1-19).
      additionalInfo: { type: String, default: "" },
      courseName: String,
      courseInstanceCode: String,
      courseInstanceId: String,
      enrollmentId: String,
      // Copy of Student.examAccommodations, kept in sync when a specialpedagog
      // updates them (PUT /students/:id/exam-accommodations).
      examAccommodations: {
        extraTime: { type: Number, default: 0 },
        computer: { type: Boolean, default: false },
        separateRoom: { type: Boolean, default: false },
        notes: String,
      },
    },
    { _id: false }
  );

  const extendedPropsSchema = new mongoose.Schema(
    {
      teacher: String,
      teacherId: mongoose.Schema.Types.ObjectId,
      type: String,
      examMunicipality: String,
      examLocation: String,
      examTime: String,
      examRoom: { type: String, default: "" },  // Configurable room
      students: [studentAttendedSchema],
      courseInstanceIds: [String],
      accommodations: {
        extraTime: { type: Number, default: 0 },   // Extra writing time in minutes
        computer: { type: Boolean, default: false },
        separateRoom: { type: Boolean, default: false },
      },
    },
    { _id: false }
  );
  
  const eventSchema = new mongoose.Schema({
    title: String,
    start: Date,
    color: String,
    extendedProps: extendedPropsSchema,
  });

export default mongoose.model("CalendarEvent", eventSchema, "calendar_events");
