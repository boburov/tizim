import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { statementSchema } from "./validators/statement.validator.js";
import statement from "./handlers/statement.handler.js";
import myStatement from "./handlers/myStatement.handler.js";

const router = Router();

// O'Z moliyaviy tarixi. Ruxsat TEKSHIRILMAYDI - odam o'z balansini
// ko'radi. "/:userId" dan OLDIN turishi shart, aks holda "me" `:userId`
// sifatida tutilib, 24 belgilik ID validatsiyasida yiqilardi.
router.get("/me", requireAuth, myStatement);

// BOSHQA odamning moliyaviy tarixi.
//
// Ikki ruxsatdan BIRI yetarli (OR): o'quvchi moliyasini ko'radigan xodim
// (finance.read) va maosh ko'radigan xodim (salary.read) odatda turli
// odamlar. Bitta manzil ikkala rolga ham xizmat qiladi, shuning uchun
// har ikkalasiga ochiq. Ko'rilayotgan odam ko'lamdan tashqarida bo'lsa
// servis 404 qaytaradi (userBranchCondition).
router.get(
  "/:userId",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ, PERMISSIONS.SALARY_READ),
  validate(statementSchema),
  statement,
);

export default router;
