import CalendarEvent from "../models/Event.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

/**
 * Syncs calendar events for students with finalExamDate
 * Groups students by date and teacherId (if available)
 * Creates or updates calendar events accordingly
 */
export async function syncCalendarEventsForStudent(studentId) {
    try {
        const student = await Student.findById(studentId)
            .populate({
                path: "teacherId",
                populate: { path: "userId", select: "username" },
            })
            .populate({
                path: "education.refId",
                model: "Course",
                select: "courseName courseCode",
            });

        if (!student || !student.finalExamDate) {
            console.log(`⏭️ Student ${studentId} has no finalExamDate, skipping calendar sync`);
            return;
        }

        // Skip if student is a dropout
        if (student.dropout) {
            console.log(`⏭️ Student ${studentId} is a dropout, skipping calendar sync`);
            return;
        }

        const examDate = new Date(student.finalExamDate);
        const dateKey = examDate.toISOString().split("T")[0]; // YYYY-MM-DD

        // Find course name from education
        let courseName = null;
        if (Array.isArray(student.education)) {
            const edu = student.education.find((e) => {
                if (e.type !== "Course" || !e.startDate || !e.endDate) return false;
                const start = new Date(e.startDate).setHours(0, 0, 0, 0);
                const end = new Date(e.endDate).setHours(0, 0, 0, 0);
                const exam = new Date(dateKey).setHours(0, 0, 0, 0);
                return exam >= start && exam <= end && e.refId && typeof e.refId === "object" && e.refId.courseName;
            });
            if (edu && edu.refId && typeof edu.refId === "object" && edu.refId.courseName) {
                courseName = edu.refId.courseName;
            }
        }

        // If no course found, try to find from enrollments
        if (!courseName) {
            const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
            const enrollment = await StudentEnrollment.findOne({
                studentId: student._id,
                endDate: {
                    $gte: new Date(dateKey),
                    $lt: new Date(new Date(dateKey).getTime() + 24 * 60 * 60 * 1000),
                },
            }).populate("mainCourseId");
            if (enrollment && enrollment.mainCourseId && enrollment.mainCourseId.courseName) {
                courseName = enrollment.mainCourseId.courseName;
            }
        }

        // Determine teacher info
        let teacherId = null;
        let teacherName = "Okänd lärare";
        let teacherColor = "#999999";

        if (student.teacherId) {
            teacherId = student.teacherId._id;
            if (student.teacherId.userId) {
                teacherName = student.teacherId.userId.username || teacherName;
            }
            teacherColor = student.teacherId.colorCode || teacherColor;
        }

        // Create a key for grouping: teacherId_date or just date if no teacher
        const groupKey = teacherId ? `${teacherId}_${dateKey}` : `no_teacher_${dateKey}`;

        // Find or create calendar event for this group
        const existingEvent = await CalendarEvent.findOne({
            start: {
                $gte: new Date(dateKey + "T00:00:00.000Z"),
                $lt: new Date(dateKey + "T23:59:59.999Z"),
            },
            "extendedProps.type": "slutprov",
            ...(teacherId ? { "extendedProps.teacherId": teacherId } : { "extendedProps.teacherId": { $exists: false } }),
        });

        const studentData = {
            _id: student._id,
            name: student.name,
            personalNumber: student.personalNumber,
            additionalInfo: student.additionalInfo || "",
            attended: student.attendedExam || false,
            courseName: courseName || "Okänd kurs",
        };

        if (existingEvent) {
            // Update existing event - add student if not already present
            const students = existingEvent.extendedProps?.students || [];
            const studentExists = students.some((s) => s._id.toString() === student._id.toString());

            if (!studentExists) {
                students.push(studentData);
                existingEvent.extendedProps.students = students;
                existingEvent.title = `Slutprov${courseName ? ` - ${courseName}` : ""} (${students.length})`;
                await existingEvent.save();
                console.log(`✅ Added student ${student.name} to existing calendar event for ${dateKey}`);
            } else {
                console.log(`ℹ️ Student ${student.name} already in calendar event for ${dateKey}`);
            }
        } else {
            // Create new event
            const newEvent = new CalendarEvent({
                title: `Slutprov${courseName ? ` - ${courseName}` : ""} (1)`,
                start: new Date(dateKey + "T00:00:00.000Z"),
                color: "#ff6b6b", // Red color for exams
                extendedProps: {
                    teacher: teacherName,
                    teacherId: teacherId,
                    type: "slutprov",
                    examMunicipality: student.examMunicipality || "",
                    examLocation: student.examLocation || "",
                    examTime: student.examTime || "",
                    students: [studentData],
                },
            });

            await newEvent.save();
            console.log(`✅ Created new calendar event for student ${student.name} on ${dateKey}`);
        }
    } catch (error) {
        console.error(`❌ Error syncing calendar event for student ${studentId}:`, error);
        // Don't throw - this is a background sync operation
    }
}

/**
 * Syncs calendar events for all students with finalExamDate
 * Useful for bulk operations or fixing missing events
 */
export async function syncAllCalendarEvents() {
    try {
        const students = await Student.find({
            finalExamDate: { $ne: null },
            dropout: { $ne: true },
        }).select("_id");

        console.log(`🔄 Syncing calendar events for ${students.length} students...`);

        for (const student of students) {
            await syncCalendarEventsForStudent(student._id);
        }

        console.log(`✅ Finished syncing calendar events`);
    } catch (error) {
        console.error("❌ Error syncing all calendar events:", error);
        throw error;
    }
}
