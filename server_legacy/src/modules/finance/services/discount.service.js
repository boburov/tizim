import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import logger from "../../../config/logger.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import { branchGroupFilter } from "../../../helpers/branchContext.helper.js";
import { ROLES } from "../../../constants/roles.js";
import * as studentPaymentService from "./studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";

// Chegirma o'quvchi expected'ini → guruh billed tushumini → o'qituvchi foiz maoshini o'zgartiradi.
const recalcTeacherForDiscount = async (doc) => {
  try {
    if (doc.scope === "monthly" && doc.year && doc.month) {
      await teacherSalaryService.recalcForGroupMonth(doc.group, doc.year, doc.month);
    } else {
      await teacherSalaryService.recalcForGroup(doc.group);
    }
  } catch (err) {
    logger.warn({ err }, "Chegirma o'zgarishida o'qituvchi maoshi qayta hisoblanmadi");
  }
};

// MONGO → PRISMA
//   { student } → { studentId },  { group } → { groupId }
//   doc.softDelete(by) → update({ isDeleted, deletedAt, deletedBy })
//
// DIQQAT - `Discount` da UNIQUE INDEKS YO'Q (na Mongo'da, na Postgres'da).
// Dublikatdan yagona himoya - pastdagi `create()` ichidagi ochiq tekshiruv.
// Shuning uchun o'qishda TARTIB ANIQ bo'lishi kerak: `resolveDiscountAmount`
// foizlarni qo'shib, keyin klamp qiladi, ya'ni bir xil to'plam har doim bir
// xil natija berishi shart.
const actorId = (u) => u?.id || u?._id || null;

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
};

export const list = async ({ studentId, groupId, year, month, page = 1, limit = 50 }) => {
  // FILIAL KO'LAMI: Discount'da `branchId` YO'Q - u GURUHGA tegishli,
  // guruh esa filialga (qarang: branchContext.helper.js dagi
  // branchGroupFilter). Ilgari bu filtr yo'q edi va A filial direktori
  // B filialning chegirmalarini ko'rardi.
  const groupScope = await branchGroupFilter("groupId");

  const where = { ...groupScope, isDeleted: false };
  if (studentId) where.studentId = String(studentId);

  if (groupId) {
    const gid = String(groupId);
    // So'ralgan guruh ko'lam ICHIDA ekanini tekshiramiz. Tekshirmasdan
    // `where.groupId = gid` deb yozilsa, guruh ID'sini qo'lda berish
    // orqali ko'lam butunlay chetlab o'tilardi.
    const allowed = groupScope.groupId?.in;
    if (allowed && !allowed.some((id) => String(id) === gid)) {
      return { items: [], total: 0, page, limit };
    }
    where.groupId = gid;
  }
  // Oy filtri: o'sha oyga tegishli monthly + barcha permanent
  if (year && month) {
    where.OR = [
      { scope: "permanent" },
      { scope: "monthly", year: Number(year), month: Number(month) },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.discount.findMany({
      where,
      include: {
        student: { select: STUDENT_SELECT },
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.discount.count({ where }),
  ]);

  return { items: withLegacyIds(items), total, page, limit };
};

const ensureStudentAndGroup = async (studentId, groupId) => {
  const [student, group] = await Promise.all([
    prisma.user.findFirst({
      where: { id: String(studentId), role: ROLES.STUDENT, isDeleted: false },
      select: { id: true },
    }),
    prisma.group.findFirst({
      where: { id: String(groupId), isDeleted: false },
      select: { id: true, isActive: true, isDeleted: true, endDate: true },
    }),
  ]);
  if (!student) throw new ApiError(400, "O'quvchi topilmadi");
  assertGroupActive(group);
};

/**
 * CHEGIRMA SHAKLI INVARIANTI - avval Mongoose `pre("validate")` da edi.
 *
 *   1. type="percent"  -> value 100 dan oshmaydi
 *   2. scope="monthly" -> yil va oy MAJBURIY
 *
 * 1: 100 dan katta foiz o'quvchi hisobini MANFIY qiladi - markaz unga
 *    qarzdor bo'lib qoladi. Zod'dagi `value: min(0)` da yuqori chegara
 *    yo'q, chunki `fixed` turida qiymat so'mda va million bo'lishi normal.
 *
 * 2: hook o'chgach bu qoida JIMGINA yo'qolgan edi - servis yil/oyni
 *    rad etish o'rniga `null` yozib ketardi. Natijada "oylik" chegirma
 *    hech qaysi oyga tegishli bo'lmasdi: `recalcForStudentScope` uni
 *    hech qachon topmasdi va chegirma umuman qo'llanmasdi. Yozuv bazada
 *    turgani uchun operator uni "qo'ydim" deb hisoblardi.
 */
const assertDiscountShape = ({ type, value, scope, year, month }) => {
  if (type === "percent" && Number(value) > 100) {
    throw new ApiError(400, "Foiz 100 dan oshmasligi kerak");
  }
  if (scope === "monthly" && (!year || !month)) {
    throw new ApiError(400, "Oylik chegirma uchun yil va oy kerak");
  }
};

export const create = async (body, currentUser) => {
  assertDiscountShape(body);
  await ensureStudentAndGroup(body.student, body.group);

  // Double-submit himoyasi: aynan bir xil faol chegirma ikki marta yozilmasin
  // (ikkalasi ham qo'llanib, expected ikki baravar kamayib ketardi).
  const scopeYear = body.scope === "monthly" ? body.year : null;
  const scopeMonth = body.scope === "monthly" ? body.month : null;

  const duplicate = await prisma.discount.findFirst({
    where: {
      studentId: String(body.student),
      groupId: String(body.group),
      type: body.type,
      value: body.value,
      scope: body.scope,
      year: scopeYear,
      month: scopeMonth,
      isActive: true,
      isDeleted: false,
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ApiError(409, "Xuddi shunday faol chegirma allaqachon mavjud");
  }

  const doc = await prisma.discount.create({
    data: {
      studentId: String(body.student),
      groupId: String(body.group),
      type: body.type,
      value: body.value,
      scope: body.scope,
      year: scopeYear,
      month: scopeMonth,
      reason: body.reason || "",
      createdById: actorId(currentUser),
    },
  });

  await studentPaymentService.recalcForStudentScope(doc.studentId, doc.groupId, {
    scope: doc.scope,
    year: doc.year,
    month: doc.month,
  });
  await recalcTeacherForDiscount({ ...doc, group: doc.groupId });
  return withLegacyId(doc);
};

export const update = async (id, body) => {
  const doc = await prisma.discount.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "Chegirma topilmadi");

  // Yozishdan OLDINGI qamrov - scope/oy o'zgarsa eski oy(lar) snapshot'ida
  // chegirma "muzlab" qolmasligi uchun ularni ham qayta hisoblaymiz (H4).
  const prevScope = { scope: doc.scope, year: doc.year, month: doc.month };

  // Mongoose hujjatni joyida mutatsiya qilardi; Prisma'da o'zgarishlar
  // `data` ga yig'iladi va "keyingi holat" alohida hisoblanadi - pastdagi
  // scope qoidasi AYNI chaqiruvda kelgan yangi qiymatga tayanishi kerak.
  const data = {};
  if (body.type !== undefined) data.type = body.type;
  if (body.value !== undefined) data.value = body.value;
  if (body.scope !== undefined) data.scope = body.scope;
  if (body.reason !== undefined) data.reason = body.reason;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const nextScope = body.scope !== undefined ? body.scope : doc.scope;
  if (nextScope === "monthly") {
    if (body.year !== undefined) data.year = body.year;
    if (body.month !== undefined) data.month = body.month;
  } else {
    data.year = null;
    data.month = null;
  }

  // Tekshiruv KEYINGI holat ustida: `{ scope: "monthly" }` ni yolg'iz
  // yuborish mumkin, u holda yil/oy yozuvdagi eski (null) qiymatda qolardi.
  assertDiscountShape({
    type: data.type ?? doc.type,
    value: data.value ?? doc.value,
    scope: nextScope,
    year: nextScope === "monthly" ? (data.year ?? doc.year) : null,
    month: nextScope === "monthly" ? (data.month ?? doc.month) : null,
  });

  const saved = await prisma.discount.update({ where: { id: doc.id }, data });

  const scopeChanged =
    prevScope.scope !== saved.scope ||
    prevScope.year !== saved.year ||
    prevScope.month !== saved.month;
  if (scopeChanged) {
    await studentPaymentService.recalcForStudentScope(saved.studentId, saved.groupId, prevScope);
    await recalcTeacherForDiscount({ group: saved.groupId, ...prevScope });
  }

  await studentPaymentService.recalcForStudentScope(saved.studentId, saved.groupId, {
    scope: saved.scope,
    year: saved.year,
    month: saved.month,
  });
  await recalcTeacherForDiscount({ ...saved, group: saved.groupId });
  return withLegacyId(saved);
};

// --- CHEGIRMA TASDIG'I (owner tasdig'i talab qilinganda) ---
//
// Chegirma TAKRORLANUVCHI: scope="permanent" bo'lsa har oy qayta qo'llanadi,
// ya'ni oyiga 500 000 so'mlik chegirma 2 yilda 12 mln bo'ladi - lekin bironta
// ham "amaliyot" chiqim limitidan oshmaydi. Shuning uchun tekshiruv summaga
// emas, IKKILIK huquqqa bog'lanadi (approvals.decide_config).
//
// TASDIQLANMAGUNCHA Discount hujjati YARATILMAYDI. Bu ataylab: hujjat mavjud
// bo'lishining o'zi buildSnapshot() dagi `Discount.find({isActive:true})` ga
// tushib, o'quvchi to'lovini darhol kamaytirardi.

// Subyekt qulfi: bir "slot" uchun bitta kutilayotgan so'rov.
// Yaratish va tahrirlash boshqa subyekt fazolari - yangi chegirma so'rovi
// mavjudini tahrirlash so'roviga to'sqinlik qilmaydi (ikkalasi ham mumkin
// bo'lishi kerak).
const discountSubjectKey = (payload) =>
  payload.op === "update"
    ? `discount:${String(payload.discountId)}`
    : `discount:new:${String(payload.student)}:${String(payload.group)}:${payload.scope}:${payload.year || 0}:${payload.month || 0}`;

/**
 * Chegirmani TASDIQQA yuboradi (hujjat yaratmaydi).
 *
 * Yengil tekshiruv: o'quvchi/guruh bor-yo'qligi. To'liq qoidalar (dublikat,
 * foiz chegarasi, guruh aktivligi) ATAYLAB tasdiqlash paytida qayta
 * tekshiriladi - so'rov va tasdiq orasida holat o'zgarishi mumkin.
 */
export const requestDiscount = async ({ op, discountId, body }, currentUser) => {
  const { resolveBranchFromGroup } = await import(
    "../../../helpers/branchContext.helper.js"
  );
  const approvalService = await import(
    "../../expenseApprovals/services/expenseApproval.service.js"
  );
  const { APPROVAL_KINDS } = await import("../../../constants/approvals.js");

  let student;
  let group;
  let base = {};
  if (op === "update") {
    const existing = await prisma.discount.findFirst({
      where: { id: String(discountId), isDeleted: false },
    });
    if (!existing) throw new ApiError(404, "Chegirma topilmadi");
    student = existing.studentId;
    group = existing.groupId;
    // Tahrirda faqat berilgan maydonlar o'zgaradi - qolgani eskisicha.
    base = {
      type: existing.type,
      value: existing.value,
      scope: existing.scope,
      year: existing.year,
      month: existing.month,
    };
  } else {
    student = body.student;
    group = body.group;
  }

  await ensureStudentAndGroup(student, group);

  const [studentDoc, groupDoc] = await Promise.all([
    prisma.user.findUnique({ where: { id: String(student) }, select: STUDENT_SELECT }),
    prisma.group.findUnique({ where: { id: String(group) }, select: { name: true } }),
  ]);

  const payload = {
    op,
    discountId: discountId ? String(discountId) : undefined,
    student: String(student),
    group: String(group),
    type: body.type ?? base.type,
    value: body.value ?? base.value,
    scope: body.scope ?? base.scope,
    year: body.year ?? base.year,
    month: body.month ?? base.month,
    reason: body.reason,
    isActive: body.isActive,
  };

  return approvalService.createRequest({
    branchId: await resolveBranchFromGroup(group),
    kind: APPROVAL_KINDS.DISCOUNT_SET,
    payload,
    subjectKey: discountSubjectKey(payload),
    subjectName:
      [studentDoc?.firstName, studentDoc?.lastName].filter(Boolean).join(" ") || "",
    contextName: groupDoc?.name || "",
    requestNote: body.requestNote,
    currentUser,
  });
};

/**
 * Tasdiqlangan chegirma so'rovini BAJARADI.
 *
 * create/update ning O'ZINI chaqiradi - dublikat tekshiruvi, foiz chegarasi
 * va qayta hisoblash (studentPayment + o'qituvchi foiz maoshi) shu yerda
 * QAYTA ishlaydi. Yiqilsa approve() so'rovni FAILED qiladi.
 */
export const executeApprovedDiscount = async (approval) => {
  const p = approval?.payload || {};
  // Approval moduli hali ko'chirilmagan - ikkala nomni ham qabul qilamiz.
  const requesterId = approval?.requestedById || approval?.requestedBy || null;
  const actor = { id: requesterId, _id: requesterId };

  if (p.op === "create") {
    return create(
      {
        student: p.student,
        group: p.group,
        type: p.type,
        value: p.value,
        scope: p.scope,
        year: p.year,
        month: p.month,
        reason: p.reason,
      },
      actor,
    );
  }

  if (p.op === "update") {
    if (!p.discountId) throw new ApiError(400, "So'rovda chegirma identifikatori yo'q");
    return update(p.discountId, {
      type: p.type,
      value: p.value,
      scope: p.scope,
      year: p.year,
      month: p.month,
      reason: p.reason,
      isActive: p.isActive,
    });
  }

  throw new ApiError(400, `Noma'lum chegirma amali: ${p.op}`);
};

export const remove = async (id, currentUser) => {
  const doc = await prisma.discount.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "Chegirma topilmadi");
  await prisma.discount.update({
    where: { id: doc.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
  });
  await studentPaymentService.recalcForStudentScope(doc.studentId, doc.groupId, {
    scope: doc.scope,
    year: doc.year,
    month: doc.month,
  });
  await recalcTeacherForDiscount({ ...doc, group: doc.groupId });
  return { id: doc.id, _id: doc.id };
};
