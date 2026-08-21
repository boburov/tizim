import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

// ESKI `requireMultiBranch` TO'SIG'I OLIB TASHLANDI.
//
// U `MULTI_BRANCH=false` bo'lganda ikkinchi filial ochishni taqiqlardi
// va TUZOQ hosil qilardi: "ko'p filialga o'tish" uchun avval serverni
// qayta sozlab, qayta ishga tushirish kerak edi.
//
// Endi rejim BAZADAN aniqlanadi (branchAccess.helper.js: isMultiBranch)
// va ikkinchi filial ochilgan zahoti markaz o'zi ko'p filialli bo'ladi.
// Filial ochish - mahsulot qarori, deploy qarori emas.
//
// Himoya yo'qolmadi: yozish baribir SYSTEM_ADMIN_ACCESS talab qiladi.

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import stats from "./handlers/stats.handler.js";
import compare from "./handlers/compare.handler.js";
import delegationOptions from "./handlers/delegationOptions.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

// O'QISH: filial tanlagichi uchun har qanday auth'langan foydalanuvchi
// o'z filiallarini ko'radi (ro'yxat allowedBranchIds bo'yicha kesiladi).
router.get("/", requireAuth, validate(listSchema), list);
// "/:id" dan OLDIN: aks holda "compare" filial ID deb o'qilardi.
router.get("/compare", requireAuth, requirePermission(PERMISSIONS.BRANCHES_READ), compare);
// Delegatsiya katalogi - statik metama'lumot (turlar, ruxsat etilgan
// rejimlar). "/:id" dan OLDIN bo'lishi SHART - aks holda "delegation-options"
// filial ID sifatida o'qilardi.
router.get(
  "/delegation-options",
  requireAuth,
  requirePermission(PERMISSIONS.BRANCHES_READ),
  delegationOptions,
);
router.get("/:id", requireAuth, validate(idSchema), getById);
// Statistika filial rahbariyatining ism/loginini ham qaytaradi, shuning
// uchun ruxsat SHART - ilgari har qanday auth'langan foydalanuvchi (hatto
// o'quvchi) istalgan filial ko'rsatkichini o'qiy olardi.
router.get(
  "/:id/stats",
  requireAuth,
  requirePermission(PERMISSIONS.BRANCHES_READ),
  validate(idSchema),
  stats,
);

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
