import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import TeacherGroupPeriod from "../../../models/teacherGroupPeriod.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
// Butunlay o'chirishdan oldin AUDIT IZI tekshiriladi - maosh to'lovi yoki
// davomat yozuvi bo'lgan o'qituvchi o'chirilmaydi (tarix buzilmasin).
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import Attendance from "../../../models/attendance.model.js";
import Group from "../../../models/group.model.js";
import ArchiveReason from "../../../models/archiveReason.model.js";
import RefreshToken from "../../../models/refreshToken.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES, ROLE_TYPES } from "../../../constants/roles.js";
import { normalizePhone } from "../../../utils/phone.js";
import { hashPassword } from "../../../helpers/password.helper.js";
import {
  assertTargetInScope,
  assertCanAssignBranch,
} from "../../../helpers/branchAccess.helper.js";
import { userBranchCondition } from "../../../helpers/branchContext.helper.js";
import Branch from "../../../models/branch.model.js";
import { buildUserProfile } from "../../../helpers/userProfile.helper.js";
import {
  toUtcMidnight,
  localTodayMidnight,
  parseLocalDay,
  isFutureLocalDay,
} from "../../../helpers/attendance.helper.js";
import { assertPeriodInvariants } from "../../../helpers/period.helper.js";
import { safeRecomputeStudentCompletion } from "../../../helpers/studentCompletion.helper.js";
import {
  findUserBlockingRelations,
  purgeUserResidualData,
  hardDeleteStudentData,
  hardDeleteTeacherData,
} from "../../../helpers/userRelations.helper.js";
import {
  assertRoleAssignable,
  assertNotSelfRoleChange,
  assertNotLastOwner,
  assertCanGrantRole,
  loadRoleCatalog,
  staffRoleFilter,
} from "../../../helpers/roles.helper.js";
import { logAction as logArchiveAction } from "../../archiveReasons/services/archiveReasons.service.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import * as studentFreezeService from "../../studentFreeze/services/studentFreeze.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";
import * as systemNotificationsService from "../../systemNotifications/services/systemNotifications.service.js";
import { runFinanceTxn } from "../../finance/services/financeTxn.helper.js";
import logger from "../../../config/logger.js";

const STUDENT_ONLY_FIELDS = ["enrolledAt", "completedAt"];
const TEACHER_ONLY_FIELDS = ["hiredAt"];

// O'qituvchining FAOL guruhi bo'lsa arxivlash/faolsizlantirishni bloklaydi.
// Ikkala manba tekshiriladi: Group.teachers keshi (UI shuni ko'rsatadi) VA ochiq
// dars davri (TeacherGroupPeriod) - biror-birida bo'lsa ham bloklanadi. Avval
// o'qituvchini boshqa (bo'sh vaqti mos) o'qituvchiga almashtirish yoki guruhdan
// chiqarish kerak.
const assertTeacherHasNoActiveGroup = async (user, actionVerb = "arxivlang") => {
  if (!user || user.role !== ROLES.TEACHER) return;
  const openPeriods = await TeacherGroupPeriod.find(
    { teacher: user._id, endDate: null, isDeleted: { $ne: true } },
    { group: 1 },
  ).lean();
  const activeGroups = await Group.find(
    {
      $or: [
        { teachers: user._id },
        { _id: { $in: openPeriods.map((p) => p.group) } },
      ],
      isActive: true,
      isDeleted: { $ne: true },
    },
    { name: 1 },
  ).lean();
  if (activeGroups.length) {
    const names = activeGroups.map((g) => g.name).join(", ");
    throw new ApiError(
      400,
      `O'qituvchining faol guruhi bor (${names}). Avval uni boshqa o'qituvchiga almashtiring yoki guruh(lar)dan chiqaring, so'ng ${actionVerb}.`,
    );
  }
};

// Ro'yxatda saralash mumkin bo'lgan maydonlar (xavfsiz oq ro'yxat).
const USER_SORT_FIELDS = {
  createdAt: "createdAt",
  firstName: "firstName",
  lastName: "lastName",
};

// O'quvchilar ro'yxatiga faol guruhlarni qo'shadi -
// ro'yxatdan profil ochmasdan ko'rinishi uchun (at-a-glance).
const enrichStudents = async (items) => {
  const studentIds = items
    .filter((u) => u.role === ROLES.STUDENT)
    .map((u) => u._id);
  if (studentIds.length === 0) return items.map((u) => u.toObject());

  const [membershipRows, freezeMap] = await Promise.all([
    GroupMembership.find({
      student: { $in: studentIds },
      leftAt: null,
    })
      .populate("group", { name: 1 })
      .lean(),
    studentFreezeService.getActiveFreezeMap(studentIds),
  ]);

  const groupsMap = new Map();
  for (const m of membershipRows) {
    if (!m.group) continue;
    const key = String(m.student);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push({ _id: m.group._id, name: m.group.name });
  }

  return items.map((u) => {
    const obj = u.toObject();
    if (u.role === ROLES.STUDENT) {
      obj.activeGroups = groupsMap.get(String(u._id)) || [];
      const fr = freezeMap.get(String(u._id));
      obj.isFrozen = !!fr;
      obj.frozenSince = fr ? fr.startDate : null;
    }
    return obj;
  });
};

/**
 * XODIMLAR ro'yxatini boyitadi: rol yorlig'i + sessiya holati.
 *
 * Rol NOMI (User.role) va rol YORLIG'I (Role.label) ikki xil joyda turadi -
 * "direktor" degan qiymat foydalanuvchiga "Direktor" bo'lib ko'rinishi kerak.
 * Yorliq client'da qattiq yozilgan ro'yxatdan olinmaydi: custom rollarni
 * owner o'zi yaratadi, ular ROLE_LABELS'da HECH QACHON bo'lmaydi.
 *
 * Ikkala so'rov ham SAHIFA bo'yicha (har qator uchun emas) - N+1 yo'q.
 */
const enrichEmployees = async (rows, catalog) => {
  if (rows.length === 0) return rows;

  // $match aggregate ichida satrni ObjectId'ga O'ZI aylantirmaydi - qo'lda.
  const ids = rows.map((u) => new mongoose.Types.ObjectId(String(u._id)));
  const now = new Date();

  const [sessions] = await Promise.all([
    // Tirik sessiya: bekor qilinmagan va muddati o'tmagan refresh token.
    // revokedAt'da default YO'Q - tirik qatorda maydon umuman bo'lmaydi,
    // shuning uchun $ifNull shart.
    RefreshToken.aggregate([
      { $match: { user: { $in: ids } } },
      {
        $group: {
          _id: "$user",
          activeSessions: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $ifNull: ["$revokedAt", null] }, null] },
                    { $gt: ["$expiresAt", now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const sessionMap = new Map(sessions.map((s) => [String(s._id), s]));

  return rows.map((u) => {
    const roleDoc = catalog?.get(u.role);
    return {
      ...u,
      // Rol hujjati topilmasa resolveRole bilan BIR XIL zaxira qiymat:
      // yorliq = xom qiymat, tip = staff (owner esa har doim owner).
      roleLabel: roleDoc?.label || u.role,
      roleType:
        roleDoc?.roleType ||
        (u.role === ROLES.OWNER ? ROLE_TYPES.OWNER : ROLE_TYPES.STAFF),
      roleIsFrozen: Boolean(roleDoc?.isFrozen),
      activeSessions: sessionMap.get(String(u._id))?.activeSessions || 0,
    };
  });
};

export const list = async ({
  role,
  search,
  staff = false,
  status = "active",
  page = 1,
  limit = 20,
  sort = "createdAt",
  order = "desc",
}) => {
  // "Muzlatilgan" - faqat O'QUVCHI tushunchasi (filter._id muzlatilgan
  // o'quvchilar bilan cheklanadi). Xodimlar ro'yxatida u DOIM bo'sh natija
  // berardi, shuning uchun "faol"ga tushiriladi.
  const effectiveStatus = staff && status === "frozen" ? "active" : status;

  // status: "active" → faqat faol, "archived" → faqat arxiv,
  // "frozen" → hozir muzlatilgan (faol o'quvchilar ichida), "all" → hammasi.
  const filter = { isDeleted: { $ne: true } };
  if (effectiveStatus === "active") filter.isActive = true;
  else if (effectiveStatus === "archived") filter.isActive = false;
  else if (effectiveStatus === "frozen") {
    filter.isActive = true;
    filter._id = { $in: await studentFreezeService.getActiveFrozenStudentIds() };
  }

  // Rol berilsa - o'sha rol; `staff` bayrog'i bilan XODIMLAR (o'quvchi
  // TIPIDAGI rollardan boshqa hamma: owner + o'qituvchi + custom rollar);
  // aks holda ("Hammasi") faqat o'quvchi/o'qituvchi.
  //
  // Aniq `role` ustun turadi - kartochkadan "faqat direktorlar" filtri shu
  // orqali ishlaydi, qo'shimcha kodsiz.
  const catalog = staff ? await loadRoleCatalog() : null;
  filter.role = role
    ? role
    : staff
      ? staffRoleFilter(catalog)
      : { $in: [ROLES.STUDENT, ROLES.TEACHER] };

  if (search && search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [
      { firstName: rx },
      { lastName: rx },
      { username: rx },
      { phone: rx },
    ];
  }

  // FILIAL KO'LAMI.
  //
  // DIQQAT: $and ishlatiladi, $or EMAS - yuqorida qidiruv allaqachon $or
  // ni band qilgan. Ikkinchi $or birinchisini bosib ketardi va qidiruv
  // filial filtrini butunlay yo'q qilardi (jimgina sizish).
  const branchCond = userBranchCondition();
  if (branchCond) {
    filter.$and = [...(filter.$and || []), branchCond];
  }

  const dir = order === "asc" ? 1 : -1;
  const skip = (page - 1) * limit;

  const sortField = USER_SORT_FIELDS[sort] || "createdAt";
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ [sortField]: dir })
      .skip(skip)
      .limit(limit)
      // FILIAL nomi jadvalda ko'rsatiladi - ID yetarli emas.
      .populate("homeBranchId", { name: 1, code: 1 }),
    User.countDocuments(filter),
  ]);

  // enrichStudents ikkala yo'lda ham ODDIY obyekt qaytaradi, shuning uchun
  // xodim boyitilishi uning ustidan ishlaydi - .toObject() ikki marta
  // chaqirilmaydi.
  const enriched = await enrichStudents(items);
  return {
    items: staff ? await enrichEmployees(enriched, catalog) : enriched,
    total,
    page,
    limit,
  };
};

/**
 * XODIMLAR STATISTIKASI - rol kesimida.
 *
 * Ro'yxat bilan BIR XIL predikat (staffRoleFilter) va BIR XIL filial sharti
 * ishlatiladi. Aks holda kartochkadagi "Jami" ro'yxatdagi qatorlar soniga
 * teng bo'lmasdi va bu buzuq ko'rinardi.
 *
 * Holat filtriga bog'liq EMAS: faol va arxiv alohida qaytariladi, shunda
 * "Faol / Arxiv" almashtirilganda kartochkalar qayta yuklanmaydi.
 */
export const staffStats = async () => {
  const catalog = await loadRoleCatalog();
  const base = { isDeleted: { $ne: true }, role: staffRoleFilter(catalog) };

  // Aggregate'da avtomatik filial filtri YO'Q (pre-find hooklar aggregate'da
  // ishlamaydi) - shartni qo'lda $and ichiga qo'shamiz.
  const branchCond = userBranchCondition();
  const match = branchCond ? { ...base, $and: [branchCond] } : base;

  const rows = await User.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$role",
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
      },
    },
  ]);

  // Tartib: Ega -> xodimlar -> o'qituvchilar, ichida yorliq bo'yicha.
  const ORDER = {
    [ROLE_TYPES.OWNER]: 0,
    [ROLE_TYPES.STAFF]: 1,
    [ROLE_TYPES.TEACHER]: 2,
  };

  const byRole = rows
    .map((r) => {
      const meta = catalog.get(r._id);
      const roleType =
        meta?.roleType ||
        (r._id === ROLES.OWNER ? ROLE_TYPES.OWNER : ROLE_TYPES.STAFF);
      return {
        role: r._id,
        label: meta?.label || r._id,
        roleType,
        isFrozen: Boolean(meta?.isFrozen),
        total: r.total,
        active: r.active,
        archived: r.total - r.active,
      };
    })
    .sort(
      (a, b) =>
        (ORDER[a.roleType] ?? 9) - (ORDER[b.roleType] ?? 9) ||
        a.label.localeCompare(b.label),
    );

  const total = byRole.reduce((s, r) => s + r.total, 0);
  const active = byRole.reduce((s, r) => s + r.active, 0);
  return { total, active, archived: total - active, byRole };
};

/**
 * TELEFON / LOGIN band emasligini oldindan tekshiradi.
 *
 * Tekshiruv `auth.service.registerUser` bilan AYNAN bir xil qoidada
 * bo'lishi shart, aks holda forma "bo'sh" deb ko'rsatib, saqlashda 409
 * beradi - bu birinchi xatodan ham yomon.
 *
 * Shuning uchun bu yerda ham:
 *   - telefon NORMALIZATSIYADAN keyin solishtiriladi ("+998 90 123 45 67"
 *     va "998901234567" - bir xil raqam);
 *   - qidiruv ARXIVLANGAN va o'chirilgan foydalanuvchilarni ham qamraydi
 *     (raqam ular bilan ham band bo'lib turadi);
 *   - filial ko'lami QO'LLANMAYDI: boshqa filialdagi odamning raqami ham
 *     band, lekin uning kimligi oshkor qilinmaydi - faqat "band" bayrog'i.
 */
export const checkAvailability = async ({ phone, username, excludeId } = {}) => {
  const result = {};
  const notSelf = excludeId
    ? { _id: { $ne: new mongoose.Types.ObjectId(String(excludeId)) } }
    : {};

  const raw = String(phone || "").trim();
  if (raw) {
    const normalized = normalizePhone(raw);
    if (!normalized) {
      // To'liq bo'lmagan raqam hali XATO emas - odam yozayotgan bo'lishi
      // mumkin. "invalid" bayrog'i client uchun: u faqat raqam TUGAGANDA
      // xato ko'rsatadi.
      result.phone = { taken: false, invalid: true };
    } else {
      const exists = await User.findOne(
        { phone: normalized, ...notSelf },
        { _id: 1 },
      ).lean();
      result.phone = { taken: Boolean(exists), invalid: false };
    }
  }

  const login = String(username || "").toLowerCase().trim();
  if (login) {
    const exists = await User.findOne({ username: login, ...notSelf }, { _id: 1 }).lean();
    result.username = { taken: Boolean(exists) };
  }

  return result;
};

export const getById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  return user;
};

export const getProfile = async (id) => {
  const user = await getById(id);
  return buildUserProfile(user);
};

export const update = async (id, body) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini tahrirlab bo'lmaydi");
  }

  // Role-conditional maydonlar
  if (user.role !== ROLES.STUDENT) {
    for (const f of STUDENT_ONLY_FIELDS) {
      if (body[f] !== undefined) {
        throw new ApiError(400, `Bu maydon (${f}) faqat o'quvchi uchun`);
      }
    }
  }
  if (user.role !== ROLES.TEACHER) {
    for (const f of TEACHER_ONLY_FIELDS) {
      if (body[f] !== undefined) {
        throw new ApiError(400, `Bu maydon (${f}) faqat o'qituvchi uchun`);
      }
    }
  }

  // Asosiy maydonlar
  if (body.firstName !== undefined) user.firstName = body.firstName.trim();
  if (body.lastName !== undefined) user.lastName = body.lastName.trim();
  if (body.isActive !== undefined) {
    // O'quvchini faolsizlantirib (arxivlab) bo'lmaydi - u doim faol obyekt.
    if (body.isActive === false && user.role === ROLES.STUDENT) {
      throw new ApiError(
        400,
        "O'quvchini arxivlab bo'lmaydi. \"Muzlatish\"dan foydalaning yoki guruhdan chiqaring.",
      );
    }
    // Faolsizlantirish ham arxivlash kabi - faol guruhi bor o'qituvchiga ruxsat yo'q.
    if (body.isActive === false) await assertTeacherHasNoActiveGroup(user, "arxivlang");
    user.isActive = !!body.isActive;
  }

  if (body.phone !== undefined) {
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");
    user.phone = phone || undefined;
  }

  // Profil maydonlari (har qanday rol uchun)
  if (body.birthDate !== undefined) {
    user.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  }
  if (body.gender !== undefined) {
    user.gender = body.gender || null;
  }

  // Student-specific
  let recomputeCompletion = false;
  if (user.role === ROLES.STUDENT) {
    if (body.enrolledAt !== undefined) {
      // Kalendar kuni (UTC-midnight) - "bugun" mahalliy (Asia/Tashkent) kun bo'yicha.
      const d = body.enrolledAt ? parseLocalDay(body.enrolledAt) : null;
      if (body.enrolledAt && d == null) {
        throw new ApiError(400, "Ro'yxatga olingan sana noto'g'ri");
      }
      if (d && isFutureLocalDay(d)) {
        throw new ApiError(400, "Ro'yxatga olingan sana kelajakda bo'lmasin");
      }
      // Ro'yxatga olingan sanani mavjud a'zolik boshlangan kundan KEYINGA surib
      // bo'lmaydi - aks holda "guruhga ro'yxatdan oldin qo'shilgan" holat qoladi.
      if (d) {
        const earliest = await GroupMembership.findOne(
          { student: user._id, isDeleted: { $ne: true } },
          { joinedAt: 1 },
        )
          .sort({ joinedAt: 1 })
          .lean();
        if (
          earliest?.joinedAt &&
          toUtcMidnight(d).getTime() > toUtcMidnight(earliest.joinedAt).getTime()
        ) {
          throw new ApiError(
            400,
            "Ro'yxatga olingan sana o'quvchi guruhga qo'shilgan sanadan keyin bo'lmasin",
          );
        }
      }
      user.enrolledAt = d;
    }

    // Yakunlash sanasi: bo'sh → avtoga qaytarish, sana → qo'lda override.
    if (body.completedAt !== undefined) {
      const d = body.completedAt ? parseLocalDay(body.completedAt) : null;
      if (body.completedAt && d == null) {
        throw new ApiError(400, "Yakunlash sanasi noto'g'ri");
      }
      if (d) {
        if (isFutureLocalDay(d)) {
          throw new ApiError(400, "Yakunlash sanasi kelajakda bo'lmasin");
        }
        if (user.enrolledAt && d.getTime() < toUtcMidnight(user.enrolledAt).getTime()) {
          throw new ApiError(400, "Yakunlash sanasi ro'yxatga olingan sanadan oldin bo'lmasin");
        }
        user.completedAt = d;
        user.completedAtManual = true;
      } else {
        user.completedAt = null;
        user.completedAtManual = false;
        recomputeCompletion = true;
      }
    }
  }

  // Teacher-specific
  if (user.role === ROLES.TEACHER) {
    if (body.hiredAt !== undefined) {
      // Ishga olingan sana o'qituvchi uchun MAJBURIY - bo'shatib bo'lmaydi.
      if (!body.hiredAt) {
        throw new ApiError(400, "Ishga olingan sana majburiy");
      }
      const d = parseLocalDay(body.hiredAt);
      if (d == null) {
        throw new ApiError(400, "Ishga olingan sana noto'g'ri");
      }
      if (isFutureLocalDay(d)) {
        throw new ApiError(400, "Ishga olingan sana kelajakda bo'lmasin");
      }
      user.hiredAt = d;
    }
  }

  await user.save();
  // Override bo'shatilgan bo'lsa - avtomatik qiymatni qayta hisoblaymiz.
  if (recomputeCompletion) {
    await safeRecomputeStudentCompletion(user._id);
    return getById(id);
  }
  return user;
};

// Owner uchun: login va parolni qaytaradi. Parol OCHIQ MATNDA saqlanadi,
// shu sababli to'g'ridan-to'g'ri o'qib ko'rsatiladi.
export const getPassword = async (id, currentUser) => {
  const user = await User.findById(id).select(
    "username role homeBranchId branchAssignments +passwordHash",
  );
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini ko'rib bo'lmaydi");
  }

  // FILIAL HIMOYASI (eng muhim tekshiruv).
  // Parollar OCHIQ MATNDA saqlanadi. requireRole(OWNER) uchinchi bosqichda
  // system.admin_access borlarni ham o'tkazadi - ya'ni filial direktori
  // shu endpoint orqali BOSHQA filial xodimining parolini o'qiy olardi.
  assertTargetInScope(
    currentUser?.allowedBranchIds,
    currentUser?.canSeeAllBranches,
    user,
  );

  return { username: user.username, password: user.passwordHash || "" };
};

// Owner uchun: foydalanuvchiga yangi parol o'rnatish (javobda bir martalik qaytadi)
export const setPassword = async (id, newPassword, currentUser) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini o'zgartirib bo'lmaydi");
  }

  // FILIAL HIMOYASI: boshqa filial xodimining parolini almashtirib,
  // uning hisobiga kirib olishni to'sadi.
  assertTargetInScope(
    currentUser?.allowedBranchIds,
    currentUser?.canSeeAllBranches,
    user,
  );
  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  // Parol o'zgargach barcha eski sessiyalarni bekor qilamiz
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return { username: user.username, password: newPassword };
};

export const softRemove = async (id, { reasonId, archiveDate, by } = {}) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }
  // O'quvchi arxivlanmaydi - u tizimda doim faol obyekt bo'lib qoladi.
  // Vaqtincha to'xtatish uchun "Muzlatish" (StudentFreeze) ishlatiladi, chiqib
  // ketish esa guruhdan chiqarish (GroupMembership.leftAt) orqali qayd etiladi.
  if (user.role === ROLES.STUDENT) {
    throw new ApiError(
      400,
      "O'quvchini arxivlab bo'lmaydi. Vaqtincha to'xtatish uchun \"Muzlatish\"dan foydalaning yoki guruhdan chiqaring.",
    );
  }

  // Arxiv sanasi - berilsa o'sha kun (UTC midnight), aks holda mahalliy "bugun".
  const archivedAt = archiveDate
    ? toUtcMidnight(archiveDate)
    : localTodayMidnight();
  if (archivedAt.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Arxiv sanasi kelajakda bo'lishi mumkin emas");
  }

  // O'quvchi arxivlansa - faol a'zoliklarni arxiv sanasida yopamiz.
  if (user.role === ROLES.STUDENT) {
    if (user.enrolledAt && archivedAt.getTime() < toUtcMidnight(user.enrolledAt).getTime()) {
      throw new ApiError(400, "Arxiv sanasi ro'yxatga olingan sanadan oldin bo'lishi mumkin emas");
    }

    const memberships = await GroupMembership.find({
      student: user._id,
      leftAt: null,
      isDeleted: { $ne: true },
    });

    // Avval arxiv sanasi har bir faol davr bilan to'qnashmasligini tekshiramiz -
    // hech narsa saqlamasdan (atomik: bittasi xato bo'lsa umuman arxivlanmaydi).
    for (const m of memberships) {
      if (archivedAt.getTime() < toUtcMidnight(m.joinedAt).getTime()) {
        throw new ApiError(
          400,
          "Arxiv sanasi o'quvchining guruhga qo'shilgan sanasidan oldin bo'lishi mumkin emas",
        );
      }
      const otherMems = await GroupMembership.find(
        { group: m.group, student: user._id, _id: { $ne: m._id }, isDeleted: { $ne: true } },
        { joinedAt: 1, leftAt: 1 },
      ).lean();
      assertPeriodInvariants(
        { startDate: toUtcMidnight(m.joinedAt), endDate: archivedAt },
        otherMems.map((o) => ({ startDate: o.joinedAt, endDate: o.leftAt })),
        "date",
      );
    }

    user.isActive = false;
    user.archivedAt = archivedAt;
    await user.save();

    // Chiqish sababini a'zolikka ham snapshot bilan yozamiz, shunda retention
    // ("Chiqib ketish tahlili") hisoboti shu o'quvchini to'g'ri sabab bo'yicha
    // sanaydi - aks holda u "Sababsiz" guruhiga tushib qoladi.
    let leftReasonDetail = null;
    let leftReasonTitle = "";
    if (reasonId) {
      const reason = await ArchiveReason.findById(reasonId, { title: 1 }).lean();
      if (reason) {
        leftReasonDetail = reason._id;
        leftReasonTitle = reason.title;
      }
    }

    for (const m of memberships) {
      m.leftAt = archivedAt;
      m.leftReason = "removed";
      m.leftReasonDetail = leftReasonDetail;
      m.leftReasonTitle = leftReasonTitle;
      await m.save();
    }
    // Yopilgan a'zoliklar bo'yicha to'lovlar leftAt bilan qayta proratsiya bo'lsin (C1)
    try {
      await financePaymentService.recalcForStudent(user._id);
    } catch (err) {
      logger.warn({ err }, "Arxivlashda o'quvchi to'lovlari qayta hisoblanmadi");
    }
    // Yakunlash sanasi arxiv sanasiga ko'ra avto-belgilanadi (manual override bo'lmasa).
    await safeRecomputeStudentCompletion(user._id);
    try {
      await logArchiveAction({
        user: user._id,
        action: "archive",
        reasonId,
        by: by?._id,
      });
    } catch {
      // log yozilmasa ham arxivlash buzilmasin
    }
  } else {
    // O'qituvchining faol guruhi bo'lsa arxivlab bo'lmaydi (almashtirish/chiqarish kerak).
    await assertTeacherHasNoActiveGroup(user, "arxivlang");

    user.isActive = false;
    user.archivedAt = archivedAt;

    // ISHDAN BO'SHASH: o'qituvchi uchun arxivlash = ishdan bo'shash.
    // terminatedAt EXCLUSIVE - shu kundan boshlab maosh hisoblanmaydi.
    //
    // NEGA MUHIM: fiksa oylik (kind="base") TeacherCompensation'dan
    // avtomatik hisoblanadi va u guruhga bog'liq EMAS. Ya'ni guruhlari
    // bo'shatilgan bo'lsa ham, terminatedAt qo'yilmasa o'qituvchiga har oy
    // 2 mln hisoblanib boraverardi - "ishdan ketgan odamga maosh".
    if (user.role === ROLES.TEACHER) {
      user.terminatedAt = archivedAt;
      if (reasonId) {
        const reason = await ArchiveReason.findById(reasonId, { title: 1 }).lean();
        if (reason) user.terminationReason = reason.title;
      }
    }
    await user.save();

    // Ochiq maosh stavkasini yopamiz va shu sanadan keyingi oylarni qayta
    // hisoblaymiz. Best-effort: xato bo'lsa arxivlash bekor QILINMAYDI
    // (xodim allaqachon saqlangan), tungi job qolganini tuzatadi.
    if (user.role === ROLES.TEACHER) {
      try {
        const TeacherCompensation = (
          await import("../../../models/teacherCompensation.model.js")
        ).default;
        await TeacherCompensation.updateMany(
          { teacher: user._id, effectiveTo: null, isDeleted: { $ne: true } },
          { $set: { effectiveTo: archivedAt } },
        );
        const compensationService = await import(
          "../../teacherSalary/services/teacherCompensation.service.js"
        );
        await compensationService.recomputeFrom(user._id, archivedAt);
      } catch (err) {
        logger.warn(
          { err, userId: user._id },
          "Ishdan bo'shatishda maosh stavkasi yopilmadi",
        );
      }
    }
  }

  return user;
};

export const restore = async (id, { reasonId, by } = {}) => {
  const user = await getById(id);
  user.isActive = true;
  user.archivedAt = null;

  // ISHGA QAYTARISH: terminatedAt olib tashlanadi, lekin YOPILGAN maosh
  // stavkasi AVTOMATIK ochilmaydi - qaytgan o'qituvchi bilan yangi shartnoma
  // tuzilishi mumkin va eski stavkani jimgina tiklash noto'g'ri bo'lardi.
  // Owner uni profil sahifasidan qayta belgilaydi.
  const wasTerminated = Boolean(user.terminatedAt);
  user.terminatedAt = null;
  user.terminationReason = "";
  await user.save();

  if (user.role === ROLES.TEACHER && wasTerminated) {
    try {
      const compensationService = await import(
        "../../teacherSalary/services/teacherCompensation.service.js"
      );
      const active = await compensationService.getActive(user._id);
      if (!active) {
        const name = `${user.firstName} ${user.lastName || ""}`.trim();
        await systemNotificationsService.create({
          message: `${name} ishga qaytarildi, lekin maosh stavkasi yopiq holatda. Uni qayta belgilang - aks holda maosh 0 bo'lib hisoblanadi.`,
          link: `/users/${user._id}`,
        });
      }
    } catch {
      // bildirishnoma yuborilmasa ham qaytarish buzilmasin
    }
  }

  if (user.role === ROLES.STUDENT) {
    // archivedAt olib tashlangach yakunlash sanasi a'zolik tarixiga ko'ra qayta
    // hisoblanadi (faol a'zolik yo'q bo'lsa max leftAt'da qoladi).
    await safeRecomputeStudentCompletion(user._id);
    try {
      await logArchiveAction({
        user: user._id,
        action: "restore",
        reasonId,
        by: by?._id,
      });
    } catch {
      // log yozilmasa ham qaytarish buzilmasin
    }
  }

  return user;
};

// Butunlay (hard) o'chirish - hujjat va bog'liq ma'lumotlar TIKLAB BO'LMAYDIGAN
// tarzda drop qilinadi. O'QUVCHI ham, O'QITUVCHI ham cascade hard-delete qilinadi:
//  - O'quvchi: to'lov, depozit, a'zolik, davomat, baho... o'chadi.
//  - O'qituvchi: maosh hisoblari, maosh to'lovlari (chiqim), dars davrlari, HR
//    davomat/yo'qliklar o'chadi; guruhlar va ular ichidagi o'quvchilar saqlanadi
//    (bu o'qituvchi Group.teachers keshidan olib tashlanadi).
// Ikkalasi uchun ham tasdiqlash uchun to'liq ism ({confirmName}) talab etiladi;
// so'ng ta'sirlangan guruh maoshlari qayta hisoblanadi. Owner o'chirilmaydi.
export const permanentRemove = async (id, currentUser, { confirmName } = {}) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }

  const isStudent = user.role === ROLES.STUDENT;
  const isTeacher = user.role === ROLES.TEACHER;

  // ─── O'QITUVCHINI BUTUNLAY O'CHIRISH: DEYARLI HAR DOIM TAQIQLANADI ───
  //
  // NEGA eski shart ("to'lanmagan maoshi yo'q") YETARLI EMAS EDI:
  // maoshlar TO'LIQ to'langan bo'lsa ham, o'chirish SalaryTransaction
  // yozuvlarini olib ketardi. Ya'ni o'tgan yilning yanvar oyidagi 15 mln
  // so'mlik CHIQIM yo'q bo'lardi va o'sha oyning foydasi 15 mln ga OSHIB
  // ketardi. Bu buxgalteriya emas, tarixni tahrirlash.
  //
  // Shuning uchun endi o'chirish FAQAT "hech qachon ishlamagan" xodim uchun
  // ochiq (noto'g'ri yaratilgan hisob). Moliyaviy yoki audit izi bo'lsa -
  // arxivlash (soft delete) yagona to'g'ri yo'l: tarix saqlanadi, xodim
  // ro'yxatlardan yo'qoladi.
  //
  // DIQQAT: o'quvchilarga hech narsa bo'lmaydi - ular Group'ga tegishli,
  // o'qituvchiga emas. Guruh, a'zolik, to'lov va qarz joyida qoladi.
  if (isTeacher) {
    await assertTeacherHasNoActiveGroup(user, "o'chiring");

    const [salaryCount, txnCount, periodCount, attendanceCount] = await Promise.all([
      TeacherSalary.countDocuments({ teacher: user._id }),
      SalaryTransaction.countDocuments({ teacher: user._id }),
      TeacherGroupPeriod.countDocuments({ teacher: user._id }),
      Attendance.countDocuments({ recordedBy: user._id }),
    ]);

    const traces = [];
    if (salaryCount) traces.push(`${salaryCount} ta maosh yozuvi`);
    if (txnCount) traces.push(`${txnCount} ta maosh to'lovi`);
    if (periodCount) traces.push(`${periodCount} ta dars berish davri`);
    if (attendanceCount) traces.push(`${attendanceCount} ta davomat yozuvi`);

    if (traces.length) {
      throw new ApiError(
        400,
        `Bu o'qituvchida tarix bor (${traces.join(", ")}). Uni butunlay o'chirib bo'lmaydi - ` +
          `o'chirilsa o'tgan oylarning chiqimi yo'qolib, foyda hisoboti yolg'on bo'lardi. ` +
          `Buning o'rniga ARXIVLANG: tarix saqlanadi, o'qituvchi ro'yxatlardan yo'qoladi.`,
      );
    }
  }

  // O'quvchini o'chirish sharti: hech qanday guruhga biriktirilmagan bo'lsin (faol
  // a'zolik bo'lmasin). Guruhda bo'lsa - avval guruhdan chiqarish kerak.
  if (isStudent) {
    const inGroup = await GroupMembership.exists({
      student: user._id,
      leftAt: null,
      isDeleted: { $ne: true },
    });
    if (inGroup) {
      throw new ApiError(
        400,
        "O'quvchi guruhga biriktirilgan. Avval uni guruh(lar)dan chiqaring, so'ng o'chiring.",
      );
    }
  }

  if (isStudent || isTeacher) {
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    if (!confirmName || confirmName.trim() !== fullName) {
      throw new ApiError(
        400,
        "Tasdiqlash uchun foydalanuvchining to'liq ismini to'g'ri kiriting",
      );
    }

    // Barcha o'chirishlarni bitta tranzaksiyada (replica set yo'q bo'lsa - sessiyasiz).
    const groupIds = await runFinanceTxn(async (session) => {
      const gids = isStudent
        ? await hardDeleteStudentData(user._id, { session })
        : await hardDeleteTeacherData(user._id, { session });
      await purgeUserResidualData(user._id, { session });
      await User.deleteOne(
        { _id: user._id },
        session ? { session } : undefined,
      );
      return gids;
    });

    // Moliyaviy izchillik uchun ta'sirlangan guruh maoshlarini qayta hisoblaymiz:
    //  - O'quvchi o'chsa: guruh kirimi (groupRevenue) kamayadi → o'qituvchi
    //    maoshlari qayta hisoblanishi SHART (aks holda maosh bazasi xato qoladi).
    //  - O'qituvchi o'chsa: qolgan o'qituvchilar maoshi o'zaro bog'liq emas, shu
    //    sababli bu recalc amalda no-op - lekin xavfsizlik uchun (self-healing) qoldiriladi.
    for (const groupId of groupIds) {
      try {
        await teacherSalaryService.recalcForGroup(groupId);
      } catch (err) {
        logger.warn(
          { err, groupId },
          "Foydalanuvchi o'chirilgach guruh maoshlari qayta hisoblanmadi",
        );
      }
    }

    // Owner uchun tizim bildirishnomasi (best-effort).
    const roleLabel = isStudent ? "o'quvchi" : "o'qituvchi";
    try {
      await systemNotificationsService.create({
        message: `${fullName} (${roleLabel}) tizimdan butunlay o'chirildi`,
      });
    } catch {
      // bildirishnoma yozilmasa ham o'chirish buzilmasin
    }

    return { _id: user._id };
  }

  // Kutilmagan rollar (himoya): bog'liqlik bo'lsa o'chirib bo'lmaydi.
  const blockers = await findUserBlockingRelations(user._id);
  if (blockers.length > 0) {
    const detail = blockers.map((b) => `${b.label} (${b.count})`).join(", ");
    throw new ApiError(
      409,
      `Bu foydalanuvchini butunlay o'chirib bo'lmaydi: u quyidagi ma'lumotlarga bog'liq — ${detail}. Avval bu yozuvlarni o'chiring yoki foydalanuvchini arxivlang.`,
      { code: "USER_HAS_RELATIONS", details: blockers },
    );
  }

  // Bog'liqlik yo'q - qoldiq sessiya/audit ma'lumotini tozalab, hujjatni o'chiramiz.
  await purgeUserResidualData(user._id);
  await User.deleteOne({ _id: user._id });
  return { _id: user._id };
};

export const studentHistory = async (
  studentId,
  { page = 1, limit = 20 } = {},
) => {
  const user = await getById(studentId);
  if (user.role !== ROLES.STUDENT) {
    throw new ApiError(400, "Bu foydalanuvchi o'quvchi emas");
  }
  const filter = { student: studentId };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    GroupMembership.find(filter)
      .sort({ joinedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("group", { name: 1, schedule: 1 })
      .populate("transferredTo", { name: 1 }),
    GroupMembership.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

// Foydalanuvchiga rol biriktirish (built-in yoki custom).
// User.role'dan enum olib tashlangani uchun tekshiruv SHU YERDA:
//  - rol haqiqatan mavjudmi va muzlatilmaganmi;
//  - o'z rolini o'zgartirmayaptimi (o'zini qulflab qo'ymasin);
//  - tizimdagi oxirgi owner rolidan ayrilmayaptimi.
// ============================================================
// XODIM (direktor/administrator) YARATISH
// ============================================================
//
// NEGA auth.registerUser'dan ALOHIDA:
// registerUser qat'iy `student|teacher` ga bog'langan - validatorda
// z.enum, servisda qayta tekshiruv, va rolga xos majburiy maydonlar
// (o'qituvchiga hiredAt, o'quvchiga enrolledAt). Direktorga ularning
// birortasi ham kerak emas. registerUser'ni kengaytirish uni shartlar
// uyumiga aylantirardi.
//
// Bu funksiya BITTA amalda: foydalanuvchi + login/parol + filial + rol.
export const createStaff = async (body, currentUser) => {
  const phone = body.phone ? normalizePhone(body.phone) : null;
  if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");

  const username = String(body.username).toLowerCase().trim();

  if (phone) {
    const phoneTaken = await User.findOne({ phone });
    if (phoneTaken) {
      throw new ApiError(409, "Bu telefon raqam allaqachon ro'yxatdan o'tgan");
    }
  }
  const usernameTaken = await User.findOne({ username });
  if (usernameTaken) {
    throw new ApiError(409, "Bunday login (username) allaqachon mavjud");
  }

  // --- ROL tekshiruvi ---
  const targetRole = await assertRoleAssignable(body.role);
  // IMTIYOZ OSHIRISHDAN HIMOYA: o'zida yo'q ruxsatli rolni bera olmaydi,
  // va owner rolini faqat owner biriktira oladi.
  await assertCanGrantRole(targetRole, currentUser);

  // --- FILIAL tekshiruvi ---
  const homeBranchId = body.homeBranchId || null;
  if (!homeBranchId) throw new ApiError(400, "Filial tanlanishi shart");

  // Direktor faqat O'ZI kira oladigan filialga xodim qo'sha oladi.
  // Bu bo'lmasa u boshqa filialga odam qo'shib, keyin uning OCHIQ MATNDAGI
  // parolini /:id/password orqali o'qib olardi.
  assertCanAssignBranch(
    currentUser?.allowedBranchIds,
    currentUser?.canSeeAllBranches,
    homeBranchId,
  );

  const branch = await Branch.findOne({ _id: homeBranchId, isDeleted: false }).lean();
  if (!branch) throw new ApiError(400, "Filial topilmadi");

  // Qo'shimcha filiallar (ixtiyoriy) - har biri ham tekshiriladi.
  const branchAssignments = [];
  for (const a of body.branchAssignments || []) {
    assertCanAssignBranch(
      currentUser?.allowedBranchIds,
      currentUser?.canSeeAllBranches,
      a.branchId,
    );
    if (a.role) {
      const r = await assertRoleAssignable(a.role);
      await assertCanGrantRole(r, currentUser);
    }
    branchAssignments.push({ branchId: a.branchId, role: a.role || null });
  }

  const passwordHash = await hashPassword(body.password);

  const user = await User.create({
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    username,
    phone: phone || undefined,
    passwordHash,
    role: body.role,
    homeBranchId,
    branchAssignments,
    isActive: true,
    birthDate: body.birthDate ? new Date(body.birthDate) : null,
    // Kalendar kuni (UTC-midnight) - "bugun" mahalliy (Asia/Tashkent) kun bo'yicha.
    hiredAt: body.hiredAt ? parseLocalDay(body.hiredAt) : localTodayMidnight(),
  });

  // ISHGA OLISHDA OYLIK: forma bilan birga kelgan bo'lsa darhol stavka ochamiz.
  //
  // TASDIQ TAKRORLANMAYDI: bu yerga yetib kelish uchun ishga olish so'rovining
  // O'ZI allaqachon tasdiqdan o'tgan (yoki foydalanuvchida tasdiqdan ozod
  // qiluvchi ruxsat bor). Ikkinchi marta tasdiq so'rash xodimni "yaratilgan,
  // lekin maoshsiz" holatda qoldirardi.
  //
  // Best-effort: stavkadagi xato XODIM YARATILISHINI bekor qilmaydi - u
  // allaqachon saqlangan va tranzaksiya yo'q. Xato qaytariladi, owner
  // stavkani profil sahifasidan qayta kiritadi.
  if (body.role === ROLES.TEACHER && body.compensation) {
    try {
      const compensationService = await import(
        "../../teacherSalary/services/teacherCompensation.service.js"
      );
      await compensationService.setCompensation(
        {
          ...body.compensation,
          teacher: user._id,
          branchId: body.compensation.branchId ?? homeBranchId,
          effectiveFrom: body.compensation.effectiveFrom || user.hiredAt,
        },
        currentUser,
      );
    } catch (err) {
      logger.warn(
        { err, userId: user._id },
        "Ishga olishda maosh stavkasi belgilanmadi - profil orqali kiritish kerak",
      );
    }
  }

  return buildUserProfile(user);
};

/**
 * Xodimning filial biriktiruvini o'zgartirish.
 * Owner "bu odam qaysi filialda" ni tahrirlashi uchun.
 */
export const setBranches = async (id, body, currentUser) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");

  // Nishon joriy ko'lamda bo'lishi shart (boshqa filial xodimiga tegib bo'lmaydi).
  assertTargetInScope(
    currentUser?.allowedBranchIds,
    currentUser?.canSeeAllBranches,
    user,
  );

  if (body.homeBranchId !== undefined) {
    if (!body.homeBranchId) throw new ApiError(400, "Asosiy filial bo'sh bo'lmasligi kerak");
    assertCanAssignBranch(
      currentUser?.allowedBranchIds,
      currentUser?.canSeeAllBranches,
      body.homeBranchId,
    );
    const branch = await Branch.findOne({
      _id: body.homeBranchId,
      isDeleted: false,
    }).lean();
    if (!branch) throw new ApiError(400, "Filial topilmadi");
    user.homeBranchId = body.homeBranchId;
  }

  if (body.branchAssignments !== undefined) {
    const next = [];
    for (const a of body.branchAssignments || []) {
      assertCanAssignBranch(
        currentUser?.allowedBranchIds,
        currentUser?.canSeeAllBranches,
        a.branchId,
      );
      if (a.role) {
        const r = await assertRoleAssignable(a.role);
        await assertCanGrantRole(r, currentUser);
      }
      next.push({ branchId: a.branchId, role: a.role || null });
    }
    user.branchAssignments = next;
  }

  await user.save();
  return buildUserProfile(user);
};

export const setRole = async (id, role, currentUser) => {
  assertNotSelfRoleChange(currentUser, id);

  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");

  if (user.role === role) return buildUserProfile(user);

  const targetRole = await assertRoleAssignable(role);
  await assertNotLastOwner(id);

  // IMTIYOZ OSHIRISHDAN HIMOYA (avval YO'Q edi - teshik).
  // Bu tekshiruvsiz `roles.update` huquqi bor filial direktori boshqa
  // odamga OWNER rolini bera olardi va shu orqali butun tizimni egallardi.
  await assertCanGrantRole(targetRole, currentUser);

  // FILIAL: boshqa filial xodimining rolini o'zgartirib bo'lmaydi.
  assertTargetInScope(
    currentUser?.allowedBranchIds,
    currentUser?.canSeeAllBranches,
    user,
  );

  user.role = role;
  await user.save();

  // Rol o'zgardi - eski sessiyalar yangi ruxsat bilan ishlashi uchun
  // barcha refresh tokenlarni bekor qilamiz (qayta login talab qilinadi).
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return buildUserProfile(user);
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- ISHGA OLISH TASDIG'I (owner tasdig'i talab qilinganda) ---
//
// TASDIQLANMAGUNCHA User hujjati YARATILMAYDI. Bu ataylab:
//   - username/phone unique indeks so'rov paytidayoq band bo'lib qolardi
//     (owner ko'rmasidan turib "bunday login mavjud" xatosi chiqardi);
//   - "kutilmoqda" holatidagi odam ro'yxatlarga, davomatga va Telegram
//     botiga tushib ketardi - ya'ni ishga olinmagan odam tizimda ishlardi.
// So'rov ma'lumoti faqat Approval.payload ichida yashaydi.

/**
 * Ishga olishni TASDIQQA yuboradi (User yaratmaydi).
 *
 * Yengil tekshiruv: login/telefon bandligi (so'rovchiga darhol javob berish
 * uchun). Rol/filial huquqlari ATAYLAB bajarish paytida QAYTA tekshiriladi.
 */
export const requestHire = async (body, currentUser) => {
  const approvalService = await import(
    "../../expenseApprovals/services/expenseApproval.service.js"
  );
  const { APPROVAL_KINDS } = await import("../../../models/approval.model.js");

  const username = String(body.username).toLowerCase().trim();
  const phone = body.phone ? normalizePhone(body.phone) : null;
  if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");

  if (await User.findOne({ username })) {
    throw new ApiError(409, "Bunday login (username) allaqachon mavjud");
  }
  if (phone && (await User.findOne({ phone }))) {
    throw new ApiError(409, "Bu telefon raqam allaqachon ro'yxatdan o'tgan");
  }
  if (!body.homeBranchId) throw new ApiError(400, "Filial tanlanishi shart");

  const branch = await Branch.findOne({ _id: body.homeBranchId, isDeleted: false }).lean();
  if (!branch) throw new ApiError(400, "Filial topilmadi");

  return approvalService.createRequest({
    branchId: body.homeBranchId,
    kind: APPROVAL_KINDS.STAFF_HIRE,
    // DIQQAT: payload ichida parol bor. U o'qish javoblarida (list/getById)
    // OLIB TASHLANADI - qarang expenseApproval.service.js: stripSensitive().
    payload: { ...body, username, phone: phone || undefined },
    // Bitta login uchun bitta kutilayotgan so'rov.
    subjectKey: `staff_hire:${username}`,
    subjectName: `${body.firstName || ""} ${body.lastName || ""}`.trim(),
    contextName: branch.name || "",
    requestNote: body.requestNote,
    currentUser,
  });
};

/**
 * Tasdiqlangan ishga olish so'rovini BAJARADI.
 *
 * IMTIYOZ OSHIRISHDAN HIMOYA: createStaff SO'ROVCHINING huquqlari bilan
 * chaqiriladi, tasdiqlovchining emas. Aks holda direktor "owner rolidagi
 * foydalanuvchi yarat" deb so'rov yuborib, e'tiborsiz owner tasdiqlasa -
 * to'liq imtiyoz oshirish sodir bo'lardi. Huquqlar bajarish paytida QAYTA
 * hisoblanadi (so'rovdan keyin rol o'zgargan bo'lishi mumkin).
 */
export const executeApprovedHire = async (approval) => {
  const { collectPermissions, hasPermission } = await import(
    "../../../helpers/permission.helper.js"
  );
  const { resolveAllowedBranchIds } = await import(
    "../../../helpers/branchAccess.helper.js"
  );
  const { PERMISSIONS } = await import("../../../constants/permissions.js");

  const requester = await User.findById(approval?.requestedBy).lean();
  if (!requester) throw new ApiError(400, "So'rovchi topilmadi - so'rov bajarilmadi");

  const permissions = await collectPermissions(requester.role);
  const allowedBranchIds = await resolveAllowedBranchIds(requester, permissions);

  return createStaff(approval.payload || {}, {
    _id: requester._id,
    permissions,
    allowedBranchIds,
    // requireAuth bilan bir xil hisoblanadi - aks holda ko'lam tekshiruvi
    // bajarish paytida so'rov paytidagidan farq qilardi.
    canSeeAllBranches: hasPermission(permissions, PERMISSIONS.BRANCHES_VIEW_ALL),
  });
};
