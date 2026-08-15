import mongoose from "mongoose";
import Branch from "../../../models/branch.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import Approval from "../../../models/approval.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { validateDelegation } from "../../../constants/delegation.js";
import { hashPassword } from "../../../helpers/password.helper.js";
import { normalizePhone } from "../../../utils/phone.js";
import {
  assertRoleAssignable,
  assertCanGrantRole,
} from "../../../helpers/roles.helper.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Filiallar ro'yxati.
 * DIQQAT: bu yerda branchFilter() ISHLATILMAYDI - foydalanuvchi qaysi
 * filiallarga kira olishini allowedBranchIds hal qiladi (u requireAuth
 * bosqichida hisoblangan). Filial ro'yxati - scope'ning O'ZI, uni yana
 * o'ziga filtrlab bo'lmaydi.
 */
export const list = async ({
  search,
  includeInactive = false,
  allowedBranchIds = [],
  canSeeAllBranches = false,
  page = 1,
  limit = 100,
}) => {
  const filter = { isDeleted: false };
  if (!includeInactive) filter.isActive = true;
  if (search && search.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }
  // view_all yo'q bo'lsa - faqat biriktirilgan filiallar.
  if (!canSeeAllBranches) {
    filter._id = { $in: allowedBranchIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Branch.find(filter).sort({ isMain: -1, name: 1 }).skip(skip).limit(limit),
    Branch.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await Branch.findOne({ _id: id, isDeleted: false });
  if (!doc) throw new ApiError(404, "Filial topilmadi");
  return doc;
};

export const create = async (body) => {
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError(400, "Filial nomi kerak");

  const exists = await Branch.findOne({ name, isDeleted: false }).lean();
  if (exists) throw new ApiError(409, "Bunday nomli filial allaqachon mavjud");

  // Birinchi filial avtomatik ASOSIY bo'ladi.
  const count = await Branch.countDocuments({ isDeleted: false });

  return Branch.create({
    name,
    code: body.code ? String(body.code).trim().toUpperCase() : null,
    address: body.address ? String(body.address).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    isMain: count === 0,
  });
};

/**
 * FILIAL + DIREKTOR ni BIRGA yaratadi.
 *
 * NEGA bitta amal: filial ochilgach unga darhol kirish kerak. Direktorsiz
 * filial - "qorong'i ma'lumot": u yerda guruh/to'lov paydo bo'ladi, lekin
 * owner'dan boshqa hech kim ko'ra olmaydi.
 *
 * ATOMIKLIK: bu kodbazada ishonchli ko'p-hujjatli tranzaksiya YO'Q -
 * runFinanceTxn standalone MongoDB'da jimgina atomiklikni yo'qotadi.
 * Shuning uchun: (1) OLDINDAN validatsiya - eng ko'p uchraydigan xato
 * (login band) filial yaratilgunga QADAR tutiladi; (2) xato bo'lsa
 * KOMPENSATSIYA - filial o'chiriladi.
 */
export const createWithDirector = async (body, currentUser) => {
  const { director, ...branchBody } = body;

  // DIREKTORSIZ: faqat filial ochiladi. Direktorni keyin "Xodim qo'shish"
  // orqali biriktirish mumkin. Bu holatda filialda 0 ta foydalanuvchi
  // bo'ladi, ya'ni kerak bo'lsa uni o'chirib ham yuborsa bo'ladi.
  if (!director) return create(branchBody);

  // ── 1-QADAM: OLDINDAN validatsiya (hech narsa yaratilmasdan) ──
  // Login/telefon bandligini shu yerda tekshiramiz - keyinroq bilsak,
  // filial yaratilib bo'lgan bo'lardi va uni orqaga qaytarish kerak edi.
  const username = String(director.username || "").toLowerCase().trim();
  if (await User.findOne({ username })) {
    throw new ApiError(409, "Bunday login (username) allaqachon mavjud");
  }
  const dirPhone = director.phone ? normalizePhone(director.phone) : null;
  if (director.phone && !dirPhone) {
    throw new ApiError(400, "Direktor telefon raqami noto'g'ri");
  }
  // Telefon bandligi TEKSHIRILMAYDI - takrorlanish ruxsat etilgan
  // (qarang: user.model.js phone izohi).

  // Rol mavjud va biriktirsa bo'ladimi - bu ham oldindan.
  const roleValue = director.role || "director";
  const targetRole = await assertRoleAssignable(roleValue);
  await assertCanGrantRole(targetRole, currentUser);

  // ── 2-QADAM: filial ──
  const branch = await create(branchBody);

  // ── 3-QADAM: direktor (xato bo'lsa filialni qaytarib olamiz) ──
  try {
    const passwordHash = await hashPassword(director.password);
    const user = await User.create({
      firstName: director.firstName.trim(),
      lastName: director.lastName.trim(),
      username,
      phone: dirPhone || undefined,
      passwordHash,
      role: roleValue,
      homeBranchId: branch._id,
      branchAssignments: [],
      isActive: true,
      hiredAt: new Date(),
    });

    return { branch, director: { _id: user._id, username: user.username } };
  } catch (err) {
    // KOMPENSATSIYA: direktorsiz filial qolmasin.
    // Bu yerda hard delete - filial hozirgina yaratilgan, ichida ma'lumot yo'q.
    await Branch.deleteOne({ _id: branch._id }).catch(() => {});
    logger.warn(
      { branchId: String(branch._id), msg: err?.message },
      "Direktor yaratilmadi - filial qaytarib olindi",
    );
    throw err;
  }
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, "Filial nomi kerak");
    const clash = await Branch.findOne({
      name,
      isDeleted: false,
      _id: { $ne: doc._id },
    }).lean();
    if (clash) throw new ApiError(409, "Bunday nomli filial allaqachon mavjud");
    doc.name = name;
  }

  if (body.code !== undefined) {
    doc.code = body.code ? String(body.code).trim().toUpperCase() : null;
  }
  if (body.address !== undefined) {
    doc.address = body.address ? String(body.address).trim() : null;
  }
  if (body.phone !== undefined) {
    doc.phone = body.phone ? String(body.phone).trim() : null;
  }

  // DELEGATSIYA MATRITSASI.
  //
  // TO'LIQ ALMASHTIRISH (qisman birlashtirish EMAS): owner matritsani
  // yaxlit forma sifatida ko'radi va saqlaydi. Birlashtirish bo'lsa,
  // formadan olib tashlangan qoida bazada qolib ketardi - ya'ni owner
  // "o'chirdim" deb o'ylagan ishonch amalda kuchda qolardi.
  //
  // Tekshiruv validateDelegation orqali: maosh turlariga `auto` qo'yish
  // yoki turga tegishsiz chegara kiritish shu yerda 400 bilan to'xtaydi.
  // (Model'ning pre("validate") hook'i ham shuni chaqiradi - u seed va
  // migratsiya kabi servisdan chetlab o'tuvchi yo'llarni qoplaydi.)
  if (body.delegation !== undefined) {
    if (body.delegation === null) {
      doc.delegation = undefined;
    } else {
      const error = validateDelegation(body.delegation);
      if (error) throw new ApiError(400, error);
      doc.delegation = body.delegation;
    }
  }

  // CHIQIM LIMITI: null yoki 0 = cheksiz.
  if (body.expenseApprovalThreshold !== undefined) {
    const v = body.expenseApprovalThreshold;
    if (v === null || v === "" || Number(v) <= 0) {
      doc.expenseApprovalThreshold = null;
    } else {
      doc.expenseApprovalThreshold = Number(v);
    }
  }

  if (body.isActive !== undefined) {
    const nextActive = Boolean(body.isActive);
    // ASOSIY filialni o'chirib bo'lmaydi - migratsiyada barcha eski
    // ma'lumot shunga biriktirilgan, u yo'qolsa scope buziladi.
    if (!nextActive && doc.isMain) {
      throw new ApiError(400, "Asosiy filialni nofaol qilib bo'lmaydi");
    }
    doc.isActive = nextActive;
    doc.archivedAt = nextActive ? null : new Date();
  }

  await doc.save();
  return doc;
};

/**
 * Filialni o'chirish (soft delete).
 * Ichida ma'lumot bo'lsa - bloklanadi. Aks holda guruh/foydalanuvchi
 * "yetim" qolib, hech kim ko'ra olmaydigan holatga tushardi.
 */
export const softRemove = async (id, currentUser) => {
  const doc = await getById(id);

  if (doc.isMain) {
    throw new ApiError(400, "Asosiy filialni o'chirib bo'lmaydi");
  }

  // TO'SIQ FAQAT HAQIQIY MA'LUMOT UCHUN: guruhlar, o'quvchilar va
  // o'qituvchilar. Ular boshqa filialga ko'chirilishi kerak, aks holda
  // yetim qolardi.
  //
  // XODIM (direktor/administrator) ATAYLAB HISOBGA OLINMAYDI. Ilgari u ham
  // to'sardi va natijada halqa hosil bo'lardi: filial yaratilganda tizim
  // O'ZI direktor yaratardi, keyin o'sha direktor filialni o'chirishga
  // to'sqinlik qilardi - ya'ni yaratilgan filialni hech qachon o'chirib
  // bo'lmasdi. Endi xodim filial bilan birga arxivlanadi.
  const [groupCount, members, staff] = await Promise.all([
    Group.countDocuments({ branchId: doc._id, isDeleted: { $ne: true } }),
    // SANAB emas, RO'YXAT bilan olamiz - to'siq xabari kimni ko'chirish
    // kerakligini AYTISHI kerak. Ilgari faqat son berilardi va arxivlangan
    // o'qituvchi kartada ko'rinmagani uchun ("Xodim 0") ega nimani
    // ko'chirishni bilmay qolardi - o'chirib bo'lmaydigan filial.
    User.find({
      $or: [{ homeBranchId: doc._id }, { "branchAssignments.branchId": doc._id }],
      role: { $in: [ROLES.STUDENT, ROLES.TEACHER] },
      isDeleted: { $ne: true },
    })
      .select("firstName lastName role isActive")
      .limit(10)
      .lean(),
    User.find({
      $or: [{ homeBranchId: doc._id }, { "branchAssignments.branchId": doc._id }],
      role: { $nin: [ROLES.STUDENT, ROLES.TEACHER, ROLES.OWNER] },
      isDeleted: { $ne: true },
    })
      .select("_id homeBranchId branchAssignments")
      .lean(),
  ]);

  if (groupCount > 0 || members.length > 0) {
    const who = members
      .map(
        (u) =>
          `${u.firstName} ${u.lastName}` +
          (u.isActive === false ? " (arxivda)" : ""),
      )
      .join(", ");

    const parts = [];
    if (groupCount > 0) parts.push(`${groupCount} ta guruh`);
    if (members.length > 0) parts.push(`${members.length} ta o'quvchi/o'qituvchi`);

    throw new ApiError(
      400,
      `Filialda ${parts.join(" va ")} bor. Avval ularni boshqa filialga ko'chiring.` +
        // "(arxivda)" belgisi muhim: arxivlangan odam ro'yxatlarda
        // ko'rinmaydi, lekin baribir to'sadi - ega uni qidirib topa olishi
        // uchun ismini ochiq aytamiz.
        (who ? ` Kimlar: ${who}` : ""),
    );
  }

  // BOSHQA FILIALDA HAM ISHLAYDIGAN xodimni arxivlamaymiz - undan shu
  // filial biriktiruvini olib tashlash yetarli.
  const solelyHere = [];
  const alsoElsewhere = [];
  for (const u of staff) {
    const others = (u.branchAssignments || []).filter(
      (a) => a?.branchId && String(a.branchId) !== String(doc._id),
    );
    const homeElsewhere =
      u.homeBranchId && String(u.homeBranchId) !== String(doc._id);
    (others.length || homeElsewhere ? alsoElsewhere : solelyHere).push(u._id);
  }

  if (solelyHere.length) {
    await User.updateMany(
      { _id: { $in: solelyHere } },
      { $set: { isActive: false, archivedAt: new Date() } },
    );
  }
  if (alsoElsewhere.length) {
    await User.updateMany(
      { _id: { $in: alsoElsewhere } },
      { $pull: { branchAssignments: { branchId: doc._id } } },
    );
  }

  await doc.softDelete(currentUser?._id);
  return doc;
};

/** Filial statistikasi - kartochkada ko'rsatish uchun. */
export const stats = async (id, { allowedBranchIds = [], canSeeAllBranches = false } = {}) => {
  const doc = await getById(id);
  const branchId = doc._id;

  // KO'LAM TEKSHIRUVI. Bu endpoint filial rahbariyatining ism va loginini
  // ham qaytaradi, ya'ni "o'z filialingdan boshqasini o'qima" qoidasi shart.
  if (!canSeeAllBranches) {
    const allowed = allowedBranchIds.some((b) => String(b) === String(branchId));
    if (!allowed) throw new ApiError(403, "Bu filialga ruxsatingiz yo'q");
  }

  const [groupCount, activeGroupCount, staffCount, studentCount, managers] =
    await Promise.all([
      Group.countDocuments({ branchId, isDeleted: { $ne: true } }),
      Group.countDocuments({ branchId, isActive: true, isDeleted: { $ne: true } }),
      User.countDocuments({
        $or: [{ homeBranchId: branchId }, { "branchAssignments.branchId": branchId }],
        role: { $nin: ["student"] },
        isActive: true,
        isDeleted: { $ne: true },
      }),
      User.countDocuments({
        $or: [{ homeBranchId: branchId }, { "branchAssignments.branchId": branchId }],
        role: "student",
        isActive: true,
        isDeleted: { $ne: true },
      }),
      // FILIAL RAHBARIYATI - kartada login/parolni ko'rsatish uchun.
      //
      // O'quvchi/o'qituvchi chiqarib tashlanadi: kerak bo'lgani "bu filialni
      // kim boshqaradi" degan savolga javob, ya'ni custom rolli xodimlar
      // (direktor, administrator, buxgalter). Ega ham kerak emas - u
      // filialga bog'liq emas.
      //
      // PAROL BU YERDA QAYTARILMAYDI: uni alohida /users/:id/password
      // beradi, ya'ni ro'yxat so'ralganda parollar yopiq qoladi.
      User.find({
        $or: [{ homeBranchId: branchId }, { "branchAssignments.branchId": branchId }],
        role: { $nin: ["student", "teacher", "owner"] },
        isActive: true,
        isDeleted: { $ne: true },
      })
        .select("firstName lastName username role")
        .sort({ createdAt: 1 })
        .limit(5)
        .lean(),
    ]);

  return { groupCount, activeGroupCount, staffCount, studentCount, managers };
};

/**
 * TAQQOSLASH - barcha ko'rinadigan filiallar bitta jadvalda.
 *
 * NEGA ALOHIDA ENDPOINT: global BranchPicker butun ilovani BITTA filialga
 * qisadi, ya'ni "qaysi filial qanday ishlayapti" degan savolga javob
 * berolmaydi. Bu yagona ko'rinish uni filialdan tashqarida beradi.
 *
 * N+1 dan qochish: har filial uchun alohida `stats(id)` chaqirilsa 4xN
 * so'rov bo'lardi. Bu yerda har bir o'lcham uchun BITTA aggregation
 * ishlaydi va natija filial bo'yicha guruhlanadi.
 */
export const compare = async ({ allowedBranchIds = [], canSeeAllBranches = false }) => {
  const filter = { isDeleted: false, isActive: true };
  if (!canSeeAllBranches) {
    filter._id = { $in: allowedBranchIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const branches = await Branch.find(filter)
    .sort({ isMain: -1, name: 1 })
    .select({ name: 1, code: 1, isMain: 1, expenseApprovalThreshold: 1 })
    .lean();

  if (!branches.length) return [];

  const ids = branches.map((b) => b._id);

  // Xodim/o'quvchi filialga IKKI yo'l bilan bog'lanadi: `homeBranchId` yoki
  // `branchAssignments`. Ikkalasini bitta massivga yig'ib, `$unwind` bilan
  // sanaymiz - aks holda ikki filialga biriktirilgan xodim faqat bittasida
  // hisoblanardi.
  const userCounts = await User.aggregate([
    {
      $match: {
        isActive: true,
        isDeleted: { $ne: true },
        $or: [
          { homeBranchId: { $in: ids } },
          { "branchAssignments.branchId": { $in: ids } },
        ],
      },
    },
    {
      $project: {
        role: 1,
        branches: {
          $setUnion: [
            { $cond: [{ $ifNull: ["$homeBranchId", false] }, ["$homeBranchId"], []] },
            { $ifNull: ["$branchAssignments.branchId", []] },
          ],
        },
      },
    },
    { $unwind: "$branches" },
    { $match: { branches: { $in: ids } } },
    {
      $group: {
        _id: "$branches",
        studentCount: { $sum: { $cond: [{ $eq: ["$role", "student"] }, 1, 0] } },
        staffCount: { $sum: { $cond: [{ $ne: ["$role", "student"] }, 1, 0] } },
      },
    },
  ]);

  const groupCounts = await Group.aggregate([
    { $match: { branchId: { $in: ids }, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: "$branchId",
        groupCount: { $sum: 1 },
        activeGroupCount: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
      },
    },
  ]);

  const pendingCounts = await Approval.aggregate([
    { $match: { branchId: { $in: ids }, status: "pending" } },
    { $group: { _id: "$branchId", pendingApprovals: { $sum: 1 } } },
  ]);

  const byId = (rows) =>
    rows.reduce((acc, row) => {
      acc[String(row._id)] = row;
      return acc;
    }, {});

  const users = byId(userCounts);
  const groups = byId(groupCounts);
  const pending = byId(pendingCounts);

  return branches.map((b) => {
    const key = String(b._id);
    return {
      _id: b._id,
      name: b.name,
      code: b.code,
      isMain: b.isMain,
      expenseApprovalThreshold: b.expenseApprovalThreshold ?? null,
      studentCount: users[key]?.studentCount || 0,
      staffCount: users[key]?.staffCount || 0,
      groupCount: groups[key]?.groupCount || 0,
      activeGroupCount: groups[key]?.activeGroupCount || 0,
      pendingApprovals: pending[key]?.pendingApprovals || 0,
    };
  });
};
