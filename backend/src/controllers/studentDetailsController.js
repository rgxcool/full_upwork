import Student from "../models/Student.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import Program from "../models/Program.js";
import User from "../models/User.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import ExamAttendance from "../models/ExamAttendance.js";
import Provning from "../models/Provning.js";
import Teacher from "../models/Teacher.js";
import Notification from "../models/Notification.js";
import mongoose from "mongoose";

/**
 * Student Details Controller
 * Handles fetching and populating student details, including education and enrollments.
 * Uses Student, Course, CoursePackage, Program, User, StudentEnrollment, and CourseInstance models.
 */
/**
 * Get student details with populated references and enrollment statistics.
 * @async
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const getStudentDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const student = await Student.findById(id)
            .populate("teacherId", "name email")
            .select("+commentHistory.seenBy");

        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const user = await User.findOne({ email: student.email });

        // Manually populate education references (if present as array)
        const populatedStudent = student.toObject();
        populatedStudent.user = user ? user.toObject() : null;
        
        const existingEducation = Array.isArray(populatedStudent.education)
            ? populatedStudent.education
            : [];

        for (const edu of existingEducation) {
            if (!edu?.refId) continue;

            try {
                let populatedRef = null;

                if (edu.type === "Course") {
                    populatedRef = await Course.findById(edu.refId).select(
                        "courseName courseCode coursePoints courseExtent"
                    );
                } else if (edu.type === "CoursePackage") {
                    populatedRef = await CoursePackage.findById(
                        edu.refId
                    ).select("coursePackageName coursePackageCode");
                } else if (edu.type === "Program") {
                    populatedRef = await Program.findById(edu.refId).select(
                        "programName"
                    );
                }

                if (populatedRef) {
                    edu.refId = populatedRef;
                }
            } catch (populateError) {
                console.error(`Error populating ${edu.type}:`, populateError);
                edu.refId = null;
            }
        }

        // Fetch enrollments from the new course versioning system
        const enrollments = await StudentEnrollment.find({ studentId: id })
            .populate("courseInstanceId")
            .populate("mainCourseId")
            .populate("teacherId", "name email")
            .sort({ startDate: -1 });

        // Convert enrollments to education format for display
        const enrollmentEducation = enrollments.map((enrollment) => ({
            _id: enrollment._id,
            type: "Course",
            refId: enrollment.mainCourseId,
            name: enrollment.mainCourseId?.courseName,
            startDate: enrollment.startDate,
            endDate: enrollment.endDate,
            status: enrollment.status,
            grade: enrollment.grade,
            comments: enrollment.notes,
            enrollmentId: enrollment._id,
            courseInstanceId: enrollment.courseInstanceId?._id,
            courseInstance: enrollment.courseInstanceId,
            addedAt: enrollment.createdAt,
            addedBy: enrollment.teacherId?.name || "System",
            isEnrollment: true, // Flag to identify this came from enrollment system
        }));

        // Use only enrollment data as education entries
        populatedStudent.education = enrollmentEducation;

        // Add enrollment statistics
        populatedStudent.enrollmentStats = {
            totalEnrollments: enrollments.length,
            activeEnrollments: enrollments.filter(
                (e) => e.status === "enrolled" || e.status === "active"
            ).length,
            completedEnrollments: enrollments.filter(
                (e) => e.status === "completed"
            ).length,
            droppedEnrollments: enrollments.filter(
                (e) => e.status === "dropped"
            ).length,
        };

        res.json(populatedStudent);
    } catch (error) {
        console.error("❌ Error fetching student details:", error);
        res.status(500).json({ error: "Failed to fetch student details" });
    }
};

/**
 * Update student information (admin+ only)
 */
export const updateStudentInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.user;
        const updates = req.body;

        // Check permissions
        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to edit student information",
            });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Allowed fields for editing
        const allowedFields = [
            "name",
            "personalNumber",
            "phone",
            "email",
            "exam",
            "additionalInfo",
            "specialNeeds",
            "startDate",
            "endDate",
            "finalExamDate",
            "examMunicipality",
            "examLocation",
            "examTime",
            "municipality",
            "dropout",
        ];

        // Apply updates
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                student[field] = updates[field];
            }
        }

        // Track APL status changes with history
        if (
            typeof updates.aplStatus === "string" &&
            updates.aplStatus !== student.aplStatus
        ) {
            student.aplStatusHistory = student.aplStatusHistory || [];
            student.aplStatusHistory.push({
                status: updates.aplStatus,
                changedAt: new Date(),
                changedBy: req.user?.name || req.user?.userId || "system",
            });
            student.aplStatus = updates.aplStatus;
        }

        // Log the changes
        const changeLog = {
            timestamp: new Date(),
            changedBy: req.user.userId,
            changedByRole: req.user.role,
            changes: Object.keys(updates).filter((key) =>
                allowedFields.includes(key)
            ),
            previousValues: {},
            newValues: {},
        };

        // Store previous values for audit
        for (const field of changeLog.changes) {
            changeLog.previousValues[field] = student[field];
            changeLog.newValues[field] = updates[field];
        }

        // Add to change history if not already present
        if (!student.changeHistory) {
            student.changeHistory = [];
        }
        student.changeHistory.push(changeLog);

        await student.save();

        res.json({
            success: true,
            message: "Student information updated successfully",
            student,
            changeLog,
        });
    } catch (error) {
        console.error("❌ Error updating student information:", error);
        res.status(500).json({ error: "Failed to update student information" });
    }
};

/**
 * Add comment to student (teacher+ only)
 */
export const addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const { userId, role, name } = req.user;

        // Check permissions
        if (!["teacher", "admin", "systemadmin"].includes(role)) {
            return res
                .status(403)
                .json({ error: "Insufficient permissions to add comments" });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const newComment = {
            _id: new mongoose.Types.ObjectId(),
            comment,
            author: name,
            authorId: userId,
            authorRole: role,
            date: new Date(),
            seenBy: [new mongoose.Types.ObjectId(userId)],
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            deletedByRole: null,
        };

        student.commentHistory.unshift(newComment);
        await student.save();

        res.json({
            success: true,
            message: "Comment added successfully",
            comment: newComment,
            commentHistory: student.commentHistory,
        });
    } catch (error) {
        console.error("❌ Error adding comment:", error);
        res.status(500).json({ error: "Failed to add comment" });
    }
};

/**
 * Edit comment (author or admin+ only)
 */
export const editComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { comment } = req.body;
        const { userId, role } = req.user;

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const commentIndex = student.commentHistory.findIndex(
            (c) => c._id.toString() === commentId && !c.isDeleted
        );

        if (commentIndex === -1) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const targetComment = student.commentHistory[commentIndex];

        // Check permissions: author can edit, admin+ can edit any
        if (
            targetComment.authorId.toString() !== userId &&
            !["admin", "systemadmin"].includes(role)
        ) {
            return res
                .status(403)
                .json({ error: "You can only edit your own comments" });
        }

        // Store previous version for audit
        const previousComment = targetComment.comment;

        // Update comment
        targetComment.comment = comment;
        targetComment.editedAt = new Date();
        targetComment.editedBy = userId;
        targetComment.editedByRole = role;
        targetComment.previousVersion = previousComment;

        await student.save();

        res.json({
            success: true,
            message: "Comment edited successfully",
            comment: targetComment,
        });
    } catch (error) {
        console.error("❌ Error editing comment:", error);
        res.status(500).json({ error: "Failed to edit comment" });
    }
};

/**
 * Delete comment (author or admin+ only)
 */
export const deleteComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { userId, role } = req.user;

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const commentIndex = student.commentHistory.findIndex(
            (c) => c._id.toString() === commentId && !c.isDeleted
        );

        if (commentIndex === -1) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const targetComment = student.commentHistory[commentIndex];

        // Check permissions: author can delete, admin+ can delete any
        if (
            targetComment.authorId.toString() !== userId &&
            !["admin", "systemadmin"].includes(role)
        ) {
            return res
                .status(403)
                .json({ error: "You can only delete your own comments" });
        }

        // Soft delete - mark as deleted but keep for audit
        targetComment.isDeleted = true;
        targetComment.deletedAt = new Date();
        targetComment.deletedBy = userId;
        targetComment.deletedByRole = role;
        targetComment.deletedContent = targetComment.comment; // Store content for audit
        targetComment.comment = "[DELETED]";

        await student.save();

        res.json({
            success: true,
            message: "Comment deleted successfully",
            deletedComment: {
                _id: targetComment._id,
                deletedAt: targetComment.deletedAt,
                deletedBy: targetComment.deletedBy,
                deletedContent: targetComment.deletedContent,
            },
        });
    } catch (error) {
        console.error("❌ Error deleting comment:", error);
        res.status(500).json({ error: "Failed to delete comment" });
    }
};

/**
 * Mark comment as seen
 */
export const markCommentSeen = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { userId } = req.user;

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const comment = student.commentHistory.find(
            (c) => c._id.toString() === commentId && !c.isDeleted
        );

        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        // Add user to seenBy if not already there
        if (!comment.seenBy.some((id) => id.toString() === userId)) {
            comment.seenBy.push(new mongoose.Types.ObjectId(userId));
            await student.save();
        }

        res.json({
            success: true,
            message: "Comment marked as seen",
        });
    } catch (error) {
        console.error("❌ Error marking comment as seen:", error);
        res.status(500).json({ error: "Failed to mark comment as seen" });
    }
};

/**
 * Get student change history (admin+ only)
 */
export const getChangeHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.user;

        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to view change history",
            });
        }

        const student = await Student.findById(id).select("changeHistory");
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        res.json({
            success: true,
            changeHistory: student.changeHistory || [],
        });
    } catch (error) {
        console.error("❌ Error fetching change history:", error);
        res.status(500).json({ error: "Failed to fetch change history" });
    }
};

/**
 * Set student as dropout (Avbrott) - flags student, removes from APL/exams, sends notification
 */
export const setStudentDropout = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, userId, name } = req.user;

        // Check permissions - admin+ only
        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to set student as dropout",
            });
        }

        const student = await Student.findById(id).populate({
            path: "teacherId",
            populate: { path: "userId", select: "_id username email" }
        });
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }
        
        console.log(`🔍 Student fetched: ${student.name} (ID: ${id})`);
        console.log(`🔍 Student.teacherId:`, student.teacherId);
        console.log(`🔍 Student.teacher (string):`, student.teacher);

        // If already dropout, we still need to ensure notification exists
        // (in case it was deleted or teacher changed)
        const wasAlreadyDropout = student.dropout;
        if (wasAlreadyDropout) {
            console.log(`ℹ️ Student ${student.name} is already marked as dropout, checking notification...`);
        }

        // Set dropout flag (only if not already set)
        if (!student.dropout) {
            student.dropout = true;
        }

        // Log the change (only if dropout was actually changed)
        if (!wasAlreadyDropout) {
            const changeLog = {
                timestamp: new Date(),
                changedBy: userId,
                changedByRole: role,
                changes: ["dropout"],
                previousValues: { dropout: false },
                newValues: { dropout: true },
            };

            if (!student.changeHistory) {
                student.changeHistory = [];
            }
            student.changeHistory.push(changeLog);
        }

        // Save student (even if already dropout, to ensure data is fresh)
        await student.save();

        // Remove from APL lists (by excluding from APL queries - handled automatically)
        // The APL board already filters by excluding dropout students

        // Remove from ExamAttendance records (delete future exam attendance)
        const now = new Date();
        const deletedExamAttendance = await ExamAttendance.deleteMany({
            studentId: id,
            examDate: { $gte: now },
        });
        console.log(`🗑️ Deleted ${deletedExamAttendance.deletedCount} future exam attendance records for student ${student.name}`);

        // Remove from Provning (exam registrations) - delete or mark as denied
        const deletedProvning = await Provning.deleteMany({
            studentId: id,
            status: { $in: ["intresse", "scheduled"] },
        });
        console.log(`🗑️ Deleted ${deletedProvning.deletedCount} exam registrations for student ${student.name}`);

        // Send notification to responsible teacher
        let teacherRecord = null;
        let teacherUserId = null;
        
        console.log(`🔍 Looking for teacher for student ${student.name} (ID: ${id})`);
        console.log(`🔍 student.teacherId:`, student.teacherId);
        console.log(`🔍 student.teacher (string):`, student.teacher);
        
        if (student.teacherId) {
            // If teacherId is populated (as object), use it directly
            if (student.teacherId._id) {
                teacherRecord = student.teacherId;
                console.log(`✅ Found populated teacherId:`, teacherRecord._id);
            } else {
                // If teacherId is just an ObjectId, fetch the teacher
                teacherRecord = await Teacher.findById(student.teacherId);
                console.log(`✅ Fetched teacher by ID:`, teacherRecord ? teacherRecord._id : 'NOT FOUND');
            }
            
            if (teacherRecord) {
                // Get the userId from the teacher record
                if (teacherRecord.userId) {
                    // userId might be ObjectId or populated object
                    teacherUserId = teacherRecord.userId._id || teacherRecord.userId;
                    console.log(`✅ Found userId from teacher record:`, teacherUserId);
                } else {
                    // If userId is not populated, fetch it
                    const populatedTeacher = await Teacher.findById(teacherRecord._id).populate("userId");
                    if (populatedTeacher && populatedTeacher.userId) {
                        teacherUserId = populatedTeacher.userId._id || populatedTeacher.userId;
                        console.log(`✅ Found userId after populate:`, teacherUserId);
                    } else {
                        console.log(`⚠️ Could not find userId for teacher ${teacherRecord._id}`);
                    }
                }
            }
        } else if (student.teacher && typeof student.teacher === "string") {
            // Try to find teacher by name string
            console.log(`🔍 Looking for teacher by name: "${student.teacher}"`);
            const teacherUser = await User.findOne({ name: student.teacher });
            if (teacherUser) {
                console.log(`✅ Found user by name:`, teacherUser._id);
                // Find the Teacher record for this user
                teacherRecord = await Teacher.findOne({ userId: teacherUser._id });
                if (teacherRecord) {
                    teacherUserId = teacherUser._id;
                    console.log(`✅ Found Teacher record for user:`, teacherRecord._id);
                } else {
                    console.log(`⚠️ No Teacher record found for user ${teacherUser._id}`);
                }
            } else {
                console.log(`⚠️ No user found with name "${student.teacher}"`);
            }
        } else {
            console.log(`⚠️ No teacherId or teacher name found for student ${student.name}`);
        }

        if (teacherRecord && teacherRecord._id) {
            console.log(`📧 Creating notification for teacher ${teacherRecord._id} (user: ${teacherUserId})`);
            console.log(`   - Teacher record ID:`, teacherRecord._id.toString());
            console.log(`   - Teacher user ID:`, teacherUserId ? teacherUserId.toString() : 'MISSING');
            console.log(`   - Student ID:`, id);
            
            // Check if notification already exists (regardless of resolution status)
            // We want to prevent duplicates, not check if it's resolved
            const existingNotification = await Notification.findOne({
                type: "dropout",
                teacher: teacherRecord._id,
                "meta.studentId": id,
            });

            console.log(`🔍 Checking for existing notification...`);
            console.log(`   - Query: { type: "dropout", teacher: ${teacherRecord._id.toString()}, "meta.studentId": ${id} }`);
            console.log(`   - Existing notification found:`, existingNotification ? existingNotification._id : 'NONE');

            if (!existingNotification) {
                // Ensure teacher._id is properly converted to ObjectId
                const teacherObjectId = mongoose.Types.ObjectId.isValid(teacherRecord._id)
                    ? new mongoose.Types.ObjectId(teacherRecord._id)
                    : teacherRecord._id;
                
                const notification = new Notification({
                    type: "dropout",
                    teacher: teacherObjectId, // Store Teacher._id for query matching
                    createdByAdmin: userId, // Store the admin who created this notification
                    message: `Eleven ${student.name} har markerats som avbrott (inaktiv).`,
                    meta: {
                        teacherId: teacherUserId, // Store User._id for reference
                        studentId: id,
                        url: `/student/${id}`,
                    },
                    resolved: false,
                    resolvedByUsers: [], // Initialize empty array for per-user resolution
                });
                await notification.save();
                console.log(`✅ Created dropout notification:`, notification._id);
                console.log(`   - notification.teacher (Teacher._id):`, notification.teacher ? notification.teacher.toString() : 'MISSING');
                console.log(`   - notification.meta.teacherId (User._id):`, notification.meta.teacherId ? notification.meta.teacherId.toString() : 'MISSING');
                console.log(`   - notification.meta.studentId:`, notification.meta.studentId ? notification.meta.studentId.toString() : 'MISSING');
                console.log(`   - notification.type:`, notification.type);
                console.log(`   - notification.resolved:`, notification.resolved);
                
                // Verify the notification was saved correctly
                const verifyNotification = await Notification.findById(notification._id);
                console.log(`🔍 Verification - Saved notification:`, {
                    _id: verifyNotification._id.toString(),
                    type: verifyNotification.type,
                    teacher: verifyNotification.teacher ? verifyNotification.teacher.toString() : 'MISSING',
                    meta_teacherId: verifyNotification.meta?.teacherId ? verifyNotification.meta.teacherId.toString() : 'MISSING',
                    meta_studentId: verifyNotification.meta?.studentId ? verifyNotification.meta.studentId.toString() : 'MISSING',
                    resolved: verifyNotification.resolved
                });
            } else {
                // Notification already exists - reset resolvedByUsers so all users see it again
                console.log(`ℹ️ Dropout notification already exists:`, existingNotification._id);
                console.log(`   - Existing notification teacher:`, existingNotification.teacher ? existingNotification.teacher.toString() : 'MISSING');
                console.log(`   - Existing notification meta.teacherId:`, existingNotification.meta?.teacherId ? existingNotification.meta.teacherId.toString() : 'MISSING');
                console.log(`   - Current resolvedByUsers:`, existingNotification.resolvedByUsers ? existingNotification.resolvedByUsers.map(id => id.toString()) : 'MISSING');
                
                // Reset resolvedByUsers so all users see the notification again
                // Also update createdByAdmin to the current admin
                existingNotification.resolvedByUsers = [];
                existingNotification.resolved = false; // Also reset legacy field
                existingNotification.createdByAdmin = userId; // Update to current admin
                await existingNotification.save();
                console.log(`✅ Reset notification ${existingNotification._id} - cleared resolvedByUsers and updated createdByAdmin to ${userId}`);
            }
        } else {
            console.log(`❌ No teacher found for student ${student.name}, skipping notification`);
            console.log(`   - teacherRecord:`, teacherRecord);
            console.log(`   - teacherUserId:`, teacherUserId);
        }

        res.json({
            success: true,
            message: "Student marked as dropout successfully",
            student,
            deletedExamAttendance: deletedExamAttendance.deletedCount,
            deletedProvning: deletedProvning.deletedCount,
        });
    } catch (error) {
        console.error("❌ Error setting student as dropout:", error);
        res.status(500).json({ error: "Failed to set student as dropout" });
    }
};

/**
 * Remove dropout status from student (admin+ only)
 */
export const removeStudentDropout = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, userId, name } = req.user;

        // Check permissions - admin+ only
        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to remove dropout status",
            });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const wasDropout = student.dropout;
        if (!wasDropout) {
            return res.json({
                success: true,
                message: "Student is not marked as dropout",
                student,
            });
        }

        // Remove dropout flag
        student.dropout = false;

        // Log the change
        const changeLog = {
            timestamp: new Date(),
            changedBy: userId,
            changedByRole: role,
            changes: ["dropout"],
            previousValues: { dropout: true },
            newValues: { dropout: false },
        };

        if (!student.changeHistory) {
            student.changeHistory = [];
        }
        student.changeHistory.push(changeLog);

        await student.save();

        // Resolve any existing dropout notifications for this student
        const resolvedNotifications = await Notification.updateMany(
            {
                type: "dropout",
                "meta.studentId": id,
                resolved: false,
            },
            {
                $set: {
                    resolved: true,
                    resolvedBy: userId,
                    resolvedAt: new Date(),
                },
            }
        );

        console.log(`✅ Removed dropout status for student ${student.name}`);
        console.log(`   - Resolved ${resolvedNotifications.modifiedCount} dropout notifications`);

        res.json({
            success: true,
            message: "Dropout status removed successfully",
            student,
            resolvedNotifications: resolvedNotifications.modifiedCount,
        });
    } catch (error) {
        console.error("❌ Error removing dropout status:", error);
        res.status(500).json({ error: "Failed to remove dropout status" });
    }
};
