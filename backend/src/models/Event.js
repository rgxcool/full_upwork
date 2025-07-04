import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
    {
      _id: mongoose.Schema.Types.ObjectId,
      name: String,
      personalNumber: String,
      additionalInfo: String,
      attended: Boolean,
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
      students: [studentSchema],
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
