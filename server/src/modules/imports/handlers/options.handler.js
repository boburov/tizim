import asyncHandler from "../../../middleware/asyncHandler.js";
import prisma from "../../../config/prisma.js";
import { ROLES, ROLE_TYPES } from "../../../constants/roles.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";

/**
 * TANLOV VARIANTLARI (select) - jadval oqimidagi ustunlar uchun.
 *
 * NEGA ALOHIDA ENDPOINT: variantlar importerlar RO'YXATIGA qo'shilsa,
 * har bir importer uchun guruh/rol so'rovi ketardi - holbuki bir vaqtda
 * faqat bittasi ochiladi. Bu yo'l esa faqat oyna ochilganda chaqiriladi.
 *
 * NEGA NOM (id emas): import qatorlari Excel bilan bir xil shaklda
 * qoladi - foydalanuvchi faylni yuklab, tahrirlab, qayta yuklay oladi.
 * Yozish paytida nom baribir qidiriladi (importer.prepare), shuning
 * uchun bu yerda ID yuborish hech narsani soddalashtirmaydi.
 *
 * FILIAL KO'LAMI: guruhlar branchFilter() orqali kesiladi - direktor
 * boshqa filial guruhini ro'yxatda ko'rmasin.
 */
const optionsHandler = asyncHandler(async (req, res) => {
  const keys = new Set(
    (req.importer.columns || []).map((c) => c.optionsKey).filter(Boolean),
  );

  const data = {};

  if (keys.has("groups")) {
    const groups = await prisma.group.findMany({
      where: { ...branchFilter(), isActive: true, isDeleted: false },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    data.groups = groups.map((g) => ({ value: g.name, label: g.name }));
  }

  if (keys.has("branches")) {
    // `branchFilter("_id")` -> `branchFilter("id")`: Prisma'da
    // birlamchi kalit ustuni `id` deb ataladi.
    const branches = await prisma.branch.findMany({
      where: { ...branchFilter("id"), isDeleted: false },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    data.branches = branches.map((b) => ({ value: b.name, label: b.name }));
  }

  if (keys.has("roles")) {
    // Xodimga biriktirib bo'ladigan rollar: o'quvchi/o'qituvchi tipidagi
    // va muzlatilganlar chiqarib tashlanadi. Owner ham yo'q - uni import
    // orqali yaratish mumkin emas (assertCanGrantRole rad etadi).
    const roles = await prisma.role.findMany({
      where: {
        isFrozen: false,
        roleType: {
          notIn: [ROLE_TYPES.STUDENT, ROLE_TYPES.TEACHER, ROLE_TYPES.OWNER],
        },
        value: { not: ROLES.OWNER },
      },
      select: { value: true, label: true },
      orderBy: { label: "asc" },
    });
    data.roles = roles.map((r) => ({ value: r.label || r.value, label: r.label || r.value }));
  }

  res.json({ success: true, data });
});

export default optionsHandler;
