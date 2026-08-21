import prisma from "../../../config/prisma.js";
import { APPROVAL_KINDS } from "../../../constants/approvals.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { toUtcMidnight, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import { assertPeriodInvariants } from "../../../helpers/period.helper.js";
import { resolveBranchForWrite } from "../../../helpers/branchContext.helper.js";
import { assertNotSelfSalary } from "../../../helpers/selfSalary.guard.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import * as teacherSalaryService from "./teacherSalary.service.js";

// O'QITUVCHINING STANDART MAOSH STAVKASI - servis qatlami.
//
// ASOSIY QOIDA: stavka HECH QACHON joyida tahrirlanmaydi. O'zgarish har doim
// eskisini yopib (effectiveTo) yangisini ochadi. Shu tufayli "martda oshirdik"
// yanvar maoshini qayta yozib yubormaydi - o'tgan oy recalc bo'lsa ham o'sha
// oyda amal qilgan stavkani topadi.
//
// ═════════════════════════════════════════════════════════════════
// MONGO → PRISMA
//
//   { teacher: id }        → { teacherId: id }
//   doc.save()             → prisma.teacherCompensation.update(...)
//   doc.softDelete(by)     → update({ isDeleted, deletedAt, deletedBy })
//   toObjectId(id)         → String(id)  (kalit oddiy 24-hex satr)
//
// ATOMIKLIK - HAQIQIY YAXSHILANISH:
// `setCompensation` IKKI yozuv qiladi (eskisini yopish + yangisini ochish).
// Mongo variantida ular alohida edi: ikkinchisi yiqilsa o'qituvchi
// STAVKASIZ qolardi (eskisi yopilgan, yangisi yo'q) va maoshi jimgina
// 0 ga tushardi. Endi ikkalasi bitta `$transaction` ichida - yo ikkalasi,
// yo hech biri.
//
// QAYTA HISOB (recomputeFrom) ATAYLAB TRANZAKSIYADAN TASHQARIDA: u o'nlab
// oyni aylanadi va uzoq davom etadi; tranzaksiya ichiga solish qatorlarni
// keraksiz uzoq qulflab turardi.
// ═════════════════════════════════════════════════════════════════

const actorId = (u) => u?.id || u?._id || null;

/**
 * STAVKA SHAKLI INVARIANTI - avval Mongoose `pre("validate")` da edi.
 *
 * Hook o'chgach uchta qoida BIR YO'LA yo'qolgan edi (qarang: MIGRATION.md,
 * "Validatsiya invariantlari"):
 *
 *   1. baseType="none"     -> baseAmount MAJBURAN 0
 *   2. variableType="none" -> variableRate MAJBURAN 0
 *   3. ikkalasi ham "none" -> RAD ETILADI
 *
 * 1-2 NORMALIZATSIYA, tekshiruv emas: foydalanuvchi "fiksa yo'q" deb
 * belgilab, summani ekranda qoldirib ketishi mumkin. Qiymat tozalanmasa
 * `rateResolver` uni O'QIYDI va o'chirilgan qism baribir maoshga
 * qo'shilardi - ya'ni "o'chirdim" degan amal jimgina ishlamay qolardi.
 *
 * 3 esa ochiq rad etish: ikkala qism ham yo'q stavka har oy 0 so'm maosh
 * yozib beradi va buni oylar o'tib topish qiyin.
 *
 * NEGA SERVISDA (Zod'da emas): stavka HTTP'dan tashqari `imports`
 * (o'qituvchilar importi) va `auth.registerUser` (ishga olish oqimi)
 * dan ham yoziladi - ular Zod sxemasini chetlab o'tadi.
 */
const applyRateShape = (data) => {
  if (data.baseType === "none") data.baseAmount = 0;
  if (data.variableType === "none") data.variableRate = 0;
  if (data.baseType === "none" && data.variableType === "none") {
    throw new ApiError(
      400,
      "Kamida bitta maosh qismi (fiksa yoki o'zgaruvchi) belgilanishi kerak",
    );
  }
  return data;
};

// effectiveTo har doim effectiveFrom dan KEYIN. Teng bo'lsa davr uzunligi
// nol bo'lib qoladi: `rateResolver` uni [from, to) oynasida hech qachon
// tanlamaydi, ya'ni stavka mavjud bo'lib turib ishlamaydi.
const assertRange = (effectiveFrom, effectiveTo) => {
  if (!effectiveTo || !effectiveFrom) return;
  if (new Date(effectiveTo).getTime() <= new Date(effectiveFrom).getTime()) {
    throw new ApiError(400, "Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak");
  }
};

/**
 * STAVKA DAVRLARI KESISHMASLIGI KERAK.
 *
 * NEGA MAJBURIY: rateResolver har bir kesishgan stavka uchun ALOHIDA
 * segment yaratadi va kunlar QO'SHILADI. Ikki stavka bir kunni qamrasa,
 * o'sha kun ikki marta to'lanadi - 2 mln oylik 4 mln bo'lib chiqadi.
 *
 * `setCompensation` da ochiq davrni yopish orqali bu holat yuzaga kelmasdi,
 * lekin `amendCompensation` effectiveFrom ni ERKIN o'zgartirardi va
 * yopilgan davr ustiga surib yuborish mumkin edi.
 *
 * TeacherGroupPeriod va GroupMembership da AYNAN SHU qo'riqchi bor
 * (assertPeriodInvariants) - stavka davrlari ham xuddi shunday himoyalanadi.
 */
const assertNoOverlap = async (teacherId, candidate, excludeId = null) => {
  const rows = await prisma.teacherCompensation.findMany({
    where: {
      teacherId: String(teacherId),
      isDeleted: false,
      ...(excludeId ? { id: { not: String(excludeId) } } : {}),
    },
    select: { effectiveFrom: true, effectiveTo: true },
  });

  assertPeriodInvariants(
    { startDate: candidate.effectiveFrom, endDate: candidate.effectiveTo || null },
    rows.map((r) => ({ startDate: r.effectiveFrom, endDate: r.effectiveTo || null })),
    "date",
  );
};

const assertTeacher = async (teacherId) => {
  const user = await prisma.user.findUnique({
    where: { id: String(teacherId) },
    select: {
      id: true,
      role: true,
      isDeleted: true,
      hiredAt: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!user || user.isDeleted) throw new ApiError(404, "O'qituvchi topilmadi");
  if (user.role !== ROLES.TEACHER) {
    throw new ApiError(400, "Faqat o'qituvchiga maosh stavkasi belgilanadi");
  }
  return user;
};

/** O'qituvchining barcha stavka tarixi (yangisidan eskisiga). */
export const listByTeacher = async (teacherId) => {
  const rows = await prisma.teacherCompensation.findMany({
    where: { teacherId: String(teacherId), isDeleted: false },
    orderBy: { effectiveFrom: "desc" },
  });
  return withLegacyIds(rows);
};

/** Berilgan sanada (default - bugun) amal qilgan stavka. */
export const getActive = async (teacherId, onDate = null) => {
  const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
  const rows = await prisma.teacherCompensation.findMany({
    where: { teacherId: String(teacherId), isDeleted: false },
    orderBy: { effectiveFrom: "desc" },
  });
  const found = rows.find((r) => {
    const s = toUtcMidnight(r.effectiveFrom).getTime();
    const e = r.effectiveTo ? toUtcMidnight(r.effectiveTo).getTime() : Infinity;
    return s <= t && t < e;
  });
  return found ? withLegacyId(found) : null;
};

/**
 * YANGI STAVKA O'RNATADI (eskisini yopadi).
 *
 * effectiveFrom o'tgan sanaga qo'yilsa - o'sha oydan boshlab maoshlar QAYTA
 * HISOBLANADI (retro oshirish/kamaytirish). Bu ataylab ruxsat etilgan, chunki
 * "1-yanvardan oshirdik, lekin fevralda kiritdik" real holat. Lekin bu
 * moliyaviy ta'sirga ega, shuning uchun chaqiruvchi (requestSet) uni tasdiqdan
 * o'tkazadi.
 */
export const setCompensation = async (body, currentUser) => {
  const teacher = await assertTeacher(body.teacher);
  // O'ZIGA O'ZI STAVKA QO'YISH TAQIQI (helpers/selfSalary.guard.js).
  // Bu funksiya ishga olish oqimidan (createStaff) ham chaqiriladi, lekin
  // u yerda yangi yaratilgan xodim chaqiruvchining o'zi bo'la olmaydi.
  assertNotSelfSalary(currentUser, teacher.id);
  const from = toUtcMidnight(body.effectiveFrom || localTodayMidnight());

  // Ishga olingan sanadan oldin stavka bo'la olmaydi.
  if (teacher.hiredAt && from.getTime() < toUtcMidnight(teacher.hiredAt).getTime()) {
    throw new ApiError(
      400,
      "Maosh stavkasi ishga olingan sanadan oldin boshlana olmaydi",
    );
  }

  const branchId = await resolveBranchForWrite(currentUser, body.branchId ?? null);

  const open = await prisma.teacherCompensation.findFirst({
    where: { teacherId: teacher.id, effectiveTo: null, isDeleted: false },
    select: { id: true, effectiveFrom: true },
  });

  if (open) {
    const openFrom = toUtcMidnight(open.effectiveFrom).getTime();
    if (from.getTime() <= openFrom) {
      throw new ApiError(
        400,
        "Yangi stavka amaldagi stavkadan keyin boshlanishi kerak. Xato kiritilgan bo'lsa amaldagi stavkani tahrirlang.",
      );
    }
  }

  // KESISHUV TEKSHIRUVI HECH NARSA O'ZGARTIRILMASDAN OLDIN.
  //
  // Ochiq davr `from` da yopilishi KERAK, lekin uni tekshiruvga qo'shib
  // yuborsak "o'zi bilan o'zi kesishdi" degan yolg'on xato chiqardi -
  // shuning uchun u ro'yxatdan chiqariladi (excludeId).
  const openId = open?.id || null;
  await assertNoOverlap(
    teacher.id,
    { effectiveFrom: from, effectiveTo: null },
    openId,
  );

  // Ikkala yozuv BITTA tranzaksiyada: eskisi yopilib yangisi ochilmay
  // qolgan "stavkasiz o'qituvchi" holati endi mumkin emas.
  const created = await prisma.$transaction(async (tx) => {
    if (open) {
      await tx.teacherCompensation.update({
        where: { id: open.id },
        data: { effectiveTo: from, updatedById: actorId(currentUser) },
      });
    }
    return tx.teacherCompensation.create({
      data: applyRateShape({
        teacherId: teacher.id,
        branchId,
        effectiveFrom: from,
        effectiveTo: null,
        baseType: body.baseType || "none",
        baseAmount: Number(body.baseAmount) || 0,
        variableType: body.variableType || "none",
        variableRate: Number(body.variableRate) || 0,
        percentBase: body.percentBase || "billed",
        note: body.note || "",
        createdById: actorId(currentUser),
      }),
    });
  });

  // Natijaga qayta hisob xulosasini biriktiramiz - UI "3 oy yangilandi,
  // 2 oy to'langani uchun o'zgarmadi" deb ko'rsatadi.
  const recompute = await recomputeFrom(teacher.id, from);
  const result = withLegacyId(created);
  result.recompute = recompute;
  return result;
};

/**
 * Amaldagi (ochiq) stavkani TUZATADI - yangi davr ochmaydi.
 * Faqat XATO KIRITISH uchun ("nolni ko'p yozdim"). Haqiqiy oshirish
 * setCompensation orqali bo'lishi kerak, aks holda tarix yo'qoladi.
 */
export const amendCompensation = async (id, patch, currentUser) => {
  const doc = await prisma.teacherCompensation.findUnique({
    where: { id: String(id) },
  });
  if (!doc || doc.isDeleted) throw new ApiError(404, "Maosh stavkasi topilmadi");
  // Tuzatish ham stavkani o'zgartiradi - bir xil taqiq.
  assertNotSelfSalary(currentUser, doc.teacherId);

  const before = toUtcMidnight(doc.effectiveFrom);

  // Mongoose hujjatni joyida mutatsiya qilardi va tekshiruv mutatsiyadan
  // KEYIN, `save()` dan OLDIN ishlardi. Prisma'da yozuv o'zgarmasdan
  // turadi, shuning uchun "keyingi holat" alohida hisoblanadi va
  // tekshiruv aynan o'sha holat ustida bajariladi.
  const data = { updatedById: actorId(currentUser) };
  if (patch.effectiveFrom !== undefined) data.effectiveFrom = toUtcMidnight(patch.effectiveFrom);
  if (patch.baseType !== undefined) data.baseType = patch.baseType;
  if (patch.baseAmount !== undefined) data.baseAmount = Number(patch.baseAmount) || 0;
  if (patch.variableType !== undefined) data.variableType = patch.variableType;
  if (patch.variableRate !== undefined) data.variableRate = Number(patch.variableRate) || 0;
  if (patch.percentBase !== undefined) data.percentBase = patch.percentBase;
  if (patch.branchId !== undefined) data.branchId = patch.branchId || null;
  if (patch.note !== undefined) data.note = patch.note;

  const nextFrom = data.effectiveFrom ?? doc.effectiveFrom;

  // SHAKL INVARIANTI KEYINGI HOLAT ustida. `patch` qisman bo'lgani uchun
  // "baseType=none" ni yolg'iz yuborish mumkin - u holda baseAmount
  // yozuvda ESKISICHA qolib ketardi. Shuning uchun avval yig'ib, keyin
  // normalizatsiya qilamiz va natijani `data` ga qaytaramiz.
  const nextShape = applyRateShape({
    baseType: data.baseType ?? doc.baseType,
    baseAmount: data.baseAmount ?? doc.baseAmount,
    variableType: data.variableType ?? doc.variableType,
    variableRate: data.variableRate ?? doc.variableRate,
  });
  data.baseAmount = nextShape.baseAmount;
  data.variableRate = nextShape.variableRate;
  assertRange(nextFrom, doc.effectiveTo);

  // KESISHUV QO'RIQCHISI - aynan shu yerda yo'q edi.
  // effectiveFrom orqaga surilsa, yopilgan oldingi davr ustiga tushib
  // qolardi va o'sha oy maoshi IKKI BAROBAR hisoblanardi.
  await assertNoOverlap(
    doc.teacherId,
    { effectiveFrom: nextFrom, effectiveTo: doc.effectiveTo },
    doc.id,
  );

  const saved = await prisma.teacherCompensation.update({
    where: { id: doc.id },
    data,
  });

  // Sana orqaga surilgan bo'lsa - eskiroq nuqtadan qayta hisoblaymiz.
  const from = new Date(
    Math.min(before.getTime(), toUtcMidnight(saved.effectiveFrom).getTime()),
  );
  await recomputeFrom(doc.teacherId, from);
  return withLegacyId(saved);
};

/**
 * Stavkani o'chiradi (soft). Eng oxirgi (ochiq) stavkani o'chirsa - undan
 * oldingisi qayta ochiladi, aks holda "stavkasiz teshik" qolardi.
 */
export const removeCompensation = async (id, currentUser) => {
  const doc = await prisma.teacherCompensation.findUnique({
    where: { id: String(id) },
  });
  if (!doc || doc.isDeleted) throw new ApiError(404, "Maosh stavkasi topilmadi");

  const from = toUtcMidnight(doc.effectiveFrom);

  // O'chirish va oldingi davrni qayta ochish BIRGA bajarilishi shart:
  // ikkinchisi yiqilsa o'qituvchida stavkasiz teshik qolardi.
  await prisma.$transaction(async (tx) => {
    await tx.teacherCompensation.update({
      where: { id: doc.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: actorId(currentUser),
      },
    });

    const prev = await tx.teacherCompensation.findFirst({
      where: { teacherId: doc.teacherId, isDeleted: false, effectiveTo: from },
      select: { id: true },
    });
    if (prev) {
      await tx.teacherCompensation.update({
        where: { id: prev.id },
        data: {
          effectiveTo: doc.effectiveTo || null,
          updatedById: actorId(currentUser),
        },
      });
    }
  });

  await recomputeFrom(doc.teacherId, from);
  return { ok: true };
};

/**
 * Berilgan sanadan BUGUNGACHA bo'lgan har oy uchun o'qituvchi maoshini qayta
 * hisoblaydi (fiksa qatori + barcha guruh qatorlari).
 *
 * Best-effort: bitta oydagi xato qolganini to'xtatmaydi - stavka o'zgarishi
 * baribir saqlanib qolishi kerak, keyingi tungi job qolganini tuzatadi.
 */
export const recomputeFrom = async (teacherId, fromDate) => {
  const start = toUtcMidnight(fromDate);
  const today = localTodayMidnight();
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;
  const endYear = today.getUTCFullYear();
  const endMonth = today.getUTCMonth() + 1;

  let months = 0;
  // TO'LANGANI uchun tegilmagan qatorlar - foydalanuvchiga aytiladi.
  // Jimgina o'tkazib yuborish "nega maosh o'zgarmadi?" degan savolni
  // tug'dirardi, shuning uchun soni qaytariladi.
  let lockedRows = 0;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    try {
      // `isDeleted` filtri YO'Q - TeacherSalary'da bunday ustun umuman
      // mavjud emas (u qayta hisoblanadigan hosila jadval, o'chirilmaydi).
      // eslint-disable-next-line no-await-in-loop
      const rows = await prisma.teacherSalary.findMany({
        where: { teacherId: String(teacherId), year, month },
        select: { id: true, kind: true, status: true, paidAmount: true },
      });

      for (const r of rows) {
        if (r.status === "paid" && r.paidAmount > 0) lockedRows += 1;
      }

      // lockPaid: BU YO'L stavka o'zgarishidan keladi - allaqachon to'langan
      // (yopilgan) oylar qayta ochilmasligi kerak. Boshqa chaqiruvchilar
      // (o'quvchi qo'shildi, narx o'zgardi) qulfsiz chaqiradi, chunki u
      // yerda maoshning HAQIQIY bazasi o'zgargan.
      // eslint-disable-next-line no-await-in-loop
      await teacherSalaryService.recalcBaseForTeacherMonth(teacherId, year, month, {
        lockPaid: true,
      });
      for (const r of rows) {
        if (r.kind !== "group") continue;
        // eslint-disable-next-line no-await-in-loop
        await teacherSalaryService.recalc(r.id, { lockPaid: true });
      }
      months += 1;
    } catch (err) {
      logger.warn({ err, teacherId, year, month }, "Maosh qayta hisobida xato");
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { months, lockedRows };
};

// ============================================================
// TASDIQ (approval) oqimi
// ============================================================

const subjectKeyFor = (teacher) => `teacher_compensation:${String(teacher)}`;

/**
 * Stavka o'zgarishini TASDIQQA yuboradi (yozuv yaratmaydi).
 * To'liq tekshiruvlar ATAYLAB bajarish paytida qayta ishlaydi - so'rov va
 * tasdiq orasida holat o'zgargan bo'lishi mumkin.
 */
export const requestSet = async (body, currentUser) => {
  const approvalService = await import(
    "../../expenseApprovals/services/expenseApproval.service.js"
  );
  const teacher = await assertTeacher(body.teacher);
  // So'rov ham yaratilmaydi - qarang teacherGroupPeriod.requestSalaryTerms.
  assertNotSelfSalary(currentUser, teacher.id);
  const branchId = await resolveBranchForWrite(currentUser, body.branchId ?? null);

  return approvalService.createRequest({
    branchId,
    kind: APPROVAL_KINDS.TEACHER_COMPENSATION_SET,
    payload: {
      op: body.op || "set",
      compensationId: body.compensationId ? String(body.compensationId) : undefined,
      teacher: String(teacher.id),
      branchId: branchId ? String(branchId) : null,
      effectiveFrom: body.effectiveFrom,
      baseType: body.baseType,
      baseAmount: body.baseAmount,
      variableType: body.variableType,
      variableRate: body.variableRate,
      percentBase: body.percentBase,
      note: body.note,
    },
    subjectKey: subjectKeyFor(teacher.id),
    subjectName: [teacher.firstName, teacher.lastName].filter(Boolean).join(" "),
    contextName: "Maosh stavkasi",
    requestNote: body.requestNote,
    currentUser,
  });
};

/** Tasdiqlangan stavka so'rovini bajaradi. */
export const executeApprovedCompensation = async (approval) => {
  const p = approval?.payload || {};
  // Tarixda so'rovchi ko'rinsin (tasdiqlovchi emas).
  // Approval moduli hali ko'chirilmagan - `requestedById`/`requestedBy`
  // ikkalasi ham bo'lishi mumkin.
  const requesterId = approval?.requestedById || approval?.requestedBy || null;
  const actor = { id: requesterId, _id: requesterId };

  if (p.op === "amend") {
    if (!p.compensationId) throw new ApiError(400, "So'rovda stavka identifikatori yo'q");
    return amendCompensation(p.compensationId, p, actor);
  }
  return setCompensation(p, actor);
};
