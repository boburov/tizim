import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  createSchema,
  listSchema,
  idParamSchema,
} from "./validators/lessonCancellation.validator.js";
import create from "./handlers/create.handler.js";
import list from "./handlers/list.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

// RUXSAT: ATTENDANCE_MANAGE - dars o'tdi/o'tmadi degan qaror davomat
// bilan bir toifadagi ish. Lekin moliyaviy ta'siri borligi uchun oddiy
// "davomat belgilash" (ATTENDANCE_RECORD) yetarli emas: o'qituvchi o'zi
// kelmagan darsni bekor qilib, o'z maoshiga ta'sir qila olmasligi kerak.
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(listSchema),
  list,
);
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  validate(createSchema),
  create,
);
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  validate(idParamSchema),
  remove,
);

export default router;
