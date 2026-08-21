import prisma from "../../../config/prisma.js";
import { resolveActorBranchIds } from "../../../helpers/credentialScope.helper.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES, ROLE_TYPES } from "../../../constants/roles.js";
import { normalizePhone } from "../../../utils/phone.js";
import { hashPassword } from "../../../helpers/password.helper.js";
import {
  assertTargetInScope,
  assertCanAssignBranch,
} from "../../../helpers/branchAccess.helper.js";
import { userBranchCondition } from "../../../helpers/branchContext.helper.js";
import { buildUserProfile } from "../../../helpers/userProfile.helper.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
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

// ═════════════════════════════════════════════════════════════════
// MONGO → PRISMA: SHU FAYLDA NIMA O'ZGARDI
//
// BIZNES MANTIQI O'ZGARMADI. Tekshiruvlar, xato matnlari, ruxsat
// chegaralari va qaytariladigan shakl avvalgidek. O'zgargani -
// ma'lumotga MUROJAAT usuli:
//
//   User.findById(id)            → prisma.user.findUnique({ where: { id } })
//   user.x = 1; await user.save()→ prisma.user.update({ where, data })
//   { student: id }              → { studentId: id }
//   { isDeleted: { $ne: true } } → { isDeleted: false }
//   { $or: [...] }               → { OR: [...] }
//   RegExp qidiruv               → { contains, mode: "insensitive" }
//   .populate("homeBranchId")    → include: { homeBranch: {...} } + qayta nomlash
//   aggregate([$group])          → groupBy({ by: [...], _count })
//
// IKKI NOZIK NUQTA:
//
// 1) `passwordHash`. Mongoose'da u `select: false` edi va oddiy
//    so'rovlarda umuman kelmasdi. Prisma'da bunday sozlama sxemada
//    yo'q - o'rniga GLOBAL `omit` qo'yilgan (config/prisma.js).
//    Ya'ni parol baribir o'z-o'zidan qaytmaydi, lekin uni olish uchun
//    ochiq `omit: { passwordHash: false }` yozish SHART (getPassword).
//
// 2) `_id`. Prisma `id` qaytaradi, frontend esa `_id` o'qiydi.
//    Shuning uchun JAVOB CHEGARASIDA `withLegacyId` qo'llanadi.
//    Ichkarida (servis ichida) HAR DOIM `id` ishlatiladi - aralashtirish
//    `branchId: undefined` sinfidagi jimgina xatolarni keltirib chiqaradi.
// ═════════════════════════════════════════════════════════════════

const STUDENT_ONLY_FIELDS = ["enrolledAt", "completedAt"];
const TEACHER_ONLY_FIELDS = ["hiredAt"];

// Ko'lam tekshiruvi (assertTargetInScope) foydalanuvchining BARCHA
// filiallarini biladi degan taxminga asoslanadi: homeBranchId VA
// branchAssignments[]. Prisma relation'ni so'ralmasa qaytarmaydi, ya'ni
// uni unutish qo'shimcha filialga biriktirilgan xodimni "begona" qilib
// ko'rsatardi. Shuning uchun yagona konstanta.
const SCOPE_INCLUDE = {
  branchAssignments: { select: { branchId: true, role: true } },
};

// O'qituvchining FAOL guruhi bo'lsa arxivlash/faolsizlantirishni bloklaydi.
// Ikkala manba tekshiriladi: Group.teachers keshi (UI shuni ko'rsatadi) VA ochiq
// dars davri (TeacherGroupPeriod) - biror-birida bo'lsa ham bloklanadi. Avval
// o'qituvchini boshqa (bo'sh vaqti mos) o'qituvchiga almashtirish yoki guruhdan
// chiqarish kerak.
const assertTeacherHasNoActiveGroup = async (user, actionVerb = "arxivlang") => {
  if (!user || user.role !== ROLES.TEACHER) return;

  const openPeriods = await prisma.teacherGroupPeriod.findMany({
    where: { teacherId: user.id, endDate: null, isDeleted: false },
    select: { groupId: true },
  });

  const activeGroups = await prisma.group.findMany({
    where: {
      OR: [
        // `Group.teachers` endi ko'p-ko'pga bog'lanish (massiv emas):
        // Mongo'dagi `{ teachers: user._id }` ekvivalenti - `some`.
        { teachers: { some: { id: user.id } } },
        // Bo'sh ro'yxatda `{ in: [] }` hech nimaga mos kelmaydi - to'g'ri.
        { id: { in: openPeriods.map((p) => p.groupId) } },
      ],
      isActive: true,
      isDeleted: false,
    },
    select: { name: true },
  });

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

// `homeBranch` relation'ini ESKI nomga qaytaradi.
//
// Mongoose `.populate("homeBranchId")` maydonning O'ZINI obyektga
// aylantirardi va client aynan shunga tayanadi (`u.homeBranchId?.name` -
// StaffTable.jsx). Prisma esa `homeBranchId` ni satr qoldirib, obyektni
// `homeBranch` deb alohida beradi. Qayta nomlamasak jadvaldagi "Filial"
// ustuni jimgina bo'sh qolardi.
const withBranchShape = (row) => {
  const out = withLegacyId(row);
  if (row.homeBranch !== undefined) {
    out.homeBranchId = row.homeBranch ? withLegacyId(row.homeBranch) : null;
    delete out.homeBranch;
  }
  return out;
};

// O'quvchilar ro'yxatiga faol guruhlarni qo'shadi -
// ro'yxatdan profil ochmasdan ko'rinishi uchun (at-a-glance).
const enrichStudents = async (items) => {
  const studentIds = items
    .filter((u) => u.role === ROLES.STUDENT)
    .map((u) => u.id);
  if (studentIds.length === 0) return items.map(withBranchShape);

  const [membershipRows, freezeMap] = await Promise.all([
    prisma.groupMembership.findMany({
      where: { studentId: { in: studentIds }, leftAt: null, isDeleted: false },
      select: {
        studentId: true,
        group: { select: { id: true, name: true } },
      },
    }),
    studentFreezeService.getActiveFreezeMap(studentIds),
  ]);

  const groupsMap = new Map();
  for (const m of membershipRows) {
    if (!m.group) continue;
    const key = String(m.studentId);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    // Client `g._id` o'qiydi (UsersTable.jsx guruh chiplari).
    groupsMap.get(key).push({ _id: m.group.id, id: m.group.id, name: m.group.name });
  }

  return items.map((u) => {
    const obj = withBranchShape(u);
    if (u.role === ROLES.STUDENT) {
      obj.activeGroups = groupsMap.get(String(u.id)) || [];
      const fr = freezeMap.get(String(u.id));
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

  const ids = rows.map((u) => String(u.id));
  const now = new Date();

  // TIRIK SESSIYA: bekor qilinmagan va muddati o'tmagan refresh token.
  //
  // Mongo'da bu `$cond`/`$ifNull` bilan to'la aggregate quvuri edi, chunki
  // `revokedAt` maydoni tirik hujjatda UMUMAN BO'LMASDI. Postgres ustunida
  // esa NULL - shuning uchun shart to'g'ridan-to'g'ri `where` ga ko'chdi va
  // quvurning o'zi keraksiz bo'lib qoldi.
  const sessions = await prisma.refreshToken.groupBy({
    by: ["userId"],
    where: { userId: { in: ids }, revokedAt: null, expiresAt: { gt: now } },
    _count: { _all: true },
  });

  const sessionMap = new Map(
    sessions.map((s) => [String(s.userId), s._count._all]),
  );

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
      activeSessions: sessionMap.get(String(u.id)) || 0,
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
  // "Muzlatilgan" - faqat O'QUVCHI tushunchasi (where.id muzlatilgan
  // o'quvchilar bilan cheklanadi). Xodimlar ro'yxatida u DOIM bo'sh natija
  // berardi, shuning uchun "faol"ga tushiriladi.
  const effectiveStatus = staff && status === "frozen" ? "active" : status;

  // status: "active" → faqat faol, "archived" → faqat arxiv,
  // "frozen" → hozir muzlatilgan (faol o'quvchilar ichida), "all" → hammasi.
  const where = { isDeleted: false };
  if (effectiveStatus === "active") where.isActive = true;
  else if (effectiveStatus === "archived") where.isActive = false;
  else if (effectiveStatus === "frozen") {
    where.isActive = true;
    where.id = { in: await studentFreezeService.getActiveFrozenStudentIds() };
  }

  // Rol berilsa - o'sha rol; `staff` bayrog'i bilan XODIMLAR (o'quvchi
  // TIPIDAGI rollardan boshqa hamma: owner + o'qituvchi + custom rollar);
  // aks holda ("Hammasi") faqat o'quvchi/o'qituvchi.
  //
  // Aniq `role` ustun turadi - kartochkadan "faqat direktorlar" filtri shu
  // orqali ishlaydi, qo'shimcha kodsiz.
  const catalog = staff ? await loadRoleCatalog() : null;
  where.role = role
    ? role
    : staff
      ? staffRoleFilter(catalog) // { notIn: [...] }
      : { in: [ROLES.STUDENT, ROLES.TEACHER] };

  if (search && search.trim()) {
    // RegExp KERAK EMAS: `contains` xom SATRNI qidiradi (Prisma LIKE
    // maxsus belgilarini o'zi ekranlaydi), shuning uchun eski
    // `escapeRegex` funksiyasi ham olib tashlandi - u endi hech nimadan
    // himoya qilmasdi, faqat qidiruv matnini buzardi.
    const q = search.trim();
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { username: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  // FILIAL KO'LAMI.
  //
  // DIQQAT: `AND` ishlatiladi, `OR` EMAS - yuqorida qidiruv allaqachon
  // `OR` ni band qilgan. Ikkinchi `OR` birinchisini bosib ketardi va
  // qidiruv filial filtrini butunlay yo'q qilardi (jimgina sizish).
  // Prisma yuqori darajadagi barcha kalitlarni o'zaro AND qiladi, ya'ni
  // `OR` + `AND` birga to'g'ri ishlaydi.
  const branchCond = userBranchCondition();
  if (branchCond) {
    where.AND = [...(where.AND || []), branchCond];
  }

  const dir = order === "asc" ? "asc" : "desc";
  const skip = (page - 1) * limit;
  const sortField = USER_SORT_FIELDS[sort] || "createdAt";

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [sortField]: dir },
      skip,
      take: limit,
      // FILIAL nomi jadvalda ko'rsatiladi - ID yetarli emas.
      include: {
        homeBranch: { select: { id: true, name: true, code: true } },
        ...SCOPE_INCLUDE,
      },
    }),
    prisma.user.count({ where }),
  ]);

  // enrichStudents ikkala yo'lda ham ODDIY obyekt qaytaradi, shuning uchun
  // xodim boyitilishi uning ustidan ishlaydi.
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
  const where = { isDeleted: false, role: staffRoleFilter(catalog) };

  // Mongo'da aggregate quvuri pre-find hooklarni CHETLAB O'TARDI va shu
  // sababli filial sharti qo'lda qo'shilishi kerak edi. Prisma'da yashirin
  // hook umuman yo'q - `groupBy` ham oddiy `where` ni oladi, ya'ni bu yerda
  // "unutib qo'yish" xavfi qolmadi. Shart baribir ochiq yoziladi.
  const branchCond = userBranchCondition();
  if (branchCond) where.AND = [branchCond];

  // Mongo `$group` + `$cond` o'rniga ikkita `groupBy`: jami va faol.
  // Ikkalasi ham indekslangan `where` bo'yicha - bitta quvurdan tez.
  const [totals, actives] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where, _count: { _all: true } }),
    prisma.user.groupBy({
      by: ["role"],
      where: { ...where, isActive: true },
      _count: { _all: true },
    }),
  ]);

  const activeMap = new Map(actives.map((r) => [r.role, r._count._all]));

  // Tartib: Ega -> xodimlar -> o'qituvchilar, ichida yorliq bo'yicha.
  const ORDER = {
    [ROLE_TYPES.OWNER]: 0,
    [ROLE_TYPES.STAFF]: 1,
    [ROLE_TYPES.TEACHER]: 2,
  };

  const byRole = totals
    .map((r) => {
      const meta = catalog.get(r.role);
      const roleType =
        meta?.roleType ||
        (r.role === ROLES.OWNER ? ROLE_TYPES.OWNER : ROLE_TYPES.STAFF);
      const total = r._count._all;
      const active = activeMap.get(r.role) || 0;
      return {
        role: r.role,
        label: meta?.label || r.role,
        roleType,
        isFrozen: Boolean(meta?.isFrozen),
        total,
        active,
        archived: total - active,
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
 * LOGIN (username) band emasligini oldindan tekshiradi.
 *
 * Tekshiruv `auth.service.registerUser` bilan AYNAN bir xil qoidada
 * bo'lishi shart, aks holda forma "bo'sh" deb ko'rsatib, saqlashda 409
 * beradi - bu birinchi xatodan ham yomon. Shuning uchun bu yerda ham:
 *   - qidiruv ARXIVLANGAN va o'chirilgan foydalanuvchilarni ham qamraydi
 *     (login ular bilan ham band bo'lib turadi);
 *   - filial ko'lami QO'LLANMAYDI: boshqa filialdagi odamning logini ham
 *     band, lekin uning kimligi oshkor qilinmaydi - faqat "band" bayrog'i.
 *
 * TELEFON BU YERDA TEKSHIRILMAYDI: takrorlanish endi ruxsat etilgan
 * (qarang: prisma/schema.prisma, User.phone). `phone` parametri hamon
 * qabul qilinadi (eski clientlar yuboradi), lekin javobga qo'shilmaydi.
 */
export const checkAvailability = async ({ username, excludeId } = {}) => {
  const result = {};
  const login = String(username || "").toLowerCase().trim();
  if (login) {
    const exists = await prisma.user.findFirst({
      where: {
        username: login,
        ...(excludeId ? { id: { not: String(excludeId) } } : {}),
      },
      select: { id: true },
    });
    result.username = { taken: Boolean(exists) };
  }
  return result;
};

/**
 * Foydalanuvchini ID bo'yicha oladi (ichki ishlatish uchun ham).
 *
 * `branchAssignments` HAR DOIM yuklanadi - qarang SCOPE_INCLUDE izohi.
 *
 * NOTO'G'RI ID: Mongoose `findById("abc")` CastError bilan 500 berardi;
 * Prisma'da kalit oddiy satr, ya'ni mos kelmasa shunchaki `null` -
 * va biz uni 404 ga aylantiramiz. Bu xatti-harakat yaxshilanishi.
 */
export const getById = async (id) => {
  const user = await prisma.user.findUnique({
    where: { id: String(id) },
    include: SCOPE_INCLUDE,
  });
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  return user;
};

export const getProfile = async (id) => {
  const user = await getById(id);
  return buildUserProfile(user);
};

export const update = async (id, body, currentUser = null, scope = null) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini tahrirlab bo'lmaydi");
  }

  // FILIAL HIMOYASI.
  //
  // Ilgari bu route requireRole(OWNER) bilan qulflangan edi, ya'ni
  // faqat owner kirardi va tekshiruv keraksiz tuyulardi. Endi u
  // `users.update` ruxsatiga ochilgan (filial direktori O'Z xodimini
  // tahrirlashi kerak), shuning uchun chegara SHU YERDA qo'yiladi.
  //
  // `scope` berilmasa (seed / job / ichki chaqiruv) tekshirilmaydi -
  // ular kontekstdan tashqarida ishlaydi.
  if (scope) {
    assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, user);
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

  // Mongoose'da hujjat maydonlari o'rniga qo'yilib, oxirida `save()`
  // chaqirilardi. Prisma'da o'zgarishlar `data` obyektiga yig'iladi va
  // BITTA `update` bilan yoziladi.
  //
  // DIQQAT: Prisma'da `undefined` = "bu maydonga tegma", `null` = "NULL
  // yoz". Mongoose'dagi `= undefined` esa maydonni O'CHIRARDI. Shuning
  // uchun tozalash kerak bo'lgan joyda ochiq `null` yoziladi.
  const data = {};

  // Asosiy maydonlar
  if (body.firstName !== undefined) data.firstName = body.firstName.trim();
  if (body.lastName !== undefined) data.lastName = body.lastName.trim();
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
    data.isActive = !!body.isActive;
  }

  if (body.phone !== undefined) {
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");
    data.phone = phone || null;
  }

  // Profil maydonlari (har qanday rol uchun)
  if (body.birthDate !== undefined) {
    data.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  }
  if (body.gender !== undefined) {
    data.gender = body.gender || null;
  }

  // Student-specific
  let recomputeCompletion = false;
  if (user.role === ROLES.STUDENT) {
    // Ro'yxatga olingan sana shu chaqiruvda o'zgargan bo'lishi mumkin -
    // pastdagi "yakunlash sanasi" tekshiruvi YANGI qiymatga tayanishi
    // kerak (Mongoose'da hujjat o'sha yerda mutatsiya qilinardi).
    let nextEnrolledAt = user.enrolledAt;

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
        const earliest = await prisma.groupMembership.findFirst({
          where: { studentId: user.id, isDeleted: false },
          select: { joinedAt: true },
          orderBy: { joinedAt: "asc" },
        });
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
      data.enrolledAt = d;
      nextEnrolledAt = d;
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
        if (nextEnrolledAt && d.getTime() < toUtcMidnight(nextEnrolledAt).getTime()) {
          throw new ApiError(400, "Yakunlash sanasi ro'yxatga olingan sanadan oldin bo'lmasin");
        }
        data.completedAt = d;
        data.completedAtManual = true;
      } else {
        data.completedAt = null;
        data.completedAtManual = false;
        recomputeCompletion = true;
      }
    }
  }

  // Teacher-specific
  let hiredAtAudit = null;
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

      // HR SANASI - MOLIYAGA TA'SIR QILMAYDI, lekin IZI QOLADI.
      //
      // Bu yerda ATAYLAB hech qanday qayta hisob chaqirilmaydi: maosh
      // yaratish/qayta hisoblash mustaqil, qo'lda boshlanadigan amal
      // (staffPayroll/history/*). Lekin o'zgarishning o'zi auditga
      // yoziladi - keyin "sana qachon va kim tomonidan surildi?" degan
      // savolga javob bo'lishi kerak.
      const previousHiredAt = user.hiredAt;
      data.hiredAt = d;
      if (String(previousHiredAt || "") !== String(d || "")) {
        hiredAtAudit = { from: previousHiredAt, to: d };
      }
    }
  }

  const saved = await prisma.user.update({
    where: { id: user.id },
    data,
    include: SCOPE_INCLUDE,
  });

  if (hiredAtAudit) {
    // Dinamik import - modullar orasida sikl bo'lmasin.
    const audit = await import(
      "../../staffPayroll/services/payrollAudit.service.js"
    );
    await audit.record({
      employee: saved.id,
      action: audit.PAYROLL_AUDIT_ACTIONS.EMPLOYMENT_DATE_CHANGED,
      targetType: "user",
      targetId: saved.id,
      oldValue: { hiredAt: hiredAtAudit.from },
      newValue: { hiredAt: hiredAtAudit.to },
      actor: currentUser,
    });
  }

  // Override bo'shatilgan bo'lsa - avtomatik qiymatni qayta hisoblaymiz.
  if (recomputeCompletion) {
    await safeRecomputeStudentCompletion(saved.id);
    return withLegacyId(await getById(id));
  }
  return withLegacyId(saved);
};

/**
 * PAROL AMALLARI UCHUN AKTYORNING HAQIQIY FILIALLARI.
 *
 * NEGA UZATILGAN `allowedBranchIds` GA ISHONMAYMIZ: u
 * resolveBranchScope() natijasi va `branches.view_all` ruxsati bo'lsa
 * ICHIGA BARCHA FILIALLAR solinadi. Ya'ni "A filial direktori" ning
 * ro'yxatida B filial ham turadi va kesishuv tekshiruvi o'tib ketadi -
 * natijada u B filial xodimining ochiq matndagi parolini o'qiydi
 * (tests/privEscalation.test.js "A) DRIFT").
 *
 * view_all HISOBOT uchun to'g'ri, MAXFIY MA'LUMOT uchun emas. Shuning
 * uchun bu yerda faqat odamning O'ZIGA BIRIKTIRILGAN filiallari
 * hisobga olinadi.
 *
 * Bo'sh massiv qaytishi ham to'g'ri natija: hech qaysi filialga
 * biriktirilmagan (yoki aktyori noma'lum) chaqiruv hech kimning
 * parolini ko'rmasligi kerak - fail-closed.
 */
// `resolveActorBranchIds` `helpers/credentialScope.helper.js` GA
// KO'CHIRILDI: ayni qoidani filiallar ro'yxati ham ishlatadi
// (`branches.service.js` — kartadagi login/parol). Ikki nusxa bo'lsa,
// bittasi tuzatilib, ikkinchisi eski holicha qolib ketardi.

// Owner uchun: login va parolni qaytaradi. Parol OCHIQ MATNDA saqlanadi,
// shu sababli to'g'ridan-to'g'ri o'qib ko'rsatiladi.
export const getPassword = async (id, currentUser) => {
  // `omit: { passwordHash: false }` - Mongoose'dagi `.select("+passwordHash")`
  // ning aynan ekvivalenti. Global `omit` (config/prisma.js) parolni har
  // qanday boshqa so'rovdan chetlatadi; faqat SHU YER uni ataylab so'raydi.
  const user = await prisma.user.findUnique({
    where: { id: String(id) },
    omit: { passwordHash: false },
    include: SCOPE_INCLUDE,
  });
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini ko'rib bo'lmaydi");
  }

  // FILIAL HIMOYASI (eng muhim tekshiruv).
  //
  // Parollar OCHIQ MATNDA saqlanadi. requireRole(OWNER) uchinchi bosqichda
  // system.admin_access borlarni ham o'tkazadi - ya'ni filial direktori
  // shu endpoint orqali BOSHQA filial xodimining parolini o'qiy olardi.
  //
  // DIQQAT - uzatilgan `allowedBranchIds`/`canSeeAllBranches` ATAYLAB
  // ISHLATILMAYDI. Sabab resolveActorBranchIds izohida: `view_all`
  // ikkalasini ham kengaytiradi va zaiflik aynan shundan kelib chiqadi.
  // Faqat HAQIQIY owner (roleType === "owner") cheklovsiz o'qiydi.
  const actorBranchIds = await resolveActorBranchIds(currentUser?.actorId);
  assertTargetInScope(actorBranchIds, Boolean(currentUser?.isOwner), user);

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
  // getPassword bilan AYNI qoida - sabablari o'sha yerda.
  const actorBranchIds = await resolveActorBranchIds(currentUser?.actorId);
  assertTargetInScope(actorBranchIds, Boolean(currentUser?.isOwner), user);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Parol o'zgargach barcha eski sessiyalarni bekor qilamiz
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return { username: user.username, password: newPassword };
};

export const softRemove = async (id, { reasonId, archiveDate, by, scope } = {}) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }

  // FILIAL HIMOYASI - sabab update() dagi izohda.
  if (scope) {
    assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, user);
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

  // ─── O'QUVCHI SHOXI: HOZIRDA ERISHIB BO'LMAYDI ───
  //
  // Yuqoridagi to'siq o'quvchini shartsiz rad etadi, ya'ni bu blok
  // ishlamaydi. U ATAYLAB SAQLANDI (o'chirilmadi): siyosat o'zgarib,
  // o'quvchini arxivlash qayta ochilsa - a'zolikni yopish, sababni
  // snapshot qilish va to'lovni qayta proratsiya qilish mantiqi shu
  // yerda tayyor turadi. Migratsiya doirasida u ham Prisma'ga o'girildi,
  // aks holda kod "ko'chirilgan" ko'rinib, aslida ishlamas holatda
  // qolardi.
  if (user.role === ROLES.STUDENT) {
    if (user.enrolledAt && archivedAt.getTime() < toUtcMidnight(user.enrolledAt).getTime()) {
      throw new ApiError(400, "Arxiv sanasi ro'yxatga olingan sanadan oldin bo'lishi mumkin emas");
    }

    const memberships = await prisma.groupMembership.findMany({
      where: { studentId: user.id, leftAt: null, isDeleted: false },
      select: { id: true, groupId: true, joinedAt: true },
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
      const otherMems = await prisma.groupMembership.findMany({
        where: {
          groupId: m.groupId,
          studentId: user.id,
          id: { not: m.id },
          isDeleted: false,
        },
        select: { joinedAt: true, leftAt: true },
      });
      assertPeriodInvariants(
        { startDate: toUtcMidnight(m.joinedAt), endDate: archivedAt },
        otherMems.map((o) => ({ startDate: o.joinedAt, endDate: o.leftAt })),
        "date",
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false, archivedAt },
    });

    // Chiqish sababini a'zolikka ham snapshot bilan yozamiz, shunda retention
    // ("Chiqib ketish tahlili") hisoboti shu o'quvchini to'g'ri sabab bo'yicha
    // sanaydi - aks holda u "Sababsiz" guruhiga tushib qoladi.
    let leftReasonDetailId = null;
    let leftReasonTitle = "";
    if (reasonId) {
      const reason = await prisma.archiveReason.findUnique({
        where: { id: String(reasonId) },
        select: { id: true, title: true },
      });
      if (reason) {
        leftReasonDetailId = reason.id;
        leftReasonTitle = reason.title;
      }
    }

    // Mongo'da har bir hujjat alohida `save()` qilinardi. Prisma'da bir xil
    // qiymat yozilayotgani uchun BITTA `updateMany` yetadi.
    if (memberships.length) {
      await prisma.groupMembership.updateMany({
        where: { id: { in: memberships.map((m) => m.id) } },
        data: {
          leftAt: archivedAt,
          leftReason: "removed",
          leftReasonDetailId,
          leftReasonTitle,
        },
      });
    }

    // Yopilgan a'zoliklar bo'yicha to'lovlar leftAt bilan qayta proratsiya bo'lsin (C1)
    try {
      await financePaymentService.recalcForStudent(user.id);
    } catch (err) {
      logger.warn({ err }, "Arxivlashda o'quvchi to'lovlari qayta hisoblanmadi");
    }
    // Yakunlash sanasi arxiv sanasiga ko'ra avto-belgilanadi (manual override bo'lmasa).
    await safeRecomputeStudentCompletion(user.id);
    try {
      await logArchiveAction({
        user: user.id,
        action: "archive",
        reasonId,
        by: by?.id || by?._id,
      });
    } catch {
      // log yozilmasa ham arxivlash buzilmasin
    }

    return withLegacyId(await getById(user.id));
  }

  // ─── XODIM / O'QITUVCHI SHOXI ───

  // O'qituvchining faol guruhi bo'lsa arxivlab bo'lmaydi (almashtirish/chiqarish kerak).
  await assertTeacherHasNoActiveGroup(user, "arxivlang");

  const data = { isActive: false, archivedAt };

  // ISHDAN BO'SHASH: o'qituvchi uchun arxivlash = ishdan bo'shash.
  // terminatedAt EXCLUSIVE - shu kundan boshlab maosh hisoblanmaydi.
  //
  // NEGA MUHIM: fiksa oylik (kind="base") TeacherCompensation'dan
  // avtomatik hisoblanadi va u guruhga bog'liq EMAS. Ya'ni guruhlari
  // bo'shatilgan bo'lsa ham, terminatedAt qo'yilmasa o'qituvchiga har oy
  // 2 mln hisoblanib boraverardi - "ishdan ketgan odamga maosh".
  if (user.role === ROLES.TEACHER) {
    data.terminatedAt = archivedAt;
    if (reasonId) {
      const reason = await prisma.archiveReason.findUnique({
        where: { id: String(reasonId) },
        select: { title: true },
      });
      if (reason) data.terminationReason = reason.title;
    }
  }

  const saved = await prisma.user.update({
    where: { id: user.id },
    data,
    include: SCOPE_INCLUDE,
  });

  // Ochiq maosh stavkasini yopamiz va shu sanadan keyingi oylarni qayta
  // hisoblaymiz. Best-effort: xato bo'lsa arxivlash bekor QILINMAYDI
  // (xodim allaqachon saqlangan), tungi job qolganini tuzatadi.
  if (user.role === ROLES.TEACHER) {
    try {
      await prisma.teacherCompensation.updateMany({
        where: { teacherId: user.id, effectiveTo: null, isDeleted: false },
        data: { effectiveTo: archivedAt },
      });
      const compensationService = await import(
        "../../teacherSalary/services/teacherCompensation.service.js"
      );
      await compensationService.recomputeFrom(user.id, archivedAt);
    } catch (err) {
      logger.warn(
        { err, userId: user.id },
        "Ishdan bo'shatishda maosh stavkasi yopilmadi",
      );
    }
  }

  return withLegacyId(saved);
};

export const restore = async (id, { reasonId, by, scope } = {}) => {
  const user = await getById(id);

  // FILIAL HIMOYASI - sabab update() dagi izohda.
  // Arxivlash bilan bir xil chegara: boshqa filialning arxivlangan
  // xodimini tiklab, uni o'z ro'yxatiga chiqarib olish mumkin edi.
  if (scope) {
    assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, user);
  }

  // ISHGA QAYTARISH: terminatedAt olib tashlanadi, lekin YOPILGAN maosh
  // stavkasi AVTOMATIK ochilmaydi - qaytgan o'qituvchi bilan yangi shartnoma
  // tuzilishi mumkin va eski stavkani jimgina tiklash noto'g'ri bo'lardi.
  // Owner uni profil sahifasidan qayta belgilaydi.
  const wasTerminated = Boolean(user.terminatedAt);

  const saved = await prisma.user.update({
    where: { id: user.id },
    data: {
      isActive: true,
      archivedAt: null,
      terminatedAt: null,
      terminationReason: "",
    },
    include: SCOPE_INCLUDE,
  });

  if (saved.role === ROLES.TEACHER && wasTerminated) {
    try {
      const compensationService = await import(
        "../../teacherSalary/services/teacherCompensation.service.js"
      );
      const active = await compensationService.getActive(saved.id);
      if (!active) {
        const name = `${saved.firstName} ${saved.lastName || ""}`.trim();
        await systemNotificationsService.create({
          message: `${name} ishga qaytarildi, lekin maosh stavkasi yopiq holatda. Uni qayta belgilang - aks holda maosh 0 bo'lib hisoblanadi.`,
          link: `/users/${saved.id}`,
        });
      }
    } catch {
      // bildirishnoma yuborilmasa ham qaytarish buzilmasin
    }
  }

  if (saved.role === ROLES.STUDENT) {
    // archivedAt olib tashlangach yakunlash sanasi a'zolik tarixiga ko'ra qayta
    // hisoblanadi (faol a'zolik yo'q bo'lsa max leftAt'da qoladi).
    await safeRecomputeStudentCompletion(saved.id);
    try {
      await logArchiveAction({
        user: saved.id,
        action: "restore",
        reasonId,
        by: by?.id || by?._id,
      });
    } catch {
      // log yozilmasa ham qaytarish buzilmasin
    }
  }

  return withLegacyId(saved);
};

// Butunlay (hard) o'chirish - yozuv va bog'liq ma'lumotlar TIKLAB BO'LMAYDIGAN
// tarzda drop qilinadi. O'QUVCHI ham, O'QITUVCHI ham cascade hard-delete qilinadi:
//  - O'quvchi: to'lov, depozit, a'zolik, davomat, baho... o'chadi.
//  - O'qituvchi: maosh hisoblari, maosh to'lovlari (chiqim), dars davrlari, HR
//    davomat/yo'qliklar o'chadi; guruhlar va ular ichidagi o'quvchilar saqlanadi
//    (bu o'qituvchi Group.teachers ro'yxatidan olib tashlanadi).
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

    // ─── MATERIALLIK: qator MAVJUDLIGI emas, undagi PUL tekshiriladi ───
    //
    // Eski shart qatorlarni shunchaki SANARDI. Lekin oylik cron
    // (generateMonthlySalary) har oy HAR BIR o'qituvchiga `base`/`group`
    // qatorini avtomatik ochadi - hech qachon dars bermagan, xato kiritilgan
    // xodimda ham bir yildan keyin 12 ta BO'SH (0 hisoblangan, 0 to'langan)
    // qator paydo bo'ladi. Natijada bunday hisobni o'chirishning ILOJI
    // QOLMAYDI: qorovul hech qachon bo'shamaydigan shartga bog'langan edi.
    //
    // Endi faqat HAQIQIY moliyaviy iz to'sadi. Bo'sh qator o'chsa foyda
    // hisoboti o'zgarmaydi (0 ni ayirish ham, qo'shish ham bir xil).
    const [salaryRows, txnCount, periodCount] = await Promise.all([
      prisma.teacherSalary.findMany({
        where: {
          teacherId: user.id,
          OR: [{ expectedAmount: { not: 0 } }, { paidAmount: { gt: 0 } }],
        },
        select: { expectedAmount: true, paidAmount: true },
      }),
      prisma.salaryTransaction.count({ where: { teacherId: user.id } }),
      // Haqiqiy dars tarixi = kamida bir kun davom etgan (yoki hali ochiq)
      // davr. Ochilgan kuniyoq yopilgan davr (startDate === endDate) bir
      // kunlik ham maosh hosil qilmaydi - xato kiritma, tarix emas.
      //
      // Mongo'da bu `$expr: { $gt: ["$endDate", "$startDate"] }` edi.
      // Prisma'da ustunni ustunga solishtirish uchun "field reference"
      // ishlatiladi - `prisma.<model>.fields.<ustun>`.
      prisma.teacherGroupPeriod.count({
        where: {
          teacherId: user.id,
          isDeleted: false,
          OR: [
            { endDate: null },
            { endDate: { gt: prisma.teacherGroupPeriod.fields.startDate } },
          ],
        },
      }),
    ]);

    // DAVOMAT ATAYLAB SANALMAYDI. `Attendance.recordedById` - "kim belgiladi"
    // degan audit maydoni, moliyaviy iz emas; davomatning O'ZI guruhga
    // tegishli va joyida qoladi. O'chirishda havola null'ga tushadi
    // (hardDeleteTeacherData), ya'ni davomat tarixi buzilmaydi.

    const traces = [];
    if (salaryRows.length) traces.push(`${salaryRows.length} ta maosh yozuvi`);
    if (txnCount) traces.push(`${txnCount} ta maosh to'lovi`);
    if (periodCount) traces.push(`${periodCount} ta dars berish davri`);

    if (traces.length) {
      // To'lanmagan qoldiq - owner uchun ENG muhim raqam: "Hisobni yopish"
      // aynan shuni nolga tushiradi.
      const outstanding = salaryRows.reduce(
        (sum, r) =>
          sum + Math.max((r.expectedAmount || 0) - (r.paidAmount || 0), 0),
        0,
      );
      const hint = outstanding
        ? ` Hozircha ${outstanding.toLocaleString("ru-RU")} so'm to'lanmagan maosh turibdi - ` +
          `avval "Hisobni yopish" orqali uni nolga tushiring, so'ng arxivlang.`
        : "";
      throw new ApiError(
        400,
        `Bu o'qituvchida tarix bor (${traces.join(", ")}). Uni butunlay o'chirib bo'lmaydi - ` +
          `o'chirilsa o'tgan oylarning chiqimi yo'qolib, foyda hisoboti yolg'on bo'lardi. ` +
          `Buning o'rniga ARXIVLANG: tarix saqlanadi, o'qituvchi ro'yxatlardan yo'qoladi.${hint}`,
      );
    }
  }

  // O'quvchini o'chirish sharti: hech qanday guruhga biriktirilmagan bo'lsin (faol
  // a'zolik bo'lmasin). Guruhda bo'lsa - avval guruhdan chiqarish kerak.
  if (isStudent) {
    const inGroup = await prisma.groupMembership.findFirst({
      where: { studentId: user.id, leftAt: null, isDeleted: false },
      select: { id: true },
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

    // Barcha o'chirishlarni BITTA tranzaksiyada.
    //
    // Mongo variantida atomiklik shartli edi (replica set bo'lmasa -
    // sessiyasiz). Postgres'da u kafolatlangan: yo hammasi o'chadi, yo
    // hech nima. Yarim o'chirilgan o'quvchi (to'lovi yo'q, a'zoligi bor)
    // holat endi mumkin emas.
    const groupIds = await runFinanceTxn(async (tx) => {
      const gids = isStudent
        ? await hardDeleteStudentData(user.id, { tx })
        : await hardDeleteTeacherData(user.id, { tx });
      await purgeUserResidualData(user.id, { tx });
      await tx.user.delete({ where: { id: user.id } });
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

    return { id: user.id, _id: user.id };
  }

  // Kutilmagan rollar (himoya): bog'liqlik bo'lsa o'chirib bo'lmaydi.
  const blockers = await findUserBlockingRelations(user.id);
  if (blockers.length > 0) {
    const detail = blockers.map((b) => `${b.label} (${b.count})`).join(", ");
    throw new ApiError(
      409,
      `Bu foydalanuvchini butunlay o'chirib bo'lmaydi: u quyidagi ma'lumotlarga bog'liq — ${detail}. Avval bu yozuvlarni o'chiring yoki foydalanuvchini arxivlang.`,
      { code: "USER_HAS_RELATIONS", details: blockers },
    );
  }

  // Bog'liqlik yo'q - qoldiq sessiya/audit ma'lumotini tozalab, yozuvni o'chiramiz.
  await runFinanceTxn(async (tx) => {
    await purgeUserResidualData(user.id, { tx });
    await tx.user.delete({ where: { id: user.id } });
  });
  return { id: user.id, _id: user.id };
};

export const studentHistory = async (
  studentId,
  { page = 1, limit = 20 } = {},
) => {
  const user = await getById(studentId);
  if (user.role !== ROLES.STUDENT) {
    throw new ApiError(400, "Bu foydalanuvchi o'quvchi emas");
  }
  const where = { studentId: user.id };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.groupMembership.findMany({
      where,
      orderBy: { joinedAt: "desc" },
      skip,
      take: limit,
      // Mongoose `.populate("group", {...})` bilan bir xil natija shakli:
      // relation nomi ikkalasida ham `group` / `transferredTo`.
      // `schedule` endi alohida jadval (GroupScheduleItem) - `true` uni
      // to'liq yuklaydi, ya'ni client uchun eski embedded massiv qoladi.
      include: {
        group: {
          select: {
            id: true,
            name: true,
            schedule: { select: { day: true, startTime: true, endTime: true } },
          },
        },
        transferredTo: { select: { id: true, name: true } },
      },
    }),
    prisma.groupMembership.count({ where }),
  ]);

  return { items: withLegacyIds(items), total, page, limit };
};

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

  // TELEFON TAKRORLANISHI RUXSAT ETILADI (qarang: schema.prisma, User.phone).
  const usernameTaken = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
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

  const branch = await prisma.branch.findFirst({
    where: { id: String(homeBranchId), isDeleted: false },
    select: { id: true, name: true },
  });
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
    branchAssignments.push({ branchId: String(a.branchId), role: a.role || null });
  }

  const passwordHash = await hashPassword(body.password);

  const user = await prisma.user.create({
    data: {
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      username,
      phone: phone || null,
      passwordHash,
      role: body.role,
      homeBranchId: branch.id,
      // Embedded massiv o'rniga alohida jadval - Prisma uni ichma-ich
      // `create` bilan bitta amalda yozadi (qo'shimcha so'rov shart emas).
      branchAssignments: branchAssignments.length
        ? { create: branchAssignments }
        : undefined,
      isActive: true,
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      // Kalendar kuni (UTC-midnight) - "bugun" mahalliy (Asia/Tashkent) kun bo'yicha.
      hiredAt: body.hiredAt ? parseLocalDay(body.hiredAt) : localTodayMidnight(),
    },
    include: SCOPE_INCLUDE,
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
          teacher: user.id,
          branchId: body.compensation.branchId ?? branch.id,
          effectiveFrom: body.compensation.effectiveFrom || user.hiredAt,
        },
        currentUser,
      );
    } catch (err) {
      logger.warn(
        { err, userId: user.id },
        "Ishga olishda maosh stavkasi belgilanmadi - profil orqali kiritish kerak",
      );
    }
  }

  // ─── BOSHLANG'ICH QOLDIQ ───
  // Maosh stavkasi bilan bir xil naqsh: xato XODIM YARATILISHINI bekor
  // qilmaydi, lekin javobda ochiq ko'rinadi - pul jimgina yo'qolmasin.
  const profile = await buildUserProfile(user);
  if (body.openingBalance) {
    try {
      const openingBalanceService = await import(
        "../../openingBalance/services/openingBalance.service.js"
      );
      await openingBalanceService.create(
        {
          user: user.id,
          // O'qituvchi bo'lmagan HAR QANDAY rol (direktor, administrator,
          // buxgalter, custom rol...) xodim hisobida yuritiladi.
          role: body.role === ROLES.TEACHER ? ROLES.TEACHER : "staff",
          amount: body.openingBalance,
          branchId: branch.id,
          group: null,
          note: body.openingBalanceNote || "",
        },
        { currentUser },
      );
    } catch (err) {
      logger.error(
        { err, userId: user.id, amount: body.openingBalance },
        "Boshlang'ich qoldiq yozilmadi - qo'lda kiritish kerak",
      );
      profile.openingBalanceError =
        "Boshlang'ich qoldiq yozilmadi. Uni profil sahifasidan qayta kiriting.";
    }
  }

  return profile;
};

/**
 * Xodimning filial biriktiruvini o'zgartirish.
 * Owner "bu odam qaysi filialda" ni tahrirlashi uchun.
 */
export const setBranches = async (id, body, currentUser) => {
  const user = await getById(id);

  // Nishon joriy ko'lamda bo'lishi shart (boshqa filial xodimiga tegib bo'lmaydi).
  assertTargetInScope(
    currentUser?.allowedBranchIds,
    currentUser?.canSeeAllBranches,
    user,
  );

  const data = {};

  if (body.homeBranchId !== undefined) {
    if (!body.homeBranchId) throw new ApiError(400, "Asosiy filial bo'sh bo'lmasligi kerak");
    assertCanAssignBranch(
      currentUser?.allowedBranchIds,
      currentUser?.canSeeAllBranches,
      body.homeBranchId,
    );
    const branch = await prisma.branch.findFirst({
      where: { id: String(body.homeBranchId), isDeleted: false },
      select: { id: true },
    });
    if (!branch) throw new ApiError(400, "Filial topilmadi");
    data.homeBranchId = branch.id;
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
      next.push({ branchId: String(a.branchId), role: a.role || null });
    }
    // Mongo'da bu butun massivni almashtirish edi (`user.branchAssignments = next`).
    // Alohida jadvalda ekvivalent - eskilarini o'chirib, yangisini yozish.
    // Ikkalasi bitta `update` ichida, ya'ni bitta tranzaksiyada bajariladi:
    // yarim holat (eskisi o'chgan, yangisi yozilmagan) bo'lishi mumkin emas.
    data.branchAssignments = { deleteMany: {}, ...(next.length ? { create: next } : {}) };
  }

  const saved = await prisma.user.update({
    where: { id: user.id },
    data,
    include: SCOPE_INCLUDE,
  });
  return buildUserProfile(saved);
};

// Foydalanuvchiga rol biriktirish (built-in yoki custom).
// User.role'da enum YO'Q (dinamik rol), shuning uchun tekshiruv SHU YERDA:
//  - rol haqiqatan mavjudmi va muzlatilmaganmi;
//  - o'z rolini o'zgartirmayaptimi (o'zini qulflab qo'ymasin);
//  - tizimdagi oxirgi owner rolidan ayrilmayaptimi.
export const setRole = async (id, role, currentUser) => {
  assertNotSelfRoleChange(currentUser, id);

  const user = await getById(id);

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

  const saved = await prisma.user.update({
    where: { id: user.id },
    data: { role },
    include: SCOPE_INCLUDE,
  });

  // Rol o'zgardi - eski sessiyalar yangi ruxsat bilan ishlashi uchun
  // barcha refresh tokenlarni bekor qilamiz (qayta login talab qilinadi).
  await prisma.refreshToken.updateMany({
    where: { userId: saved.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return buildUserProfile(saved);
};

// --- ISHGA OLISH TASDIG'I (owner tasdig'i talab qilinganda) ---
//
// TASDIQLANMAGUNCHA User yozuvi YARATILMAYDI. Bu ataylab:
//   - username unique indeks so'rov paytidayoq band bo'lib qolardi
//     (owner ko'rmasidan turib "bunday login mavjud" xatosi chiqardi);
//   - "kutilmoqda" holatidagi odam ro'yxatlarga, davomatga va Telegram
//     botiga tushib ketardi - ya'ni ishga olinmagan odam tizimda ishlardi.
// So'rov ma'lumoti faqat Approval.payload ichida yashaydi.

/**
 * Ishga olishni TASDIQQA yuboradi (User yaratmaydi).
 *
 * Yengil tekshiruv: login bandligi (so'rovchiga darhol javob berish uchun).
 * Rol/filial huquqlari ATAYLAB bajarish paytida QAYTA tekshiriladi.
 */
export const requestHire = async (body, currentUser) => {
  const approvalService = await import(
    "../../expenseApprovals/services/expenseApproval.service.js"
  );
  // APPROVAL_KINDS - sof konstantalar to'plami (bazaga bog'liq emas).
  // Approval moduli ko'chirilgach import manzili o'zgaradi, qiymatlar emas.
  const { APPROVAL_KINDS } = await import("../../../constants/approvals.js");

  const username = String(body.username).toLowerCase().trim();
  const phone = body.phone ? normalizePhone(body.phone) : null;
  if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");

  // Telefon bandligi TEKSHIRILMAYDI - takrorlanish ruxsat etilgan
  // (qarang: schema.prisma, User.phone).
  const taken = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (taken) {
    throw new ApiError(409, "Bunday login (username) allaqachon mavjud");
  }
  if (!body.homeBranchId) throw new ApiError(400, "Filial tanlanishi shart");

  const branch = await prisma.branch.findFirst({
    where: { id: String(body.homeBranchId), isDeleted: false },
    select: { id: true, name: true },
  });
  if (!branch) throw new ApiError(400, "Filial topilmadi");

  return approvalService.createRequest({
    branchId: branch.id,
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

  // Approval moduli hali ko'chirilmagan - so'rovchi maydoni Mongoose
  // shaklida (`requestedBy`) kelishi mumkin, ko'chirilgach `requestedById`
  // bo'ladi. Ikkalasini ham qabul qilamiz.
  const requesterId = approval?.requestedById || approval?.requestedBy;
  // Prisma `findUnique({ where: { id: undefined } })` ni XATO deb hisoblaydi,
  // shuning uchun bo'sh ID oldindan ushlanadi (aks holda 500 chiqardi).
  if (!requesterId) throw new ApiError(400, "So'rovchi topilmadi - so'rov bajarilmadi");

  const requester = await prisma.user.findUnique({
    where: { id: String(requesterId) },
    include: SCOPE_INCLUDE,
  });
  if (!requester) throw new ApiError(400, "So'rovchi topilmadi - so'rov bajarilmadi");

  const permissions = await collectPermissions(requester.role);
  const allowedBranchIds = await resolveAllowedBranchIds(requester, permissions);

  return createStaff(approval.payload || {}, {
    id: requester.id,
    _id: requester.id,
    permissions,
    allowedBranchIds,
    // requireAuth bilan bir xil hisoblanadi - aks holda ko'lam tekshiruvi
    // bajarish paytida so'rov paytidagidan farq qilardi.
    canSeeAllBranches: hasPermission(permissions, PERMISSIONS.BRANCHES_VIEW_ALL),
  });
};
