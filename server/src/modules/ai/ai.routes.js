import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema,
  actionCenterSchema,
  bySubjectsSchema,
  idParamSchema,
  dismissSchema,
  updateConfigSchema,
  recomputeSchema,
} from "./validators/insight.validator.js";

import list from "./handlers/list.handler.js";
import actionCenter from "./handlers/actionCenter.handler.js";
import bySubjects from "./handlers/bySubjects.handler.js";
import acknowledge from "./handlers/acknowledge.handler.js";
import resolve from "./handlers/resolve.handler.js";
import dismiss from "./handlers/dismiss.handler.js";
import getConfig from "./handlers/getConfig.handler.js";
import updateConfig from "./handlers/updateConfig.handler.js";
import recompute from "./handlers/recompute.handler.js";

const router = Router();

// --- O'qish (AI_READ) ---
router.get("/insights", requireAuth, requirePermission(PERMISSIONS.AI_READ), validate(listSchema), list);
router.get(
  "/action-center",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(actionCenterSchema),
  actionCenter,
);
// POST, chunki 500 tagacha ID query string'ga sig'maydi (ro'yxat sahifasi
// barcha o'quvchilarning badge'ini bitta so'rovda oladi).
router.post(
  "/insights/by-subjects",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(bySubjectsSchema),
  bySubjects,
);

// --- Holatni o'zgartirish (AI_READ yetarli: bu kundalik ish oqimi) ---
router.post(
  "/insights/:id/ack",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(idParamSchema),
  acknowledge,
);
router.post(
  "/insights/:id/resolve",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(idParamSchema),
  resolve,
);
router.post(
  "/insights/:id/dismiss",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(dismissSchema),
  dismiss,
);

// --- Sozlamalar (AI_CONFIG - eng tor huquq: vaznlar BARCHA ballni siljitadi) ---
router.get("/config", requireAuth, requirePermission(PERMISSIONS.AI_CONFIG), getConfig);
router.put(
  "/config",
  requireAuth,
  requirePermission(PERMISSIONS.AI_CONFIG),
  validate(updateConfigSchema),
  updateConfig,
);
router.post(
  "/recompute",
  requireAuth,
  requirePermission(PERMISSIONS.AI_CONFIG),
  validate(recomputeSchema),
  recompute,
);

export default router;
