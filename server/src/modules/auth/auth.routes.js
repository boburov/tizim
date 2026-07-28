import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import { authLimiter } from "../../middleware/rateLimiter.js";
import { enforceLimit } from "../../middleware/enforceLimit.js";
import { ROLES } from "../../constants/roles.js";
import User from "../../models/user.model.js";
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
  const filter = { isDeleted: { $ne: true } };
  return User.countDocuments(
    role === ROLES.STUDENT
      ? { ...filter, role: ROLES.STUDENT }
      : { ...filter, role: { $ne: ROLES.STUDENT } },
  );
};

const enforceUserLimit = (req, res, next) =>
  enforceLimit(limitKeyForRole(req.body?.role), countForRole)(req, res, next);

router.post(
  "/register-user",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(registerUserSchema),
  enforceUserLimit,
  registerUser,
);

export default router;
