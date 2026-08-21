import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";

import {
  priceListSchema,
  setPriceSchema,
  clearPriceSchema,
  resolveSchema,
} from "./validators/price.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import priceList from "./handlers/priceList.handler.js";
import priceSet from "./handlers/priceSet.handler.js";
import priceClear from "./handlers/priceClear.handler.js";
import priceResolve from "./handlers/priceResolve.handler.js";

const router = Router();

// ── NARX MATRITSASI ──
//
// "/:id" dan OLDIN turishi shart bo'lgan yo'l yo'q (hammasi "/:id/..."
// ostida), lekin GURUH narxini yechish "/resolve/..." prefiksida -
// u kurs ID'si deb o'qilmasligi uchun aniq segment bilan boshlanadi.
//
// RUXSATLAR ATAYLAB HAR XIL:
//   o'qish  -> courses.read   (guruh yaratishda narx ko'rinishi kerak)
//   yozish  -> finance.manage (narx MOLIYAVIY qaror, katalog nomi emas)
//
// NEGA courses.manage EMAS: u owner-only. Filial rahbari O'Z filiali
// uchun istisno narx belgilay olishi kerak - bu aynan "global bo'lmagan
// ish". Bazaviy narxni ham u o'zgartira olmasin degan bo'lsangiz,
// setPrice ichidagi tekshiruvni kuchaytiring; hozir filial istisnosi
// isBranchAllowed bilan, bazaviysi esa finance.manage bilan cheklangan.
router.get(
  "/resolve/:groupId",
  requireAuth,
  requirePermission(PERMISSIONS.COURSES_READ),
  validate(resolveSchema),
  priceResolve,
);

// ── O'QISH: `courses.read` (filial ichi ruxsati) ──
// Guruh yaratishda kurs tanlanadi, ya'ni filial direktori ham ko'rishi shart.
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.COURSES_READ),
  validate(listSchema),
  list,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.COURSES_READ),
  validate(idSchema),
  getById,
);

// ── YOZISH: `courses.manage` (OWNER-ONLY) ──
//
// Katalog MARKAZLASHGAN. Bu ruxsat constants/permissionScope.js da
// OWNER_ONLY_PERMISSIONS ro'yxatida - ya'ni filial rahbariga hech qachon
// tegmaydi va uni alohida qo'shish ham kerak emas.
//
// NEGA: filiallar o'zicha nom o'ylab topsa ("IELTS", "Ayltis", "IELTS
// intensiv"), tarmoq hisobotini birlashtirib bo'lmasdi - bir xil kurs
// uch xil qator bo'lib chiqardi.
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.COURSES_MANAGE),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.COURSES_MANAGE),
  validate(updateSchema),
  update,
);
// O'CHIRISH EMAS, NOFAOL QILISH: kurs guruhlarga bog'langan va yo'qolsa
// tarixiy hisobot jimgina o'zgarardi (qarang: courses.service.js).
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.COURSES_MANAGE),
  validate(idSchema),
  remove,
);

// ── Narx: kurs bo'yicha matritsa ──
router.get(
  "/:id/prices",
  requireAuth,
  requirePermission(PERMISSIONS.COURSES_READ),
  validate(priceListSchema),
  priceList,
);
router.put(
  "/:id/prices",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(setPriceSchema),
  priceSet,
);
router.delete(
  "/:id/prices/:branchId",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(clearPriceSchema),
  priceClear,
);

export default router;
