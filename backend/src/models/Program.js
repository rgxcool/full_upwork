import mongoose from 'mongoose';

const ProgramSchema = new mongoose.Schema({
  programName: { type: String, required: true },
  programCourses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  programCoursePackages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CoursePackage' }]
});

export default mongoose.model('Program', ProgramSchema);
