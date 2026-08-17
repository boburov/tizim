import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { authLimiter } from "../../middleware/rateLimiter.js";
import { enforceLimit } from "../../middleware/enforceLimit.js";
import { ROLES } from "../../constants/roles.js";
import prisma from "../../config/prisma.js";
import { loginSchema } from "./validators/login.validator.js";
import { registerUserSchema } from "./validators/registerUser.validator.js";
import { updateProfileSchema } from "./validators/updateProfile.validator.js";
import { changePasswordSchema } from "./validators/changePassword.validator.js";
import login from "./handlers/login.handler.js";
import refresh from "./handlers/refresh.handler.js";
import logout from "./handlers/logout.handler.js";
import me from "./handlers/me.handler.js";
import updateProfile from "./handlers/updateProfile.handler.js";
import changePassword from "./handlers/changePassword.handler.js";
import registerUser from "./handlers/registerUser.handler.js";

const router = Router();

router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/refresh", authLimiter, refresh);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.patch(
  "/me",
  requireAuth,
  validate(updateProfileSchema),
  updateProfile,
);
router.post(
  "/change-password",
  requireAuth,
  validate(changePasswordSchema),
  changePassword,
);
// Tarif limiti yaratilayotgan ROLGA qarab tanlanadi: o'quvchi uchun
// "max_students", qolganlari (xodim/o'qituvchi) uchun "max_users".
// Arxivlangan (isDeleted) yozuvlar hisobga olinmaydi.
const limitKeyForRole = (role) =>
  role === ROLES.STUDENT ? "max_students" : "max_users";

const countForRole = (req) => {
  const role = req.body?.role;
  // `isDeleted` Postgres'da NOT NULL (default false), shuning uchun
  // Mongo'dagi `{ $ne: true }` bu yerda oddiy `false` ga aylanadi.
  // `role` ham NOT NULL, ya'ni `{ not: "student" }` NULL yozuvlarni
  // tashlab ketmaydi - Mongo bilan bir xil natija.
  return prisma.user.count({
    where: {
      isDeleted: false,
      role: role === ROLES.STUDENT ? ROLES.STUDENT : { not: ROLES.STUDENT },
    },
  });
};

const enforceUserLimit = (req, res, next) =>
  enforceLimit(limitKeyForRole(req.body?.role), countForRole)(req, res, next);

// O'QUVCHI / O'QITUVCHI yaratish.
//
// Ilgari owner-only edi. Endi `users.create` ruxsati bilan ochiq -
// filial direktori o'z filialiga odam qo'sha olishi kerak.
//
// XAVFSIZ: servis qatlamida `assertCanAssignBranch` allaqachon bor,
// ya'ni direktor boshqa filialga odam yozib qo'ya olmaydi va filialsiz
// ham yarata olmaydi (auth.service.js registerUser).
router.post(
  "/register-user",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_CREATE),
  validate(registerUserSchema),
  enforceUserLimit,
  registerUser,
);

export default router;
