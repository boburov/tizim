import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { listSchema } from "./validators/list.validator.js";
import {
  updateSchema,
  idSchema,
  permanentDeleteSchema,
} from "./validators/update.validator.js";
import { setPasswordSchema } from "./validators/password.validator.js";
import { setRoleSchema } from "./validators/role.validator.js";
import {
  createStaffSchema,
  setBranchesSchema,
} from "./validators/createStaff.validator.js";
import { archiveActionSchema } from "./validators/archive.validator.js";
import { checkAvailabilitySchema } from "./validators/checkAvailability.validator.js";
import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import restore from "./handlers/restore.handler.js";
import permanentRemove from "./handlers/permanentRemove.handler.js";
import groupHistory from "./handlers/groupHistory.handler.js";
import getPassword from "./handlers/getPassword.handler.js";
import setPassword from "./handlers/setPassword.handler.js";
import setRole from "./handlers/setRole.handler.js";
import createStaff from "./handlers/createStaff.handler.js";
import staffStats from "./handlers/staffStats.handler.js";
import checkAvailability from "./handlers/checkAvailability.handler.js";
import setBranches from "./handlers/setBranches.handler.js";

const router = Router();

// XODIM (direktor/administrator) yaratish - login/parol + filial + rol.
// Ikkita ruxsat talab qilinadi: odam yaratish VA rol biriktirish, chunki
// bu amal ikkalasini birdan bajaradi.
router.post(
  "/staff",
  requireAuth,
  requirePermission(PERMISSIONS.TEACHERS_CREATE),
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  validate(createStaffSchema),
  createStaff,
);

// Xodimning filial biriktiruvini o'zgartirish. "/:id" dan OLDIN.
router.patch(
  "/:id/branches",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  validate(setBranchesSchema),
  setBranches,
);

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  validate(listSchema),
  list,
);

// XODIMLAR statistikasi (rol kesimida). "/:id" dan OLDIN - aks holda uni
// "/:id" yutib yuboradi va 404 "Foydalanuvchi topilmadi" qaytadi.
//
// Ruxsat GET "/" bilan AYNAN bir xil: kartochkalar va ro'yxat bir vaqtda
// ko'rinishi kerak, aks holda biri 403 bo'lib sahifa yarim bo'sh chiqardi.
router.get(
  "/staff-stats",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  staffStats,
);
// Telefon/login bandligini OLDINDAN tekshirish. "/:id" dan OLDIN turishi
// shart - aks holda "check-availability" `:id` sifatida tutilardi.
// Ruxsat: odam yarata oladigan xodim (u allaqachon ro'yxatni ko'radi,
// ya'ni yangi ma'lumot oshkor bo'lmaydi - javob faqat "band/bo'sh").
router.get(
  "/check-availability",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  validate(checkAvailabilitySchema),
  checkAvailability,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  validate(idSchema),
  getById,
);
router.get(
  "/:id/group-history",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  validate(idSchema),
  groupHistory,
);
router.get(
  "/:id/password",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(idSchema),
  getPassword,
);
router.patch(
  "/:id/password",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(setPasswordSchema),
  setPassword,
);
// Foydalanuvchiga rol biriktirish (custom rol ham). "/:id" dan OLDIN.
router.patch(
  "/:id/role",
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  validate(setRoleSchema),
  setRole,
);
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(archiveActionSchema),
  remove,
);
router.post(
  "/:id/restore",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(archiveActionSchema),
  restore,
);
router.delete(
  "/:id/permanent",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(permanentDeleteSchema),
  permanentRemove,
);

export default router;
