import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import {
  studentTimelineSchema,
  groupTimelineSchema,
} from "./validators/list.validator.js";
import studentTimeline from "./handlers/studentTimeline.handler.js";
import groupTimeline from "./handlers/groupTimeline.handler.js";

const router = Router();

// Faoliyat tarixi (Arxiv) - owner ko'radi.
router.get(
  "/students/:studentId",
  requireAuth,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_READ),
  validate(studentTimelineSchema),
  studentTimeline,
);
router.get(
  "/groups/:groupId",
  requireAuth,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_READ),
  validate(groupTimelineSchema),
  groupTimeline,
);

export default router;
