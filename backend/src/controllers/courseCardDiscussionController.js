import mongoose from "mongoose";
import CourseCardDiscussion from "../models/CourseCardDiscussion.js";
import CourseInstance from "../models/CourseInstance.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import logger from "../utils/logger.js";

const STAFF_ROLES = ["teacher", "admin", "systemadmin"];

const getRoles = (user) =>
    Array.isArray(user?.roles) && user.roles.length
        ? user.roles
        : user?.role
          ? [user.role]
          : [];

const isStaff = (user) => getRoles(user).some((role) => STAFF_ROLES.includes(role));

const parseModuleNumber = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
};

const findInstanceAndModule = async (instanceId, moduleNumber) => {
    if (!mongoose.isValidObjectId(instanceId)) return { error: "Ogiltigt kursinstans-id", status: 400 };
    const instance = await CourseInstance.findById(instanceId);
    if (!instance) return { error: "Kursinstansen hittades inte", status: 404 };
    if (!instance.modules?.some((module) => Number(module.moduleNumber) === moduleNumber)) {
        return { error: "Modulen hittades inte", status: 404 };
    }
    return { instance };
};

const findEnrolledStudent = async (user, courseInstanceId) => {
    if (!user?.email) return null;
    const student = await Student.findOne({ email: user.email }).select("_id name");
    if (!student) return null;
    const enrollment = await StudentEnrollment.findOne({
        studentId: student._id,
        courseInstanceId,
        status: { $ne: "dropped" },
    }).select("_id");
    return enrollment ? student : null;
};

const populateDiscussionQuery = (query) =>
    query
        .populate({ path: "createdBy", select: "username" })
        .populate({ path: "studentConversations.studentId", select: "name" })
        .populate({
            path: "studentConversations.messages.authorId",
            select: "username",
        })
        .sort({ createdAt: 1 })
        .lean();

export const getModuleDiscussions = async (req, res) => {
    try {
        const moduleNumber = parseModuleNumber(req.query.moduleNumber);
        if (!moduleNumber) return res.status(400).json({ error: "Ogiltigt modulnummer" });

        const { instance, error, status } = await findInstanceAndModule(
            req.params.instanceId,
            moduleNumber
        );
        if (!instance) return res.status(status).json({ error });

        const userIsStaff = isStaff(req.user);
        const userIsStudent = getRoles(req.user).includes("student");
        if (!userIsStaff && !userIsStudent) {
            return res.status(403).json({ error: "Saknar behörighet" });
        }

        const student = userIsStudent && !userIsStaff
            ? await findEnrolledStudent(req.user, instance._id)
            : null;
        if (userIsStudent && !userIsStaff && !student) {
            return res.status(403).json({ error: "Du är inte inskriven på kursen" });
        }

        const discussions = await populateDiscussionQuery(
            CourseCardDiscussion.find({
                courseInstanceId: instance._id,
                moduleNumber,
            })
        );
        const visibleDiscussions = userIsStaff
            ? discussions
            : discussions.map((discussion) => ({
                  ...discussion,
                  studentConversations: (discussion.studentConversations || []).filter(
                      (conversation) =>
                          String(conversation.studentId?._id || conversation.studentId) ===
                          String(student._id)
                  ),
              }));

        return res.json({ success: true, discussions: visibleDiscussions });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course-card discussions");
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const createModuleDiscussion = async (req, res) => {
    try {
        if (!isStaff(req.user)) {
            return res.status(403).json({ error: "Endast lärare och administratörer kan starta trådar" });
        }

        const moduleNumber = parseModuleNumber(req.body?.moduleNumber);
        const title = String(req.body?.title || "").trim();
        const promptText = String(req.body?.text || "").trim();
        const category = req.body?.category || "general";
        if (!moduleNumber) return res.status(400).json({ error: "Ogiltigt modulnummer" });
        if (!title || title.length > 160) {
            return res.status(400).json({ error: "Rubrik krävs (max 160 tecken)" });
        }
        if (!promptText || promptText.length > 5000) {
            return res.status(400).json({ error: "Meddelande krävs (max 5000 tecken)" });
        }
        if (!["assignment", "exam", "general"].includes(category)) {
            return res.status(400).json({ error: "Ogiltig trådkategori" });
        }

        const { instance, error, status } = await findInstanceAndModule(
            req.params.instanceId,
            moduleNumber
        );
        if (!instance) return res.status(status).json({ error });

        const discussion = await CourseCardDiscussion.create({
            courseInstanceId: instance._id,
            moduleNumber,
            title,
            category,
            promptText,
            createdBy: req.user.userId,
        });
        return res.status(201).json({ success: true, discussion });
    } catch (error) {
        logger.error({ err: error }, "Error creating course-card discussion");
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const addModuleDiscussionMessage = async (req, res) => {
    try {
        const { instanceId, discussionId } = req.params;
        const moduleNumber = parseModuleNumber(req.body?.moduleNumber);
        const text = String(req.body?.text || "").trim();
        const userIsStaff = isStaff(req.user);
        const userIsStudent = getRoles(req.user).includes("student");

        if (!mongoose.isValidObjectId(instanceId) || !mongoose.isValidObjectId(discussionId)) {
            return res.status(400).json({ error: "Ogiltigt id" });
        }
        if (!moduleNumber) return res.status(400).json({ error: "Ogiltigt modulnummer" });
        if (!text || text.length > 5000) {
            return res.status(400).json({ error: "Meddelande krävs (max 5000 tecken)" });
        }
        if (!userIsStaff && !userIsStudent) {
            return res.status(403).json({ error: "Saknar behörighet" });
        }

        const { instance, error, status } = await findInstanceAndModule(instanceId, moduleNumber);
        if (!instance) return res.status(status).json({ error });

        const discussion = await CourseCardDiscussion.findOne({
            _id: discussionId,
            courseInstanceId: instance._id,
            moduleNumber,
        });
        if (!discussion) return res.status(404).json({ error: "Tråden hittades inte" });

        let student = null;
        if (!userIsStaff) {
            student = await findEnrolledStudent(req.user, instance._id);
            if (!student) {
                return res.status(403).json({ error: "Du är inte inskriven på kursen" });
            }
        } else {
            if (!mongoose.isValidObjectId(req.body?.studentId)) {
                return res.status(400).json({ error: "Välj en elev att svara" });
            }
            student = await Student.findById(req.body.studentId).select("_id");
            if (!student) return res.status(404).json({ error: "Eleven hittades inte" });
            const enrollment = await StudentEnrollment.findOne({
                studentId: student._id,
                courseInstanceId: instance._id,
                status: { $ne: "dropped" },
            }).select("_id");
            if (!enrollment) {
                return res.status(400).json({ error: "Eleven är inte inskriven på kursen" });
            }
        }

        let conversation = discussion.studentConversations.find(
            (entry) => String(entry.studentId) === String(student._id)
        );
        if (!conversation && userIsStaff) {
            return res.status(404).json({ error: "Elevens tråd hittades inte" });
        }
        if (!conversation) {
            conversation = { studentId: student._id, messages: [] };
            discussion.studentConversations.push(conversation);
        }

        const lastMessage = conversation.messages.at(-1);
        if (userIsStaff && lastMessage?.authorRole !== "student") {
            return res.status(409).json({ error: "Det finns inget obesvarat elevmeddelande" });
        }
        if (!userIsStaff && lastMessage?.authorRole === "student") {
            return res.status(409).json({
                error: "Vänta på lärarens svar innan du skickar ett nytt meddelande",
            });
        }

        conversation.messages.push({
            authorId: req.user.userId,
            authorRole: userIsStaff ? "staff" : "student",
            text,
            at: new Date(),
        });
        await discussion.save();
        return res.json({ success: true });
    } catch (error) {
        if (error.name === "VersionError") {
            return res.status(409).json({
                error: "Meddelandet har uppdaterats. Hämta tråden och försök igen",
            });
        }
        logger.error({ err: error }, "Error adding course-card discussion message");
        return res.status(500).json({ error: "Internal server error" });
    }
};
