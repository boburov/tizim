import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema, updateSchema } from "./validators/create.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

// XONALAR - filialning FIZIK resursi, ya'ni hamma amal filial ichida.
//
// `classes.*` ruxsatlari constants/permissions.js da ancha vaqtdan beri
// bor edi, lekin model ham route ham yo'q edi - o'lik ruxsat guruhi.
// Ular filial ichi ruxsatlari (permissionScope.js), ya'ni filial rahbari
// o'z xonalarini o'zi boshqaradi.
//
// FILIAL CHEGARASI servis qatlamida: branchFilter (ro'yxat),
// isBranchAllowed (bitta xona), resolveBranchForWrite (yaratish).
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.CLASSES_READ),
  validate(listSchema),
  list,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.CLASSES_READ),
  validate(idSchema),
  getById,
);
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.CLASSES_CREATE),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.CLASSES_UPDATE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.CLASSES_DELETE),
  validate(idSchema),
  remove,
);

export default router;
