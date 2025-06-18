import { Router } from "express";
import ActionPlan from "../models/ActionPlan.js";
import Notification from "../models/Notification.js";
const router = Router();

router.post("/save-actionplan", async (req, res) => {
  const plan = req.body;
  await ActionPlan.create(plan);
  // Markera notification för eleven/kursen som klar
  await Notification.updateOne(
    { studentId: plan.studentId, courseId: plan.courseId, type: "action_plan_required", resolved: false },
    { $set: { resolved: true } }
  );
  res.send("Handlingsplan sparad!");
});

export default router;