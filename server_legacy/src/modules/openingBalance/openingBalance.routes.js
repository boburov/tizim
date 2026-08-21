import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import {
  createOpeningSchema,
  listOpeningSchema,
} from "./validators/openingBalance.validator.js";
import create from "./handlers/create.handler.js";
import list from "./handlers/list.handler.js";
import repair from "./handlers/repair.handler.js";

const router = Router();

// BOSHLANG'ICH QOLDIQ - filialga o'z ma'lumotini kiritish imkoni.
//
// Yozuv O'ZGARMAS: bir marta kiritilgach uni tahrirlash ham, o'chirish
// ham mumkin emas (model darajasida immutable + unique). Xato kiritilgan
// summani faqat korreksiya tranzaksiyasi bilan tuzatib bo'ladi.
//
// Shuning uchun u umumiy `finance.manage` ga EMAS, alohida
// `finance.opening_balance` kalitiga bog'langan - owner uni istagan
// roldan alohida olib qo'ya oladi.
//
// FILIAL CHEGARASI: create.handler.js dagi assertTargetInScope (boshqa
// filial odamiga yozib bo'lmaydi) va servisdagi branchFilter (ro'yxatda
// boshqa filial ko'rinmaydi).
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_OPENING_BALANCE),
  validate(createOpeningSchema),
  create,
);

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_OPENING_BALANCE),
  validate(listOpeningSchema),
  list,
);

// TIKLASH - OWNER-ONLY BO'LIB QOLADI.
// Materializatsiyasi yiqilganlarni qayta urinadi va PUL YOZADI. Bu
// kundalik amal emas, avariya vositasi: butun markaz bo'yicha ishlaydi
// va noto'g'ri paytda bosilsa qayta hisoblab yuboradi.
router.post("/repair", requireAuth, requireRole(ROLES.OWNER), repair);

export default router;
