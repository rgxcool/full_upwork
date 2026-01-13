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
                // Use teacher name as title, not course name - all events for same teacher/date should have same title
                existingEvent.title = teacherName || "Okänd lärare";
                await existingEvent.save();
                console.log(`✅ Added student ${student.name} to existing calendar event for ${dateKey}`);
            } else {
                console.log(`ℹ️ Student ${student.name} already in calendar event for ${dateKey}`);
            }
        } else {
            // Create new event - use teacher name as title, not course name
            const newEvent = new CalendarEvent({
                title: teacherName || "Okänd lärare",
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

/**
 * Syncs calendar events from a StudentEnrollment with slutprovDate
 * Groups students by date and teacherId (if available)
 * Creates or updates calendar events accordingly
 */
export async function syncCalendarEventFromEnrollment(enrollmentId) {
    try {
        const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
        const enrollment = await StudentEnrollment.findById(enrollmentId)
            .populate("studentId")
            .populate("mainCourseId")
            .populate({
                path: "teacherId",
                populate: { path: "userId", select: "username" },
            })
            .populate({
                path: "courseInstanceId",
                populate: { path: "responsibleTeacher", populate: { path: "userId", select: "username" } },
            });

        if (!enrollment || !enrollment.slutprovDate) {
            console.log(`⏭️ Enrollment ${enrollmentId} has no slutprovDate, skipping calendar sync`);
            return;
        }

        if (!enrollment.studentId) {
            console.log(`⏭️ Enrollment ${enrollmentId} has no student, skipping calendar sync`);
            return;
        }

        const student = enrollment.studentId;

        // Skip if student is a dropout
        if (student.dropout) {
            console.log(`⏭️ Student ${student._id} is a dropout, skipping calendar sync`);
            return;
        }

        // Create date at local midnight to avoid timezone shifts
        const examDate = new Date(enrollment.slutprovDate);
        const year = examDate.getFullYear();
        const month = examDate.getMonth();
        const day = examDate.getDate();
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; // YYYY-MM-DD

        // Get course name from mainCourseId or courseInstanceId
        let courseName = null;
        if (enrollment.mainCourseId && enrollment.mainCourseId.courseName) {
            courseName = enrollment.mainCourseId.courseName;
        } else if (enrollment.courseInstanceId && enrollment.courseInstanceId.courseName) {
            courseName = enrollment.courseInstanceId.courseName;
        }

        // Determine teacher info - ALWAYS prefer course instance responsibleTeacher if it exists
        // This ensures students in the same course instance are grouped together
        let teacherId = null;
        let teacherName = "Okänd lärare";
        let teacherColor = "#999999";

        if (enrollment.courseInstanceId?.responsibleTeacher) {
            // Course instance's responsible teacher takes priority
            const responsibleTeacher = enrollment.courseInstanceId.responsibleTeacher;
            teacherId = responsibleTeacher._id;
            if (responsibleTeacher.userId) {
                teacherName = responsibleTeacher.userId.username || teacherName;
            }
            teacherColor = responsibleTeacher.colorCode || teacherColor;
        } else if (enrollment.teacherId) {
            // Fallback to enrollment's teacherId if no course instance
            teacherId = enrollment.teacherId._id;
            if (enrollment.teacherId.userId) {
                teacherName = enrollment.teacherId.userId.username || teacherName;
            }
            teacherColor = enrollment.teacherId.colorCode || teacherColor;
        } else if (student.teacherId) {
            // Last resort: student's teacherId
            const studentTeacher = await Teacher.findById(student.teacherId).populate("userId", "username");
            if (studentTeacher) {
                teacherId = studentTeacher._id;
                if (studentTeacher.userId) {
                    teacherName = studentTeacher.userId.username || teacherName;
                }
                teacherColor = studentTeacher.colorCode || teacherColor;
            }
        }

        // Find or create calendar event for this group
        // Also check for courseInstanceId to group by course instance
        const courseInstanceId = enrollment.courseInstanceId?._id?.toString();
        const existingEvent = await CalendarEvent.findOne({
            start: {
                $gte: eventStartDate,
                $lte: eventEndDate,
            },
            "extendedProps.type": "slutprov",
            ...(teacherId ? { "extendedProps.teacherId": teacherId } : { "extendedProps.teacherId": { $exists: false } }),
            ...(courseInstanceId ? { "extendedProps.courseInstanceIds": courseInstanceId } : {}),
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
                // Use teacher name as title, not course name - all events for same teacher/date should have same title
                existingEvent.title = teacherName || "Okänd lärare";
                
                // Also update courseInstanceIds if missing
                if (courseInstanceId) {
                    const courseInstanceIds = existingEvent.extendedProps?.courseInstanceIds || [];
                    if (!courseInstanceIds.includes(courseInstanceId)) {
                        courseInstanceIds.push(courseInstanceId);
                        existingEvent.extendedProps.courseInstanceIds = courseInstanceIds;
                    }
                }
                
                await existingEvent.save();
                console.log(`✅ Added student ${student.name} to existing calendar event for ${dateKey}`);
            } else {
                console.log(`ℹ️ Student ${student.name} already in calendar event for ${dateKey}`);
            }
        } else {
            // Create new event with courseInstanceId in extendedProps for linking
            const extendedProps = {
                teacher: teacherName,
                teacherId: teacherId,
                type: "slutprov",
                examMunicipality: student.examMunicipality || "",
                examLocation: student.examLocation || "",
                examTime: student.examTime || "",
                students: [studentData],
            };
            
            // Add courseInstanceId to link the event to the course instance
            if (courseInstanceId) {
                extendedProps.courseInstanceIds = [courseInstanceId];
            }
            
            // Use teacher name as title, not course name - all events for same teacher/date should have same title
            const newEvent = new CalendarEvent({
                title: teacherName || "Okänd lärare",
                start: eventStartDate, // Use local midnight, not UTC
                color: "#ff6b6b", // Red color for exams
                extendedProps: extendedProps,
            });

            await newEvent.save();
            console.log(`✅ Created new calendar event for student ${student.name} on ${dateKey} from enrollment (courseInstance: ${courseInstanceId || 'none'})`);
        }
    } catch (error) {
        console.error(`❌ Error syncing calendar event for enrollment ${enrollmentId}:`, error);
        // Don't throw - this is a background sync operation
    }
}