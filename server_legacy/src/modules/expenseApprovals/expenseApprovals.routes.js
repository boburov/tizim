import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import requireAnyPermission from "../../middleware/requireAnyPermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { decisionSchema, idSchema } from "./validators/decision.validator.js";
import { bulkSchema } from "./validators/bulk.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import pendingCount from "./handlers/pendingCount.handler.js";
import stats from "./handlers/stats.handler.js";
import bulkDecide from "./handlers/bulkDecide.handler.js";
import approve from "./handlers/approve.handler.js";
import reject from "./handlers/reject.handler.js";
import cancel from "./handlers/cancel.handler.js";
import retry from "./handlers/retry.handler.js";

const router = Router();

// Route qatlamidagi ruxsat faqat "eshik" - u ikki kategoriyadan (moliya /
// sozlama) BIRIGA huquqi borlarni kiritadi. Haqiqiy kategoriya tekshiruvi
// SERVIS ichida (categoryCondition / assertCanDecide), chunki bitta endpoint
// ikkala kategoriyaga xizmat qiladi va ularning huquqi har xil.
const CAN_READ = [PERMISSIONS.FINANCE_READ, PERMISSIONS.APPROVALS_DECIDE_CONFIG];
const CAN_DECIDE = [PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.APPROVALS_DECIDE_CONFIG];

// O'QISH: ro'yxat filial bo'yicha avtomatik kesiladi (branchFilter), ya'ni
// direktor faqat o'z filialining so'rovlarini ko'radi. Kategoriya bo'yicha
// esa servis kesadi - moliya huquqi bor odam sozlama so'rovlarini ko'rmaydi
// (va aksincha), lekin O'Z so'rovini har kim ko'radi.
router.get("/", requireAuth, requireAnyPermission(...CAN_READ), validate(listSchema), list);
router.get("/pending-count", requireAuth, requireAnyPermission(...CAN_READ), pendingCount);
// KPI kartalari. "/:id" dan OLDIN turishi shart - aks holda "stats" ID deb
// o'qilib, 404 qaytarardi.
router.get("/stats", requireAuth, requireAnyPermission(...CAN_READ), stats);
router.get("/:id", requireAuth, requireAnyPermission(...CAN_READ), validate(idSchema), getById);

// OMMAVIY QAROR: route qatlami faqat "eshik", har bir ID uchun huquq va
// o'zini-o'zi tasdiqlash taqiqi servis ichida qayta tekshiriladi.
router.post(
  "/bulk-approve",
  requireAuth,
  requireAnyPermission(...CAN_DECIDE),
  validate(bulkSchema),
  bulkDecide("approve"),
);
router.post(
  "/bulk-reject",
  requireAuth,
  requireAnyPermission(...CAN_DECIDE),
  validate(bulkSchema),
  bulkDecide("reject"),
);

// QAROR: kategoriyaga mos ruxsat SERVISDA tekshiriladi (finance.approve yoki
// approvals.decide_config). Servis ichida qo'shimcha himoya: o'z so'rovini
// o'zi tasdiqlay olmaydi.
router.post(
  "/:id/approve",
  requireAuth,
  requireAnyPermission(...CAN_DECIDE),
  validate(decisionSchema),
  approve,
);
router.post(
  "/:id/reject",
  requireAuth,
  requireAnyPermission(...CAN_DECIDE),
  validate(decisionSchema),
  reject,
);
router.post(
  "/:id/retry",
  requireAuth,
  requireAnyPermission(...CAN_DECIDE),
  validate(idSchema),
  retry,
);

// BEKOR QILISH: so'rovchining o'zi (servis ichida tekshiriladi).
// Shuning uchun tasdiqlash huquqi shart emas - so'rov YARATA oladigan
// har qanday rol (chiqim uchun finance.pay, maosh sharti uchun groups.update)
// o'z so'rovini bekor qila olishi kerak.
router.post(
  "/:id/cancel",
  requireAuth,
  requireAnyPermission(PERMISSIONS.FINANCE_PAY, PERMISSIONS.GROUPS_UPDATE),
  validate(idSchema),
  cancel,
);

export default router;

// Eslatma: HTTP yo'li ("/expense-approvals") ATAYLAB o'zgartirilmadi -
// frontend shu manzilga murojaat qiladi. routes/index.js qo'shimcha
// "/approvals" taxallusini ham ulaydi (yangi, umumiy nom).
export { router };
