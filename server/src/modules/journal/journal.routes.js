import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  balancesSchema,
  shiftOpenSchema,
  shiftCloseSchema,
  shiftListSchema,
  transferSendSchema,
  transferReceiveSchema,
  transferIdSchema,
  transferListSchema,
} from "./validators/journal.validator.js";

import balances from "./handlers/balances.handler.js";
import reconcile from "./handlers/reconcile.handler.js";
import shiftOpen from "./handlers/shiftOpen.handler.js";
import shiftClose from "./handlers/shiftClose.handler.js";
import shiftList from "./handlers/shiftList.handler.js";
import transferSend from "./handlers/transferSend.handler.js";
import transferReceive from "./handlers/transferReceive.handler.js";
import transferCancel from "./handlers/transferCancel.handler.js";
import transferList from "./handlers/transferList.handler.js";

const router = Router();

// KASSA (qo'sh yozuv jurnali).
//
// RUXSATLAR:
//   o'qish (qoldiq, ro'yxat)  -> finance.read
//   amal   (smena, inkassatsiya) -> finance.pay  (kassir ishi)
//   tekshiruv (reconcile)     -> system.admin_access (OWNER-ONLY)
//
// NEGA reconcile OWNER-ONLY: u ATAYLAB filial ko'lamisiz ishlaydi -
// butun tarmoq bo'yicha muvozanat va filiallararo tenglikni tekshiradi.
// Filial direktoriga berilsa u boshqa filiallarning qoldiq farqlarini
// ko'rardi.

// ── QOLDIQLAR ──
router.get(
  "/balances",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(balancesSchema),
  balances,
);

router.get(
  "/reconcile",
  requireAuth,
  requirePermission(PERMISSIONS.SYSTEM_ADMIN_ACCESS),
  reconcile,
);

// ── SMENA ──
router.get(
  "/shifts",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(shiftListSchema),
  shiftList,
);
router.post(
  "/shifts",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(shiftOpenSchema),
  shiftOpen,
);
router.post(
  "/shifts/:id/close",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(shiftCloseSchema),
  shiftClose,
);

// ── INKASSATSIYA ──
router.get(
  "/transfers",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(transferListSchema),
  transferList,
);
router.post(
  "/transfers",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(transferSendSchema),
  transferSend,
);
// QABUL QILISH - servis faqat QABUL QILUVCHI filialga ruxsat beradi
// (cashTransfer.service.js): jo'natuvchi o'zi "yetib keldi" deb
// belgilay olsa, yo'ldagi pul nazorati ma'nosini yo'qotardi.
router.post(
  "/transfers/:id/receive",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(transferReceiveSchema),
  transferReceive,
);
router.post(
  "/transfers/:id/cancel",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(transferIdSchema),
  transferCancel,
);

export default router;
