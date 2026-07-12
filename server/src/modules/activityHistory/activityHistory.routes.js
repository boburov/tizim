import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
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
  requireRole(ROLES.OWNER),
  validate(studentTimelineSchema),
  studentTimeline,
);
router.get(
  "/groups/:groupId",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(groupTimelineSchema),
  groupTimeline,
);

export default router;
