import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import uploadAttachment from "../../middleware/uploadAttachment.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { ROLES } from "../../constants/roles.js";

import {
  createSchema,
  previewSchema,
  listSchema,
  idSchema,
  recipientListSchema,
  myListSchema,
} from "./validators/assignments.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import getRecipients from "./handlers/getRecipients.handler.js";
import create from "./handlers/create.handler.js";
import preview from "./handlers/preview.handler.js";
import remove from "./handlers/remove.handler.js";
import download from "./handlers/download.handler.js";
import myList from "./handlers/myList.handler.js";
import myUnreadCount from "./handlers/myUnreadCount.handler.js";
import markRead from "./handlers/markRead.handler.js";

const router = Router();

// --- O'quvchi yuzasi ---
// "/my" "/:id" naqshidan OLDIN turishi SHART, aks holda "my" ID deb
// qabul qilinib, validator 400 qaytarardi.
// "/my/unread-count" "/my" dan OLDIN emas, lekin "/my/:id/read" naqshi
// bilan to'qnashmasligi uchun aniq yo'l sifatida beriladi.
router.get(
  "/my/unread-count",
  requireAuth,
  requireRole(ROLES.STUDENT),
  myUnreadCount,
);
router.get(
  "/my",
  requireAuth,
  requireRole(ROLES.STUDENT),
  validate(myListSchema),
  myList,
);
router.post(
  "/my/:id/read",
  requireAuth,
  requireRole(ROLES.STUDENT),
  validate(idSchema),
  markRead,
);

// --- Yuborishdan oldingi ko'rib chiqish ---
// Nechta o'quvchiga yetadi, nechtasi botni bloklagan - forma shu javob
// asosida ogohlantirish ko'rsatadi.
router.post(
  "/preview",
  requireAuth,
  requirePermission(PERMISSIONS.ASSIGNMENTS_SEND),
  validate(previewSchema),
  preview,
);

// --- Yuborish ---
//
// TARTIB MUHIM:
//   requireAuth       - filial konteksti (ALS) shu yerda ochiladi;
//   requirePermission - ruxsatsiz foydalanuvchining fayli UMUMAN o'qilmasin;
//   uploadAttachment  - multipart tanani o'qiydi (req.body shundan keyin
//                       to'ladi, shuning uchun validate undan KEYIN turadi).
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ASSIGNMENTS_SEND),
  uploadAttachment,
  validate(createSchema),
  create,
);

// --- Boshqaruv yuzasi ---
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ASSIGNMENTS_READ),
  validate(listSchema),
  list,
);

// Fayl yuklab olish. requirePermission ATAYLAB yo'q: o'quvchi ham o'ziga
// kelgan faylni oladi. Kirish huquqi service ichida egalik bo'yicha
// tekshiriladi (assertCanRead).
router.get("/:id/file", requireAuth, validate(idSchema), download);

router.get(
  "/:id/recipients",
  requireAuth,
  requirePermission(PERMISSIONS.ASSIGNMENTS_READ),
  validate(recipientListSchema),
  getRecipients,
);

router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.ASSIGNMENTS_READ),
  validate(idSchema),
  getById,
);

router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.ASSIGNMENTS_SEND),
  validate(idSchema),
  remove,
);

export default router;
