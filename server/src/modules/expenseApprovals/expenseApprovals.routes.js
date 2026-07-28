import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { decisionSchema, idSchema } from "./validators/decision.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import pendingCount from "./handlers/pendingCount.handler.js";
import approve from "./handlers/approve.handler.js";
import reject from "./handlers/reject.handler.js";
import cancel from "./handlers/cancel.handler.js";
import retry from "./handlers/retry.handler.js";

const router = Router();

// O'QISH: moliyani ko'rish huquqi yetarli. Ro'yxat filial bo'yicha
// avtomatik kesiladi (branchFilter), ya'ni direktor faqat o'z filialining
// so'rovlarini ko'radi.
router.get("/", requireAuth, requirePermission(PERMISSIONS.FINANCE_READ), validate(listSchema), list);
router.get("/pending-count", requireAuth, requirePermission(PERMISSIONS.FINANCE_READ), pendingCount);
router.get("/:id", requireAuth, requirePermission(PERMISSIONS.FINANCE_READ), validate(idSchema), getById);

// QAROR: faqat finance.approve ruxsati bilan.
// Servis ichida qo'shimcha himoya: o'z so'rovini o'zi tasdiqlay olmaydi.
router.post(
  "/:id/approve",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_APPROVE),
  validate(decisionSchema),
  approve,
);
router.post(
  "/:id/reject",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_APPROVE),
  validate(decisionSchema),
  reject,
);
router.post(
  "/:id/retry",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_APPROVE),
  validate(idSchema),
  retry,
);

// BEKOR QILISH: so'rovchining o'zi (servis ichida tekshiriladi).
// Shuning uchun finance.pay yetarli - tasdiqlash huquqi shart emas.
router.post(
  "/:id/cancel",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(idSchema),
  cancel,
);

export default router;
