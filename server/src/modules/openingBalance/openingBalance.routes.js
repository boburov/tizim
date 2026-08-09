import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import {
  createOpeningSchema,
  listOpeningSchema,
} from "./validators/openingBalance.validator.js";
import create from "./handlers/create.handler.js";
import list from "./handlers/list.handler.js";
import repair from "./handlers/repair.handler.js";

const router = Router();

// FAQAT OWNER. Boshlang'ich qoldiq O'ZGARMAS yozuv: bir marta kiritilgach
// uni tahrirlash ham, o'chirish ham mumkin emas (model darajasida
// immutable + unique). Xato kiritilgan summani faqat korreksiya
// tranzaksiyasi bilan tuzatib bo'ladi. Shuning uchun bu tugma boshqa
// hech kimga ochilmaydi - qaytarib bo'lmaydigan amal.
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(createOpeningSchema),
  create,
);

router.get(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(listOpeningSchema),
  list,
);

// Materializatsiyasi yiqilganlarni qayta urinish (pul yozadi).
router.post("/repair", requireAuth, requireRole(ROLES.OWNER), repair);

export default router;
