// Lug'at (holat/kategoriya/tur) endi bazadan mustaqil konstantalarda -
// Mongoose model fayli o'chirilganda ular qolishi kerak.
import {
  APPROVAL_STATUSES,
  APPROVAL_CATEGORIES,
  APPROVAL_KINDS,
  EXPENSE_KINDS,
  resolveCategory,
} from "../../../constants/approvals.js";
// Modelning O'ZI hali ko'chirilmagan (yozish yo'llari Mongoose'da).
import Approval from "../../../models/approval.model.js";
import prisma from "../../../config/prisma.js";
import { withLegacyId, withPopulatedShape } from "../../../utils/serialize.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { hasPermission } from "../../../helpers/permission.helper.js";
import {
  branchFilter,
  getActiveBranchId,
} from "../../../helpers/branchContext.helper.js";
import {
  DELEGATION_MODES,
  LIMIT_DIRECTIONS,
  DELEGATABLE_KINDS,
  FALLBACK_DELEGATION_MODE,
  resolveRule,
} from "../../../constants/delegation.js";
import { SORT_OPTIONS } from "../validators/list.validator.js";

// Kategoriya -> uni tasdiqlash uchun kerak bo'lgan ruxsat.
// AJRATILGAN bo'lishi PRINSIPIAL: chiqim tasdiqlash huquqi berilgan direktor
// avtomatik ravishda maosh stavkasi belgilash huquqini olmasligi kerak.
const DECIDE_PERMISSION = {
  [APPROVAL_CATEGORIES.FINANCIAL]: PERMISSIONS.FINANCE_APPROVE,
  [APPROVAL_CATEGORIES.CONFIGURATION]: PERMISSIONS.APPROVALS_DECIDE_CONFIG,
};

// Kategoriya -> uni RO'YXATDA ko'rish uchun kerak bo'lgan ruxsat.
const READ_PERMISSION = {
  [APPROVAL_CATEGORIES.FINANCIAL]: PERMISSIONS.FINANCE_READ,
  [APPROVAL_CATEGORIES.CONFIGURATION]: PERMISSIONS.APPROVALS_DECIDE_CONFIG,
};

// ============================================================
// 1) LIMIT / TASDIQ TEKSHIRUVI - amal servislaridan chaqiriladi
// ============================================================

/**
 * Chiqim limitdan oshganmi va tasdiq kerakmi.
 *
 * Qaytaradi: { needsApproval: boolean, threshold: number|null }
 *
 * OZOD bo'lganlar:
 *   - owner (["*"])
 *   - finance.approve ruxsati borlar (ular baribir o'zi tasdiqlay olardi)
 *
 * Limit qo'yilmagan bo'lsa (null) - cheksiz. Bu ATAYLAB "fail open":
 * limit ixtiyoriy imkoniyat, aks holda yangilanishdan keyin barcha mavjud
 * markazlarda to'lovlar to'satdan bloklanardi.
 */
export const checkExpenseLimit = async ({ branchId, amount, permissions }) => {
  // Tasdiqlash huquqi borlar limitdan ozod.
  if (hasPermission(permissions, PERMISSIONS.FINANCE_APPROVE)) {
    return { needsApproval: false, threshold: null };
  }
  if (!branchId) return { needsApproval: false, threshold: null };

  const branch = await prisma.branch.findUnique({
    where: { id: String(branchId) },
    select: { expenseApprovalThreshold: true },
  });
  const threshold = branch?.expenseApprovalThreshold;

  // null / 0 / manfiy => limit yo'q
  if (threshold === null || threshold === undefined || threshold <= 0) {
    return { needsApproval: false, threshold: null };
  }

  // Qat'iy KATTA: limit 10 mln bo'lsa, 10 mln o'tadi, 10 mln + 1 so'm o'tmaydi.
  return { needsApproval: Number(amount) > threshold, threshold };
};

/**
 * Qoida chegarasi ichidami.
 *
 * FAIL-CLOSED: o'lchov (metrics) aniqlanmagan bo'lsa yoki tegishli chegara
 * kiritilmagan bo'lsa - `false`, ya'ni tasdiqqa tushadi. "Bilmasam
 * o'tkazaman" bu yerda xavfli, chunki sozlama TAKRORLANUVCHI ta'sirga ega.
 *
 * Amalda bu shuni anglatadi: chegirmani TAHRIRLASHDA body'da `value`
 * bo'lmasa (masalan faqat izoh o'zgartirilsa) o'zgarish baribir tasdiqqa
 * tushadi. Bu ATAYLAB - `type` bilan `value` ni bir-birisiz baholab
 * bo'lmaydi va noto'g'ri "o'tkazib yuborish" xatosi qimmatroq.
 * `auto` rejimida esa o'lchov umuman kerak emas, ya'ni bu cheklov
 * faqat `threshold` rejimiga tegishli.
 */
const withinLimit = (spec, rule, metrics) => {
  const amount = metrics?.amount;
  const percent = metrics?.percent;

  const hasAmount = amount !== null && amount !== undefined && Number.isFinite(Number(amount));
  const hasPercent = percent !== null && percent !== undefined && Number.isFinite(Number(percent));

  // O'lchovsiz baholab bo'lmaydi.
  if (!hasAmount && !hasPercent) return false;

  if (hasAmount) {
    if (spec.direction === LIMIT_DIRECTIONS.FLOOR) {
      // Guruh narxi: PASTGA tushirish xavfli.
      if (rule.minAmount === null) return false;
      if (Number(amount) < rule.minAmount) return false;
    } else {
      // Chegirma / maosh: YUQORIGA ko'tarish xavfli.
      if (rule.maxAmount === null) return false;
      if (Number(amount) > rule.maxAmount) return false;
    }
  }

  if (hasPercent) {
    if (rule.maxPercent === null) return false;
    if (Number(percent) > rule.maxPercent) return false;
  }

  return true;
};

/**
 * KONFIGURATSIYA o'zgarishi tasdiq talab qiladimi.
 *
 * Chiqimdan farqi: bir martalik summa yo'q. Maosh stavkasi va chegirma
 * TAKRORLANUVCHI - ularni `expenseApprovalThreshold` bilan solishtirish
 * ma'nosiz (oyiga 500k so'm chegirma 2 yilda 12 mln bo'ladi, lekin bironta
 * ham "amaliyot" limitdan oshmaydi).
 *
 * ILGARI tekshiruv IKKILIK edi: approvals.decide_config bor -> darhol;
 * yo'q -> tasdiqqa. Endi o'rtada FILIAL DELEGATSIYA MATRITSASI turadi
 * (Branch.delegation), ya'ni owner har bir filialga alohida ishonch
 * darajasini bera oladi. Batafsil: constants/delegation.js.
 *
 * @param {object}  args
 * @param {string[]} args.permissions
 * @param {string}  [args.kind]     - APPROVAL_KINDS qiymati
 * @param {string}  [args.branchId] - berilmasa joriy kontekstdan olinadi
 * @param {{amount?: number, percent?: number}} [args.metrics]
 * @returns {Promise<{needsApproval: boolean, mode: string}>}
 * @throws {ApiError} 403 - tur bu filialda umuman taqiqlangan bo'lsa
 */
export const checkConfigApproval = async ({
  permissions,
  kind = null,
  branchId = null,
  metrics = null,
} = {}) => {
  // Tasdiqlash huquqi borlar (owner va unga tenglashtirilganlar) matritsadan
  // TASHQARIDA. Sabab avvalgidek: ular so'rov yaratsa ham o'zi tasdiqlardi,
  // ya'ni oraliq qadam faqat ortiqcha ish bo'lardi.
  if (hasPermission(permissions, PERMISSIONS.APPROVALS_DECIDE_CONFIG)) {
    return { needsApproval: false, mode: DELEGATION_MODES.AUTO };
  }

  const spec = kind ? DELEGATABLE_KINDS[kind] : null;
  const activeBranchId = branchId || getActiveBranchId();

  // FAIL-CLOSED IKKI HOLAT:
  //   1. Tur delegatsiya qilinmaydi (matritsa unga taalluqli emas).
  //   2. Aniq filial tanlanmagan ("barcha filiallar" rejimi) - qaysi
  //      filialning qoidasini o'qishni bilmaymiz.
  // Ikkalasida ham tasdiqqa yuboriladi.
  if (!spec || !activeBranchId) {
    return { needsApproval: true, mode: FALLBACK_DELEGATION_MODE };
  }

  const branch = await prisma.branch.findUnique({
    where: { id: String(activeBranchId) },
    select: { delegation: true },
  });
  const rule = resolveRule(branch?.delegation, kind);

  switch (rule.mode) {
    case DELEGATION_MODES.FORBIDDEN:
      // So'rov ham YARATILMAYDI. Tasdiqqa yuborish "balki o'tar" degan
      // umid qoldirardi va owner navbatini keraksiz so'rov bilan to'ldirardi.
      throw new ApiError(
        403,
        `Bu filialda "${spec.label}" amali sizga taqiqlangan`,
      );

    case DELEGATION_MODES.AUTO:
      return { needsApproval: false, mode: rule.mode };

    case DELEGATION_MODES.THRESHOLD:
      return {
        needsApproval: !withinLimit(spec, rule, metrics),
        mode: rule.mode,
      };

    default:
      return { needsApproval: true, mode: DELEGATION_MODES.APPROVAL };
  }
};

/**
 * Tasdiq so'rovini yaratadi. Hech qanday holat o'zgarmaydi - so'rov faqat
 * "buyruq jurnali", haqiqiy ish tasdiqlanganda EXECUTORS ichida bajariladi.
 *
 * subjectKey berilgan bo'lsa, o'sha subyekt uchun ikkinchi kutilayotgan
 * so'rov YARATILMAYDI (partial unique indeks -> 409).
 */
export const createRequest = async ({
  branchId,
  kind,
  amount = null,
  payload,
  threshold,
  subjectKey,
  subjectName,
  contextName,
  requestNote,
  currentUser,
}) => {
  try {
    return await Approval.create({
      branchId,
      kind,
      category: resolveCategory(kind),
      amount,
      payload: payload || {},
      thresholdAtRequest: threshold ?? null,
      subjectKey: subjectKey || undefined,
      subjectName: subjectName || "",
      contextName: contextName || "",
      requestedBy: currentUser?._id || null,
      requestNote: requestNote || "",
      status: APPROVAL_STATUSES.PENDING,
    });
  } catch (err) {
    // Partial unique indeks (subjectKey + pending) - subyekt qulfi.
    if (err?.code === 11000) {
      throw new ApiError(
        409,
        "Bu obyekt uchun tasdiq kutilayotgan so'rov allaqachon mavjud. Avval o'shani ko'rib chiqing.",
      );
    }
    throw err;
  }
};

// ============================================================
// 2) O'QISH
// ============================================================

// PAYLOAD ICHIDAGI MAXFIY MAYDONLAR - o'qish javoblarida olib tashlanadi.
//
// NEGA: ishga olish so'rovi payload'ida yangi xodimning paroli turadi
// (loyihada parollar ochiq matnda saqlanadi - qarang password.helper.js).
// User modelida u `select: false` va alohida endpoint bilan himoyalangan,
// lekin Approval.payload oddiy Mixed maydon - tasdiqlar ro'yxatini ko'ra
// oladigan HAR KIM uni o'qib olardi. Bu mavjud himoyadan ORQAGA qadam
// bo'lardi, shuning uchun o'qishda kesib tashlanadi.
//
// Bajaruvchi (EXECUTORS) baza hujjatini to'g'ridan-to'g'ri oladi, shuning
// uchun bu kesish ishlashga ta'sir qilmaydi.
const SENSITIVE_PAYLOAD_FIELDS = ["password"];

const stripSensitive = (doc) => {
  if (!doc) return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if (plain.payload && typeof plain.payload === "object") {
    plain.payload = { ...plain.payload };
    for (const field of SENSITIVE_PAYLOAD_FIELDS) delete plain.payload[field];
  }
  return plain;
};

/**
 * Foydalanuvchi ko'ra oladigan kategoriyalar sharti.
 *
 * O'Z so'rovini har kim ko'radi (kategoriyadan qat'i nazar) - aks holda
 * direktor o'zi yuborgan so'rovning holatini kuza ololmasdi.
 */
const categoryCondition = (permissions, userId) => {
  const cats = Object.entries(READ_PERMISSION)
    .filter(([, key]) => hasPermission(permissions, key))
    .map(([category]) => category);

  if (cats.length === Object.keys(READ_PERMISSION).length) return {};
  if (cats.length === 0) return { requestedById: userId };
  return { OR: [{ category: { in: cats } }, { requestedById: userId }] };
};

// Regexp uchun foydalanuvchi matnini zararsizlantirish.
// Bu bo'lmasa "(" kabi belgi butun so'rovni yiqitadi, ".*" esa
// indekssiz to'liq skanerlashga aylanadi.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Ro'yxat filtrini quradi. `count` va `list` bitta manbadan qurilishi uchun
 * alohida chiqarildi - aks holda ikkalasi vaqt o'tib bir-biridan uzoqlashardi.
 */
const buildListFilter = ({
  status,
  kind,
  category,
  search,
  dateFrom,
  dateTo,
  requestedBy,
  permissions,
  currentUser,
}) => {
  const filter = {
    ...branchFilter(),
    ...categoryCondition(permissions, currentUser?.id || currentUser?._id),
  };
  if (status) filter.status = status;
  if (kind) filter.kind = kind;
  if (category) filter.category = category;
  if (requestedBy) filter.requestedById = requestedBy;

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.gte = dateFrom;
    // `dateTo` KUN OXIRIGACHA: foydalanuvchi "31-dekabrgacha" deganda
    // o'sha kunning o'zi ham kirishini kutadi, 00:00 ni emas.
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.lte = end;
    }
  }

  if (search) {
    // Mongo RegExp o'rniga Prisma `contains` + `insensitive`.
    // Qo'shimcha yutuq: foydalanuvchi matnini regexp'dan qochirish
    // (escapeRegex) endi umuman kerak emas - SQL parametri sifatida
    // uzatiladi, ya'ni "(" kabi belgi so'rovni yiqita olmaydi.
    const q = { contains: search, mode: "insensitive" };
    const searchOr = [
      { subjectName: q },
      { contextName: q },
      { requestNote: q },
    ];
    // DIQQAT: categoryCondition ham OR ishlatishi mumkin. Ikkinchi OR uni
    // jimgina yozib yuborardi va foydalanuvchi ko'rmasligi kerak bo'lgan
    // kategoriyani ham qidiruv orqali ochib berardi. Shuning uchun AND.
    if (filter.OR) {
      filter.AND = [{ OR: filter.OR }, { OR: searchOr }];
      delete filter.OR;
    } else {
      filter.OR = searchOr;
    }
  }

  return filter;
};

// SORT_OPTIONS validatorda Mongo shaklida ({createdAt: -1}). Prisma
// `"desc"/"asc"` kutadi - shu yerda o'giramiz (validator o'zgarmaydi,
// u klient shartnomasining bir qismi).
// NULL TARTIBI — MONGO BILAN POSTGRES ZID.
//
// MongoDB BSON tartibida `null` sonlardan PAST turadi, ya'ni kamayuvchi
// saralashda null'lar OXIRIDA qolardi. PostgreSQL'da esa DESC ning
// standarti NULLS FIRST — aksincha.
//
// Bu MUHIM: konfiguratsiya so'rovlarida `amount = null`. E'tibor
// berilmasa "summa bo'yicha, kattadan" saralashda birinchi sahifa
// TO'LIQ null-summali sozlama so'rovlaridan iborat bo'lib, eng katta
// chiqim ikkinchi sahifaga tushib ketardi — ya'ni saralash aynan
// mo'ljallangan maqsadiga TESKARI ishlardi.
// `nulls` FAQAT nullable ustunda ishlatiladi — Prisma uni majburiy
// maydonga (createdAt) berilsa validatsiya xatosi bilan rad etadi.
const NULLABLE_SORT_FIELDS = new Set(["amount"]);

const toOrderBy = (mongoSort) =>
  Object.entries(mongoSort).map(([field, dir]) => {
    const sort = dir === -1 ? "desc" : "asc";
    return {
      [field]: NULLABLE_SORT_FIELDS.has(field) ? { sort, nulls: "last" } : sort,
    };
  });

// Prisma relation nomi → klient kutadigan eski maydon nomi.
const SHAPE_MAP = { branch: "branchId" };

const LIST_INCLUDE = {
  requestedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
  decidedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
  branch: { select: { id: true, name: true, code: true } },
};

export const list = async ({
  status,
  kind,
  category,
  search,
  sort = "-createdAt",
  dateFrom,
  dateTo,
  requestedBy,
  page = 1,
  limit = 20,
  permissions,
  currentUser,
}) => {
  const filter = buildListFilter({
    status,
    kind,
    category,
    search,
    dateFrom,
    dateTo,
    requestedBy,
    permissions,
    currentUser,
  });

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.approval.findMany({
      where: filter,
      orderBy: toOrderBy(SORT_OPTIONS[sort] || SORT_OPTIONS["-createdAt"]),
      skip,
      take: limit,
      include: LIST_INCLUDE,
    }),
    prisma.approval.count({ where: filter }),
  ]);
  // Klient `branchId` ni OBYEKT sifatida kutadi (eski populate shakli).
  return {
    items: items.map((i) => stripSensitive(withPopulatedShape(i, SHAPE_MAP))),
    total,
    page,
    limit,
  };
};

/**
 * KPI kartalari uchun yig'ma. Bitta aggregation - har bir karta uchun
 * alohida so'rov yuborilsa 3 marta bir xil filtr bo'yicha skanerlanardi.
 *
 * `pendingAmount` FAQAT `financial` so'rovlarni qo'shadi: konfiguratsiya
 * so'rovlarida `amount` null va ular "kutilayotgan chiqim" summasiga
 * qo'shilsa hisobot yolg'on ko'rsatardi (model izohidagi leakage darsi).
 */
export const stats = async ({ permissions, currentUser }) => {
  const base = buildListFilter({ permissions, currentUser });

  // Mongo'da bu bitta `$group` + shartli `$sum` edi. Prisma'da shartli
  // yig'indi yo'q, shuning uchun uch mustaqil so'rov - ular PARALLEL
  // ketadi va har biri indeksdan foydalanadi, ya'ni bitta to'liq
  // skanerdan qimmat emas.
  const [pending, failed, amountAgg] = await Promise.all([
    prisma.approval.count({
      where: { ...base, status: APPROVAL_STATUSES.PENDING },
    }),
    prisma.approval.count({
      where: { ...base, status: APPROVAL_STATUSES.FAILED },
    }),
    // `pendingAmount` FAQAT `financial` - sozlama so'rovlarida `amount`
    // null va ular "kutilayotgan chiqim"ga qo'shilsa hisobot yolg'on
    // ko'rsatardi.
    prisma.approval.aggregate({
      where: {
        ...base,
        status: APPROVAL_STATUSES.PENDING,
        category: APPROVAL_CATEGORIES.FINANCIAL,
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    pending,
    pendingAmount: amountAgg._sum.amount || 0,
    failed,
  };
};

export const getById = async (id, { permissions, currentUser } = {}) => {
  const doc = await prisma.approval.findUnique({
    where: { id },
    include: LIST_INCLUDE,
  });
  if (!doc) throw new ApiError(404, "So'rov topilmadi");

  // Kategoriya ko'lami: moliya so'rovini faqat moliyani ko'ra oladigan,
  // sozlama so'rovini faqat sozlamani tasdiqlay oladigan (yoki so'rovchining
  // o'zi) ko'radi.
  const canRead = hasPermission(permissions, READ_PERMISSION[doc.category]);
  const isOwnRequest =
    String(doc.requestedBy?.id || doc.requestedById) ===
    String(currentUser?.id || currentUser?._id);
  if (!canRead && !isOwnRequest) throw new ApiError(403, "Ruxsat etilmagan");

  return stripSensitive(withPopulatedShape(doc, SHAPE_MAP));
};

/** Kutilayotgan so'rovlar soni - sidebar belgisi uchun. */
export const pendingCount = async ({ permissions, currentUser } = {}) =>
  prisma.approval.count({
    where: {
      ...branchFilter(),
      ...categoryCondition(permissions, currentUser?.id || currentUser?._id),
      status: APPROVAL_STATUSES.PENDING,
    },
  });

// ============================================================
// 3) QAROR: rad etish / bekor qilish
// ============================================================

/**
 * Shu KATEGORIYA uchun qaror qabul qilish huquqi bormi.
 *
 * Route qatlamidagi requireAnyPermission faqat "eshikni" ochadi (ikki
 * kategoriyadan biri). Haqiqiy tekshiruv shu yerda - aks holda faqat
 * finance.approve bor direktor sozlama so'rovini tasdiqlay olardi.
 */
const assertCanDecide = (approval, permissions) => {
  const needed = DECIDE_PERMISSION[approval.category];
  if (!needed || !hasPermission(permissions, needed)) {
    throw new ApiError(403, "Bu turdagi so'rovni tasdiqlash huquqingiz yo'q");
  }
};

export const reject = async (id, { note } = {}, currentUser, permissions) => {
  const existing = await Approval.findById(id).lean();
  if (!existing) throw new ApiError(404, "So'rov topilmadi");
  assertCanDecide(existing, permissions);

  // Compare-and-set: faqat PENDING'dan REJECTED'ga o'tadi. Ikki owner bir
  // vaqtda bosgan bo'lsa, ikkinchisi null oladi.
  const doc = await Approval.findOneAndUpdate(
    { _id: id, status: APPROVAL_STATUSES.PENDING },
    {
      $set: {
        status: APPROVAL_STATUSES.REJECTED,
        decidedBy: currentUser?._id || null,
        decidedAt: new Date(),
        decisionNote: note || "",
      },
    },
    { new: true },
  );
  if (!doc) throw new ApiError(409, "So'rov allaqachon ko'rib chiqilgan");
  return doc;
};

/** So'rovchi o'z so'rovini bekor qiladi. */
export const cancel = async (id, currentUser) => {
  const existing = await Approval.findById(id).lean();
  if (!existing) throw new ApiError(404, "So'rov topilmadi");
  if (String(existing.requestedBy) !== String(currentUser?._id)) {
    throw new ApiError(403, "Faqat o'z so'rovingizni bekor qila olasiz");
  }
  const doc = await Approval.findOneAndUpdate(
    { _id: id, status: APPROVAL_STATUSES.PENDING },
    {
      $set: {
        status: APPROVAL_STATUSES.CANCELED,
        decidedBy: currentUser?._id || null,
        decidedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!doc) throw new ApiError(409, "So'rov allaqachon ko'rib chiqilgan");
  return doc;
};

// ============================================================
// 4) TASDIQLASH VA BAJARISH (eng nozik qism)
// ============================================================

// Bajaruvchilar ro'yxati. Sikldan qochish uchun dinamik import ishlatiladi:
// amal servislari bu servisni import qiladi (tasdiq tekshiruvi uchun),
// bu servis esa ularni chaqiradi (bajarish uchun).
const EXECUTORS = {
  [APPROVAL_KINDS.SALARY_PAYMENT]: async (approval) => {
    const svc = await import("../../teacherSalary/services/salaryTransaction.service.js");
    return svc.executeApproved(approval);
  },
  [APPROVAL_KINDS.DEPOSIT_WITHDRAW]: async (approval) => {
    const svc = await import("../../deposits/services/deposit.service.js");
    return svc.executeApprovedWithdraw(approval);
  },
  [APPROVAL_KINDS.SALARY_TERMS]: async (approval) => {
    const svc = await import("../../groups/services/teacherGroupPeriod.service.js");
    return svc.executeApprovedSalaryTerms(approval);
  },
  [APPROVAL_KINDS.DISCOUNT_SET]: async (approval) => {
    const svc = await import("../../finance/services/discount.service.js");
    return svc.executeApprovedDiscount(approval);
  },
  [APPROVAL_KINDS.GROUP_FEE_SET]: async (approval) => {
    const svc = await import("../../finance/services/groupFee.service.js");
    return svc.executeApprovedGroupFee(approval);
  },
  [APPROVAL_KINDS.STAFF_HIRE]: async (approval) => {
    const svc = await import("../../users/services/users.service.js");
    return svc.executeApprovedHire(approval);
  },
  [APPROVAL_KINDS.TEACHER_COMPENSATION_SET]: async (approval) => {
    const svc = await import("../../teacherSalary/services/teacherCompensation.service.js");
    return svc.executeApprovedCompensation(approval);
  },
  [APPROVAL_KINDS.MEMBERSHIP_BACKDATE]: async (approval) => {
    const svc = await import("../../groups/services/groups.service.js");
    return svc.executeApprovedBackdate(approval);
  },
  [APPROVAL_KINDS.EXPENSE_CREATE]: async (approval) => {
    const svc = await import("../../expenses/services/expense.service.js");
    return svc.executeApprovedExpense(approval);
  },
  [APPROVAL_KINDS.STAFF_SALARY_PAYMENT]: async (approval) => {
    const svc = await import(
      "../../staffPayroll/services/staffSalaryTransaction.service.js"
    );
    return svc.executeApproved(approval);
  },
};

/**
 * Tasdiqlaydi va DARHOL bajaradi.
 *
 * AYNAN BIR MARTA kafolati uch qatlamda:
 *  1. Compare-and-set: PENDING -> APPROVED (ikki owner bir vaqtda bossa,
 *     faqat bittasi o'tadi).
 *  2. Partial unique indeks `expenseApprovalId` - tranzaksiya darajasida.
 *     Jarayon o'rtada o'lib qayta urinilsa ham ikkinchi yozuv 11000 beradi.
 *  3. Bajarishdan oldin mavjud tranzaksiya qidiriladi: agar tranzaksiya
 *     yozilgan-u, holat yangilanmagan bo'lsa (jarayon o'rtada o'lgan),
 *     qayta to'lamasdan shunchaki holatni tuzatamiz.
 *
 * O'Z SO'ROVINI O'ZI TASDIQLASH TAQIQLANADI.
 */
export const approve = async (id, { note } = {}, currentUser, permissions) => {
  const existing = await Approval.findById(id).lean();
  if (!existing) throw new ApiError(404, "So'rov topilmadi");
  assertCanDecide(existing, permissions);

  // O'ZINI-O'ZI TASDIQLASH TAQIQI: tasdiqning butun ma'nosi shu.
  if (String(existing.requestedBy) === String(currentUser?._id)) {
    throw new ApiError(403, "O'z so'rovingizni o'zingiz tasdiqlay olmaysiz");
  }

  // 1-qatlam: atomik holat o'zgarishi.
  const approval = await Approval.findOneAndUpdate(
    { _id: id, status: APPROVAL_STATUSES.PENDING },
    {
      $set: {
        status: APPROVAL_STATUSES.APPROVED,
        decidedBy: currentUser?._id || null,
        decidedAt: new Date(),
        decisionNote: note || "",
      },
    },
    { new: true },
  );
  if (!approval) throw new ApiError(409, "So'rov allaqachon ko'rib chiqilgan");

  const executor = EXECUTORS[approval.kind];
  if (!executor) {
    await markFailed(approval._id, `Noma'lum so'rov turi: ${approval.kind}`);
    throw new ApiError(500, "Bu so'rov turini bajarib bo'lmadi");
  }

  try {
    // 2 va 3-qatlam bajaruvchi ichida (mavjud tranzaksiya tekshiruvi +
    // unique indeks). Bajaruvchi biznes qoidalarini QAYTA tekshiradi.
    const result = await executor(approval);

    await Approval.updateOne(
      { _id: approval._id },
      {
        $set: {
          status: APPROVAL_STATUSES.EXECUTED,
          executedAt: new Date(),
          resultTransactionId: result?._id || null,
          failureReason: "",
        },
      },
    );
    return Approval.findById(approval._id);
  } catch (err) {
    // Re-validatsiya yiqildi (balans yetmadi, guruh arxivlandi, o'qituvchi
    // ishdan bo'shadi, davrlar kesishib qoldi) yoki texnik xato.
    // Holatni FAILED qilamiz - owner ko'radi.
    const reason = err?.message || "Noma'lum xato";
    await markFailed(approval._id, reason);
    logger.warn(
      { approvalId: String(approval._id), kind: approval.kind, reason },
      "Tasdiqlangan so'rovni bajarib bo'lmadi",
    );
    throw new ApiError(
      err?.statusCode || 400,
      `Tasdiqlandi, lekin bajarib bo'lmadi: ${reason}`,
    );
  }
};

/**
 * OMMAVIY QAROR - bir nechta so'rovni ketma-ket tasdiqlaydi/rad etadi.
 *
 * KETMA-KET, ATAYLAB PARALLEL EMAS: bajaruvchilar bir xil resursga tegishi
 * mumkin (bitta o'quvchining depoziti, bitta o'qituvchining maosh qoldig'i).
 * Parallel ishga tushirilsa ikki to'lov bir balansni bir vaqtda o'qib,
 * ikkalasi ham "yetarli" deb qaror qilardi.
 *
 * HAR BIR ID ALOHIDA TEKSHIRILADI va alohida yiqiladi: bittasi o'tmasa
 * qolganlari baribir bajariladi. Frontend'dagi checkbox holatiga ISHONILMAYDI -
 * huquq va o'zini-o'zi tasdiqlash taqiqi shu yerda qayta tekshiriladi
 * (approve/reject ichida).
 */
export const bulkDecide = async (
  ids,
  { action, note } = {},
  currentUser,
  permissions,
) => {
  const decide = action === "reject" ? reject : approve;

  const succeeded = [];
  const failed = [];

  for (const id of ids) {
    try {
      await decide(id, { note }, currentUser, permissions);
      succeeded.push(String(id));
    } catch (err) {
      failed.push({
        id: String(id),
        reason: err?.message || "Noma'lum xato",
      });
    }
  }

  return { succeeded, failed, total: ids.length };
};

const markFailed = (id, reason) =>
  Approval.updateOne(
    { _id: id },
    { $set: { status: APPROVAL_STATUSES.FAILED, failureReason: String(reason).slice(0, 500) } },
  );

/**
 * FAILED so'rovni qayta urinish (masalan balans to'ldirilgandan keyin).
 * PENDING'ga qaytaradi, owner qaytadan tasdiqlaydi.
 */
export const retry = async (id, permissions) => {
  const existing = await Approval.findById(id).lean();
  if (!existing) throw new ApiError(404, "So'rov topilmadi");
  assertCanDecide(existing, permissions);

  let doc;
  try {
    doc = await Approval.findOneAndUpdate(
      { _id: id, status: APPROVAL_STATUSES.FAILED },
      {
        $set: {
          status: APPROVAL_STATUSES.PENDING,
          decidedBy: null,
          decidedAt: null,
          failureReason: "",
        },
      },
      { new: true },
    );
  } catch (err) {
    // Xato holatda turgan paytda o'sha subyektga YANGI so'rov yaratilgan
    // bo'lsa, PENDING'ga qaytarish subyekt qulfini buzadi (E11000).
    if (err?.code === 11000) {
      throw new ApiError(
        409,
        "Bu obyekt uchun boshqa kutilayotgan so'rov bor. Avval o'shani ko'rib chiqing.",
      );
    }
    throw err;
  }
  if (!doc) throw new ApiError(409, "Faqat xato holatidagi so'rovni qayta urinish mumkin");
  return doc;
};

export { APPROVAL_STATUSES, APPROVAL_CATEGORIES, APPROVAL_KINDS, EXPENSE_KINDS };
