import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import stats from "./handlers/stats.handler.js";
import compare from "./handlers/compare.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

// O'QISH: filial tanlagichi uchun har qanday auth'langan foydalanuvchi
// o'z filiallarini ko'radi (ro'yxat allowedBranchIds bo'yicha kesiladi).
router.get("/", requireAuth, validate(listSchema), list);
// "/:id" dan OLDIN: aks holda "compare" filial ID deb o'qilardi.
router.get("/compare", requireAuth, requirePermission(PERMISSIONS.BRANCHES_READ), compare);
router.get("/:id", requireAuth, validate(idSchema), getById);
router.get("/:id/stats", requireAuth, validate(idSchema), stats);

// YOZISH: faqat SYSTEM_ADMIN_ACCESS bilan.
//
// IMTIYOZ OSHIRISHDAN HIMOYA: filial yaratish/tahrirlash ataylab
// branches.* ruxsatiga EMAS, system.admin_access'ga bog'langan.
// Aks holda filial direktori o'ziga yangi filial ochib, keyin o'zini
// unga biriktirib, ko'lamini kengaytira olardi.
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.SYSTEM_ADMIN_ACCESS),
  requirePermission(PERMISSIONS.BRANCHES_CREATE),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SYSTEM_ADMIN_ACCESS),
  requirePermission(PERMISSIONS.BRANCHES_UPDATE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SYSTEM_ADMIN_ACCESS),
  requirePermission(PERMISSIONS.BRANCHES_DELETE),
  validate(idSchema),
  remove,
);

export default router;
