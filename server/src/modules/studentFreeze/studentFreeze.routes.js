import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import {
  freezeSchema,
  unfreezeSchema,
  studentIdSchema,
} from "./validators/freeze.validator.js";
import freeze from "./handlers/freeze.handler.js";
import unfreeze from "./handlers/unfreeze.handler.js";
import list from "./handlers/list.handler.js";

const router = Router();

// MUZLATISH - filial direktorining kundalik amali.
//
// Ilgari butunlay owner-only edi va bu amalda ishlamasdi: o'quvchi
// ARXIVLANMAYDI (users.service.js softRemove buni ochiq rad etadi),
// ya'ni muzlatish - o'quvchini vaqtincha to'xtatishning YAGONA yo'li.
// Uni owner'ga qulflash filialni har safar owner'ni kutishga majburlardi.
//
// FILIAL CHEGARASI servis qatlamida: ensureStudent() o'quvchi
// chaqiruvchining ko'lamida ekanini tekshiradi.
router.get(
  "/:studentId",
  requireAuth,
  requirePermission(PERMISSIONS.STUDENTS_FREEZE),
  validate(studentIdSchema),
  list,
);
router.post(
  "/:studentId/freeze",
  requireAuth,
  requirePermission(PERMISSIONS.STUDENTS_FREEZE),
  validate(freezeSchema),
  freeze,
);
router.post(
  "/:studentId/unfreeze",
  requireAuth,
  requirePermission(PERMISSIONS.STUDENTS_FREEZE),
  validate(unfreezeSchema),
  unfreeze,
);

export default router;
