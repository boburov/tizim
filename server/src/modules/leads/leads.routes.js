import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema,
  idSchema,
  statsSchema,
  createSchema,
  updateSchema,
  convertSchema,
  convertBulkSchema,
  reminderSchema,
} from "./validators/leads.validators.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import convert from "./handlers/convert.handler.js";
import convertBulk from "./handlers/convertBulk.handler.js";
import reminder from "./handlers/reminder.handler.js";
import stats from "./handlers/stats.handler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(listSchema),
  list,
);
router.get(
  "/stats",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(statsSchema),
  stats,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(idSchema),
  getById,
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_CREATE),
  validate(createSchema),
  create,
);
// Ko'p lidni bir martada aylantirish. "/:id/convert" dan OLDIN turadi -
// aks holda "convert-bulk" `:id` sifatida tutilib ketmasligi uchun (bu yerda
// yo'llar farq qiladi, lekin tartib niyatni ochiq ko'rsatadi).
router.post(
  "/convert-bulk",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(convertBulkSchema),
  convertBulk,
);
router.post(
  "/:id/convert",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(convertSchema),
  convert,
);
router.post(
  "/:id/reminder",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_UPDATE),
  validate(reminderSchema),
  reminder,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_UPDATE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(idSchema),
  remove,
);

export default router;
