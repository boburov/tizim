import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";
import { valueSchema, removeSchema } from "./validators/value.validator.js";
import { freezeSchema } from "./validators/freeze.validator.js";

import list from "./handlers/list.handler.js";
import matrix from "./handlers/matrix.handler.js";
import getByValue from "./handlers/getByValue.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import setFrozen from "./handlers/setFrozen.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

// Ruxsatlar matritsasi (module x action) - "/:value" dan OLDIN turishi shart,
// aks holda "matrix" rol value'si sifatida ushlanib qoladi.
router.get("/matrix", requireAuth, requirePermission(PERMISSIONS.ROLES_READ), matrix);

router.get("/", requireAuth, requirePermission(PERMISSIONS.ROLES_READ), list);
router.get(
  "/:value",
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_READ),
  validate(valueSchema),
  getByValue,
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_CREATE),
  validate(createSchema),
  create,
);

router.patch(
  "/:value",
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  validate(updateSchema),
  update,
);

// Muzlatish/muzdan chiqarish
router.patch(
  "/:value/freeze",
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  validate(freezeSchema),
  setFrozen,
);

router.delete(
  "/:value",
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_DELETE),
  validate(removeSchema),
  remove,
);

export default router;
