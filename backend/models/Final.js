const mongoose = require("mongoose");

const slutprovSchema = new mongoose.Schema({
    _id: ObjectId,
    courseId: ObjectId,
    examDate: Date,
    teacherId: ObjectId,
    students: [
        {
            studentId: ObjectId,
            status: String, // 'registered', 'completed', 'absent'
        },
    ],
});

export default mongoose.model("Slutprov", slutprovSchema);
