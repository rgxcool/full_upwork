import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { validateParticipants, dispatchMessageEmailCopies } from "../services/messagingService.js";
import logger from "../utils/logger.js";
import { getUserMunicipalities, hasGlobalScope, municipalityInScope } from "../utils/tenantScope.js";

/**
 * Convert a value to mongoose ObjectId if it's a valid ObjectId string.
 */
const toObjectId = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : value;

/**
 * Get all conversations for the authenticated user.
 * 
 * Conversations are scoped to the user's allowed municipalities.
 * Global users (with no municipality restriction) may access any conversation
 * they participate in. Scoped users may only access conversations in their allowed
 * municipalities.
 * 
 * Unread counts and newest-message previews are loaded with two batched
 * aggregations instead of a per-conversation query pair, so the endpoint stays
 * O(1) in the number of conversations (important at ~1000+ users).
 */
export const getConversations = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    // Determine the user's municipality scope
    const userMunicipalities = getUserMunicipalities(req.user);
    const hasGlobalAccess = hasGlobalScope(req.user);

    // Build the participant filter
    const participantFilter = { participants: userId };

    // Get conversations where user is a participant
    let conversations = await Conversation.find(participantFilter)
      .populate("participants", "name email roles municipalities")
      .populate("studentId", "name personalNumber")
      .sort({ lastMessageAt: -1 });

    // Apply municipality scoping for non-global users
    if (!hasGlobalAccess && userMunicipalities.length > 0) {
      // Filter conversations to only those in the user's allowed municipalities
      conversations = conversations.filter((conv) => {
        const convMunicipalities = conv.municipalities || [];
        // Conversation is accessible if it has no municipality restriction
        // OR if it intersects with the user's allowed municipalities
        if (convMunicipalities.length === 0) return true;
        return convMunicipalities.some((m) => userMunicipalities.includes(m));
      });
    }

    if (conversations.length === 0) {
      return res.json([]);
    }

    const conversationIds = conversations.map((c) => c._id);
    const userIdObjectId = new mongoose.Types.ObjectId(userId);

    // One batched query: unread count per conversation.
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

    // One batched query: the newest message per conversation.
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
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get a specific conversation by ID.
 * Ensures the user is a participant and respects municipality scoping.
 */
export const getConversation = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const { conversationId } = req.params;

    // Find conversation where user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    }).populate("participants", "name email roles municipalities")
      .populate("studentId", "name personalNumber");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found or access denied" });
    }

    // Apply municipality scoping for non-global users
    if (!hasGlobalScope(req.user)) {
      const userMunicipalities = getUserMunicipalities(req.user);
      const convMunicipalities = conversation.municipalities || [];
      if (convMunicipalities.length > 0 && !convMunicipalities.some((m) => userMunicipalities.includes(m))) {
        return res.status(403).json({ message: "Access denied: conversation outside your municipality scope" });
      }
    }

    // Get messages in this conversation
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .populate("senderId", "name email");

    res.json({
      conversation,
      messages,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching conversation");
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Create a new message in a conversation.
 * Ensures proper tenant scoping and participant validation.
 */
export const createMessage = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const { conversationId, body } = req.body;

    if (!conversationId || !body) {
      return res.status(400).json({ message: "Conversation ID and body are required" });
    }

    // Find the conversation and verify user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(403).json({ message: "Not a participant in this conversation" });
    }

    // Apply municipality scoping for non-global users
    if (!hasGlobalScope(req.user)) {
      const userMunicipalities = getUserMunicipalities(req.user);
      const convMunicipalities = conversation.municipalities || [];
      if (convMunicipalities.length > 0 && !convMunicipalities.some((m) => userMunicipalities.includes(m))) {
        return res.status(403).json({ message: "Cannot send messages outside your municipality scope" });
      }
    }

    // Create the message
    const message = new Message({
      conversationId,
      senderId: new mongoose.Types.ObjectId(userId),
      body,
      readBy: [
        {
          userId: new mongoose.Types.ObjectId(userId),
          readAt: new Date(),
        },
      ],
    });

    await message.save();

    // Update conversation's lastMessageAt
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: message.createdAt,
    });

    // Populate sender info for response
    await message.populate("senderId", "name email");

    // Dispatch email copies if configured
    try {
      await dispatchMessageEmailCopies(message, conversation);
    } catch (emailError) {
      logger.warn({ err: emailError }, "Failed to dispatch message email copies");
    }

    res.status(201).json(message);
  } catch (error) {
    logger.error({ err: error }, "Error creating message");
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Mark a message as read.
 */
export const markMessageRead = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Add user to readBy if not already there
    const alreadyRead = message.readBy.some(
      (entry) => entry.userId.toString() === userId
    );

    if (!alreadyRead) {
      message.readBy.push({
        userId: new mongoose.Types.ObjectId(userId),
        readAt: new Date(),
      });
      await message.save();
    }

    res.json(message);
  } catch (error) {
    logger.error({ err: error }, "Error marking message as read");
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get unread count for the user's conversations.
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    // Get user's conversations (already scoped by tenant in getConversations logic)
    const conversations = await Conversation.find({ participants: userId }).select("_id");

    const conversationIds = conversations.map((c) => c._id);
    if (conversationIds.length === 0) {
      return res.json({ unreadCount: 0 });
    }

    const userIdObjectId = new mongoose.Types.ObjectId(userId);

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

    const unreadByConv = new Map(unreadRows.map((r) => [String(r._id), r.count]));
    let totalUnread = 0;

    for (const [, count] of unreadByConv) {
      totalUnread += count;
    }

    res.json({ unreadCount: totalUnread });
  } catch (error) {
    logger.error({ err: error }, "Error getting unread count");
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get messages for a conversation.
 * Returns conversation messages sorted by creation date.
 */
export const getMessages = async (req, res) => {
  const { conversationId } = req.params;
  try {
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ messages, conversationId });
  } catch (error) {
    logger.error({ err: error, conversationId }, "Error getting messages");
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Send a new message to a conversation.
 */
export const sendMessage = async (req, res) => {
  const { conversationId, content, senderId } = req.body;
  try {
    const message = await Message.create({
      conversationId,
      content,
      senderId: senderId || req.userId,
      createdAt: new Date(),
    });
    res.json({ message, conversationId });
  } catch (error) {
    logger.error({ err: error, conversationId, senderId }, "Error sending message");
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Mark a message as read.
 */
export const markAsRead = async (req, res) => {
  const { messageId } = req.params;
  try {
    const message = await Message.findByIdAndUpdate(
      messageId,
      { read: true, readBy: { userId: req.userId } },
      { new: true }
    );
    res.json({ message });
  } catch (error) {
    logger.error({ err: error, messageId }, "Error marking message as read");
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get recipients of a conversation.
 */
export const getRecipients = async (req, res) => {
  const { conversationId } = req.params;
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    res.json({ recipients: conversation.participants });
  } catch (error) {
    logger.error({ err: error, conversationId }, "Error getting recipients");
    res.status(500).json({ message: "Server error" });
  }
};
