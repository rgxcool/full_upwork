import express from "express";
import * as messagingController from "../controllers/messagingController.js";
import { isAuthenticated } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGate.js";

const router = express.Router();

router.use(
    ["/conversations", "/messages", "/unread-count", "/recipients"],
    requireFeature("MESSAGING")
);

router.get("/conversations", isAuthenticated, messagingController.getConversations);
router.get("/conversations/:conversationId/messages", isAuthenticated, messagingController.getMessages);
router.post("/messages", isAuthenticated, messagingController.sendMessage);
router.post("/conversations/:conversationId/read", isAuthenticated, messagingController.markAsRead);
router.get("/unread-count", isAuthenticated, messagingController.getUnreadCount);
router.get("/recipients", isAuthenticated, messagingController.getRecipients);

export default router;
