import asyncHandler from "../../../middleware/asyncHandler.js";
import Group from "../../../models/group.model.js";
import Branch from "../../../models/branch.model.js";
import Role from "../../../models/role.model.js";
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
    const groups = await Group.find({
      ...branchFilter(),
      isActive: true,
      isDeleted: { $ne: true },
    })
      .select("name")
      .sort({ name: 1 })
      .lean();
    data.groups = groups.map((g) => ({ value: g.name, label: g.name }));
  }

  if (keys.has("branches")) {
    const branches = await Branch.find({
      ...branchFilter("_id"),
      isDeleted: false,
    })
      .select("name")
      .sort({ name: 1 })
      .lean();
    data.branches = branches.map((b) => ({ value: b.name, label: b.name }));
  }

  if (keys.has("roles")) {
    // Xodimga biriktirib bo'ladigan rollar: o'quvchi/o'qituvchi tipidagi
    // va muzlatilganlar chiqarib tashlanadi. Owner ham yo'q - uni import
    // orqali yaratish mumkin emas (assertCanGrantRole rad etadi).
    const roles = await Role.find({
      isFrozen: { $ne: true },
      roleType: { $nin: [ROLE_TYPES.STUDENT, ROLE_TYPES.TEACHER, ROLE_TYPES.OWNER] },
      value: { $ne: ROLES.OWNER },
    })
      .select("value label")
      .sort({ label: 1 })
      .lean();
    data.roles = roles.map((r) => ({ value: r.label || r.value, label: r.label || r.value }));
  }

  res.json({ success: true, data });
});

export default optionsHandler;
