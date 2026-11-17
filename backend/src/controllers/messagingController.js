import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { validateParticipants, dispatchMessageEmailCopies } from "../services/messagingService.js";
import { userScopeFilter } from "../utils/tenantScope.js";
import { escapeRegExp } from "../utils/escapeRegExp.js";
import logger from "../utils/logger.js";
import { MESSAGING_STAFF_ROLES } from "../config/permissions.js";

const getCurrentUserId = (req) => req.userId || req.user?.userId || req.user?._id || req.user?.id;

const toObjectId = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : value;

export const getConversations = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("participants", "name email roles")
      .populate("studentId", "name")
      .sort({ lastMessageAt: -1 });

    if (conversations.length === 0) {
      return res.json([]);
    }

    const conversationIds = conversations.map((c) => c._id);
    const userIdObjectId = toObjectId(userId);

    const unreadRows = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: conversationIds },
          senderId: { $ne: userIdObjectId },
          "readBy.userId": { $ne: userIdObjectId },
        },
      },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]);

    const lastRows = await Message.aggregate([
      { $match: { conversationId: { $in: conversationIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$conversationId",
          body: { $first: "$body" },
          createdAt: { $first: "$createdAt" },
          senderId: { $first: "$senderId" },
        },
      },
    ]);

    const unreadByConv = new Map(unreadRows.map((r) => [String(r._id), r.count]));
    const lastByConv = new Map(lastRows.map((r) => [String(r._id), r]));

    const conversationsWithUnread = conversations.map((conv) => ({
      ...conv.toObject(),
      unreadCount: unreadByConv.get(String(conv._id)) || 0,
      lastMessage: lastByConv.get(String(conv._id)) || null,
    }));

    res.json(conversationsWithUnread);
  } catch (error) {
    logger.error({ err: error }, "Error fetching conversations");
    res.status(500).json({ message: "Internt serverfel vid hämtning av konversationer" });
  }
};

const DEFAULT_MESSAGE_PAGE_SIZE = 50;
const MAX_MESSAGE_PAGE_SIZE = 200;

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = getCurrentUserId(req);

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Konversationen hittades inte eller så har du inte tillgång till den" });
    }

    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_MESSAGE_PAGE_SIZE,
      MAX_MESSAGE_PAGE_SIZE
    );
    const before = req.query.before || null;

    const query = { conversationId };
    if (before) {
      const cursorMessage = await Message.findById(before).select("_id");
      if (!cursorMessage) {
        return res.status(400).json({ message: "Ogiltig markör för meddelandehämtning" });
      }
      query._id = { $lt: cursorMessage._id };
    }

    const page = await Message.find(query)
      .populate("senderId", "name email roles")
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasMore = page.length > limit;
    const slice = page.slice(0, limit).reverse();

    res.json({
      messages: slice,
      hasMore,
      nextBefore: hasMore && slice.length > 0 ? String(slice[0]._id) : null,
    });
  } catch (error) {
    logger.error({ err: error, conversationId: req.params.conversationId }, "Error fetching messages");
    res.status(500).json({ message: "Internt serverfel vid hämtning av meddelanden" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { participantIds, body, studentId, subject, conversationId } = req.body;
    const senderId = getCurrentUserId(req);

    if (!body || body.trim() === "") {
      return res.status(400).json({ message: "Meddelandetexten får inte vara tom" });
    }

    let conversation;

    if (conversationId) {
      conversation = await Conversation.findOne({
        _id: conversationId,
        participants: senderId,
      });

      if (!conversation) {
        return res.status(404).json({ message: "Konversationen hittades inte eller så har du inte tillgång till den" });
      }
    } else {
      if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ message: "Deltagare måste anges" });
      }

      const allParticipantIds = [...new Set([...participantIds, senderId.toString()])];
      const isValid = await validateParticipants(req.user, allParticipantIds);
      if (!isValid) {
        return res.status(403).json({ message: "Du har inte behörighet att starta en konversation med dessa deltagare" });
      }

      conversation = new Conversation({
        participants: allParticipantIds,
        studentId: studentId || null,
        subject: subject || "Inget ämne",
      });
      await conversation.save();
    }

    const newMessage = new Message({
      conversationId: conversation._id,
      senderId,
      body,
      readBy: [{ userId: senderId, readAt: new Date() }],
    });

    await newMessage.save();
    conversation.lastMessageAt = new Date();
    await conversation.save();

    await dispatchMessageEmailCopies({
      message: newMessage,
      conversation,
      senderName: req.user?.name,
    });

    res.status(201).json(newMessage);
  } catch (error) {
    logger.error({ err: error }, "Error sending message");
    res.status(500).json({ message: "Internt serverfel vid sändning av meddelande" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = getCurrentUserId(req);

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Konversationen hittades inte" });
    }

    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: userId },
        "readBy.userId": { $ne: userId },
      },
      {
        $push: { readBy: { userId, readAt: new Date() } },
      }
    );

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error, conversationId: req.params.conversationId }, "Error marking messages as read");
    res.status(500).json({ message: "Internt serverfel" });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const conversations = await Conversation.find({ participants: userId }).select("_id");
    const conversationIds = conversations.map((c) => c._id);

    const unreadCount = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      senderId: { $ne: userId },
      "readBy.userId": { $ne: userId },
    });

    res.json({ unreadCount });
  } catch (error) {
    logger.error({ err: error }, "Error getting unread count");
    res.status(500).json({ message: "Internt serverfel" });
  }
};

export const getRecipients = async (req, res) => {
  try {
    const user = req.user;
    const userRoles = user.roles || (user.role ? [user.role] : []);
    const userRole = user.role || userRoles[0];
    const staffRoles = MESSAGING_STAFF_ROLES;

    let query = { _id: { $ne: user._id } };

    if (staffRoles.includes(userRole)) {
      query.roles = { $in: [...staffRoles, "student"] };
    } else {
      query.roles = { $in: staffRoles };
    }

    // P17: tenant (kommun) isolation. Without this, any scoped staff account
    // could enumerate every user — name and email — in every other municipality
    // simply by listing the recipients they may message.
    const scope = userScopeFilter(user);
    if (Object.keys(scope).length > 0) {
      query.municipalities = { ...(query.municipalities || {}), ...scope.municipalities };
    }

    const search = (req.query?.search || "").trim();
    if (search) {
      // Escape user input: an unescaped term is treated as a regex pattern and
      // can be used to match every account (e.g. ".*") or to stall the query.
      const safe = escapeRegExp(search);
      query.$or = [
        { name: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ];
    }

    // `municipalities` is deliberately NOT selected: the filter is applied
    // server-side, and the client has no need to learn a colleague's tenant.
    const recipients = await User.find(query).select("name email roles").sort({ name: 1 });
    res.json(recipients);
  } catch (error) {
    logger.error({ err: error }, "Error fetching recipients");
    res.status(500).json({ message: "Internt serverfel vid hämtning av mottagare" });
  }
};
