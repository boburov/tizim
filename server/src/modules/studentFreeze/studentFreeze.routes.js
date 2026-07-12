import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import {
  freezeSchema,
  unfreezeSchema,
  studentIdSchema,
} from "./validators/freeze.validator.js";
import freeze from "./handlers/freeze.handler.js";
import unfreeze from "./handlers/unfreeze.handler.js";
import list from "./handlers/list.handler.js";

const router = Router();

// Muzlatish - arxivlash kabi FAQAT owner boshqaradi.
router.get(
  "/:studentId",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(studentIdSchema),
  list,
);
router.post(
  "/:studentId/freeze",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(freezeSchema),
  freeze,
);
router.post(
  "/:studentId/unfreeze",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(unfreezeSchema),
  unfreeze,
);

export default router;
