import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  createSchema,
  updateSchema,
  idParamSchema,
  listSchema,
  summarySchema,
  categoryListSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
} from "./validators/expense.validator.js";

import create from "./handlers/create.handler.js";
import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import summary from "./handlers/summary.handler.js";
import categoryList from "./handlers/category.list.handler.js";
import categoryCreate from "./handlers/category.create.handler.js";
import categoryUpdate from "./handlers/category.update.handler.js";
import categoryRemove from "./handlers/category.remove.handler.js";

const router = Router();

// ── KATEGORIYALAR ──
// "/categories" "/:id" dan OLDIN turishi SHART - aks holda "categories"
// so'zi :id parametri sifatida ushlanib qolardi.
router.get(
  "/categories",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_READ),
  validate(categoryListSchema),
  categoryList,
);
router.post(
  "/categories",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_EXPENSE),
  validate(categoryCreateSchema),
  categoryCreate,
);
router.patch(
  "/categories/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_EXPENSE),
  validate(categoryUpdateSchema),
  categoryUpdate,
);
router.delete(
  "/categories/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_EXPENSE),
  validate(idParamSchema),
  categoryRemove,
);

// ── HISOBOT ──
router.get(
  "/summary",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_READ),
  validate(summarySchema),
  summary,
);

// ── CHIQIMLAR ──
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_READ),
  validate(listSchema),
  list,
);
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_CREATE_EXPENSE),
  validate(createSchema),
  create,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_READ),
  validate(idParamSchema),
  getById,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_CREATE_EXPENSE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_EXPENSE),
  validate(idParamSchema),
  remove,
);

export default router;
