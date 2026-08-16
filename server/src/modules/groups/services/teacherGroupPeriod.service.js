import prisma from "../../../config/prisma.js";
import { APPROVAL_KINDS } from "../../../constants/approvals.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import {
  toUtcMidnight,
  localTodayMidnight,
  scheduleActiveOn,
} from "../../../helpers/attendance.helper.js";
import { assertPeriodInvariants } from "../../../helpers/period.helper.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import { resolveBranchFromGroup } from "../../../helpers/branchContext.helper.js";
import { assertNotSelfSalary } from "../../../helpers/selfSalary.guard.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";

// ═════════════════════════════════════════════════════════════════
// MONGO → PRISMA
//
//   { teacher: id }              → { teacherId: id }
//   { group: id }                → { groupId: id }
//   { isDeleted: { $ne: true } } → { isDeleted: false }
//   doc.softDelete()             → update({ isDeleted, deletedAt })
//   Group.teachers massivi       → ko'p-ko'pga bog'lanish (`set`/`some`)
//   group.schedule embedded      → GroupScheduleItem[] relation
//
// `toObjectId()` OLIB TASHLANDI: Prisma kaliti oddiy 24-belgili satr.
// U ilgari noto'g'ri ID uchun 400 berardi; endi mos kelmagan ID shunchaki
// hech nimaga to'g'ri kelmaydi va chaqiruvchi 404 qaytaradi.
//
// SCHEDULE ESLATMASI: `scheduleActiveOn()` guruh jadvalini kutadi, ya'ni
// har bir `Group` so'rovida `schedule` ochiq `include` qilinishi SHART.
// Unutilsa massiv bo'sh kelib, jadval to'qnashuvi tekshiruvi JIMGINA
// hech nimani tutmay qo'yardi - to'qnashuv esa bazaga yozilib ketardi.
// ═════════════════════════════════════════════════════════════════

// Jadval bilan birga o'qiladigan guruh maydonlari - bitta manba.
const GROUP_WITH_SCHEDULE = {
  id: true,
  name: true,
  isActive: true,
  isDeleted: true,
  startDate: true,
  endDate: true,
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
};

const DAY_LABEL_UZ = {
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
};

// Ikki vaqt oralig'i kesishadimi ("HH:mm" - nol to'ldirilgani uchun string solishtiruv
// ishlaydi). Yopiq-ochiq: 14:00-15:00 va 15:00-16:00 kesishmaydi.
const timesOverlap = (aStart, aEnd, bStart, bEnd) =>
  aStart < bEnd && bStart < aEnd;

// A jadvalidagi biror slot B dagi slot bilan bir kun + kesishuvchi vaqtga tushsa,
// o'sha B slotini qaytaradi (aks holda null).
const findSlotConflict = (slotsA, slotsB) => {
  for (const a of slotsA) {
    for (const b of slotsB) {
      if (
        a.day === b.day &&
        timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)
      ) {
        return b;
      }
    }
  }
  return null;
};

// Bitta o'qituvchiga bir kun/bir vaqtda ikkita guruh darsi belgilanmasligini
// ta'minlaydi. incomingSchedule - tekshirilayotgan guruh jadvali (versiyalangan
// bo'lishi mumkin); excludeGroupId - o'sha guruhning o'zi (o'z-o'ziga to'qnashmasin).
// O'qituvchi HOZIR dars berayotgan (ochiq davr, aktiv guruh) jadvallar bilan solishtiradi.
export const assertTeacherScheduleFree = async (
  teacher,
  incomingSchedule,
  excludeGroupId = null,
) => {
  const slots = scheduleActiveOn(incomingSchedule || []);
  if (!slots.length) return;

  const periods = await prisma.teacherGroupPeriod.findMany({
    where: { teacherId: String(teacher), endDate: null, isDeleted: false },
    select: { groupId: true },
  });
  const groupIds = periods
    .map((p) => p.groupId)
    .filter((g) => !excludeGroupId || String(g) !== String(excludeGroupId));
  if (!groupIds.length) return;

  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds }, isActive: true, isDeleted: false },
    select: { name: true, schedule: GROUP_WITH_SCHEDULE.schedule },
  });

  for (const g of groups) {
    const conflict = findSlotConflict(slots, scheduleActiveOn(g.schedule || []));
    if (conflict) {
      const dayLabel = DAY_LABEL_UZ[conflict.day] || conflict.day;
      throw new ApiError(
        400,
        `O'qituvchining bu vaqtda darsi bor: "${g.name}" — ${dayLabel} ${conflict.startTime}-${conflict.endTime}. Bir o'qituvchiga bir vaqtda ikkita dars belgilab bo'lmaydi.`,
      );
    }
  }
};

// Guruhga biriktirish uchun BO'SH o'qituvchilar ro'yxati - guruh jadvalidagi
// kun/vaqtlarda boshqa (o'z boshqa guruhida) darsi bo'lmagan aktiv o'qituvchilar.
// Band (jadvali to'qnashadigan) o'qituvchilar chiqarib tashlanadi.
export const listAvailableTeachers = async (groupId) => {
  const group = await prisma.group.findUnique({
    where: { id: String(groupId) },
    select: { id: true, schedule: GROUP_WITH_SCHEDULE.schedule },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  const slots = scheduleActiveOn(group.schedule || []);

  const teachers = await prisma.user.findMany({
    where: { role: ROLES.TEACHER, isActive: true, isDeleted: false },
    select: { id: true, firstName: true, lastName: true, username: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  // Guruh jadvali bo'sh - to'qnashuv bo'lmaydi, hamma bo'sh.
  if (!slots.length) return withLegacyIds(teachers);

  const teacherIds = teachers.map((t) => t.id);
  // Har bir o'qituvchining BOSHQA guruhlaridagi ochiq davrlari.
  const periods = await prisma.teacherGroupPeriod.findMany({
    where: {
      teacherId: { in: teacherIds },
      endDate: null,
      isDeleted: false,
      groupId: { not: String(groupId) },
    },
    select: { teacherId: true, groupId: true },
  });

  const otherGroupIds = [...new Set(periods.map((p) => String(p.groupId)))];
  const otherGroups = await prisma.group.findMany({
    where: { id: { in: otherGroupIds }, isActive: true, isDeleted: false },
    select: { id: true, schedule: GROUP_WITH_SCHEDULE.schedule },
  });
  const schedByGroup = new Map(
    otherGroups.map((g) => [String(g.id), scheduleActiveOn(g.schedule || [])]),
  );

  const busyByTeacher = new Map();
  for (const p of periods) {
    const sched = schedByGroup.get(String(p.groupId));
    if (!sched?.length) continue;
    const key = String(p.teacherId);
    const arr = busyByTeacher.get(key) || [];
    arr.push(...sched);
    busyByTeacher.set(key, arr);
  }

  // Guruh jadvali bilan to'qnashadigan (band) o'qituvchilarni chiqarib tashlaymiz.
  return withLegacyIds(
    teachers.filter((t) => {
      const busy = busyByTeacher.get(String(t.id));
      return !busy || !findSlotConflict(slots, busy);
    }),
  );
};

// Maosh stavkasini turiga qarab normallashtiradi (fixed→foiz 0, percent→fiksa 0).
const normalizeRate = (salaryType, fixedAmount, percentRate) => ({
  salaryType: salaryType || "fixed",
  fixedAmount: salaryType === "percent" ? 0 : Number(fixedAmount) || 0,
  percentRate: salaryType === "fixed" ? 0 : Number(percentRate) || 0,
});

const DAY_MS = 24 * 60 * 60 * 1000;

const fmtDate = (d) => {
  const x = new Date(d);
  const dd = String(x.getUTCDate()).padStart(2, "0");
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${x.getUTCFullYear()}`;
};

// Dars davri guruhning kurs oynasidan chiqmasligini ta'minlaydi:
//  - davr boshlanishi >= guruh boshlanish sanasi (guruhdan oldin dars bo'lmaydi);
//  - davr boshlanishi <= guruh tugash sanasi (kurs tugagach yangi davr ochilmaydi);
//  - davr tugashi (EXCLUSIVE) guruh tugash sanasi + 1 kundan oshmaydi
//    (guruh endDate INKLYUZIV oxirgi kun, davr endDate EKSKLYUZIV).
// group.startDate/endDate bo'sh bo'lsa (eski guruhlar) - tegishli chegara tekshirilmaydi.
const assertWithinGroupBounds = (candidate, group) => {
  if (group?.startDate) {
    const gStart = toUtcMidnight(group.startDate).getTime();
    if (candidate.startDate.getTime() < gStart) {
      throw new ApiError(
        400,
        `Dars davri guruh boshlanish sanasidan (${fmtDate(gStart)}) oldin bo'lishi mumkin emas`,
      );
    }
  }
  if (group?.endDate) {
    const gEndIncl = toUtcMidnight(group.endDate).getTime();
    if (candidate.startDate.getTime() > gEndIncl) {
      throw new ApiError(
        400,
        `Dars davri guruh tugash sanasidan (${fmtDate(gEndIncl)}) keyin boshlanishi mumkin emas`,
      );
    }
    if (candidate.endDate && candidate.endDate.getTime() > gEndIncl + DAY_MS) {
      throw new ApiError(
        400,
        `Dars davri guruh tugash sanasidan (${fmtDate(gEndIncl)}) keyin tugashi mumkin emas`,
      );
    }
  }
};

// --- RESOLVERLAR ---

// Berilgan sanada (default bugun) guruhda dars berayotgan o'qituvchi id'lari.
export const activeTeacherIdsForGroup = async (group, onDate = null) => {
  const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
  const rows = await prisma.teacherGroupPeriod.findMany({
    where: { groupId: String(group), isDeleted: false },
    select: { teacherId: true, startDate: true, endDate: true },
  });
  const ids = [];
  for (const r of rows) {
    const s = new Date(r.startDate).getTime();
    const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
    if (t >= s && t < e) ids.push(r.teacherId);
  }
  return ids;
};

// Berilgan oy bilan kesishadigan (dars bergan) o'qituvchi davrlari - maosh
// generatsiyasi uchun. Oy [monthStart, monthEnd] bilan overlap.
//
// DIQQAT - `teacher` maydoni SAQLANADI: chaqiruvchilar (teacherSalary) uni
// shu nom bilan o'qiydi. Prisma `teacherId` beradi, shuning uchun natija
// ochiq moslashtiriladi - aks holda `r.teacher` undefined bo'lib, maosh
// yozuvi egasiz qolardi.
export const teacherPeriodsActiveInMonth = async (group, year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();
  const rows = await prisma.teacherGroupPeriod.findMany({
    where: { groupId: String(group), isDeleted: false },
    select: { id: true, teacherId: true, startDate: true, endDate: true },
  });
  return rows
    .filter((r) => {
      const s = new Date(r.startDate).getTime();
      const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
      return s <= monthEnd && e > monthStart;
    })
    .map((r) => ({ ...r, _id: r.id, teacher: r.teacherId }));
};

// O'qituvchi+guruhning shu oy bilan kesishadigan MAOSH davrlari (stavka bilan).
// Maosh snapshot hisobida ishlatiladi - oydagi har bir davr alohida proratsiya
// qilinib summalar qo'shiladi.
export const periodsForMonth = async (teacher, group, year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();
  const rows = await prisma.teacherGroupPeriod.findMany({
    where: {
      teacherId: String(teacher),
      groupId: String(group),
      isDeleted: false,
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      // Yangi (ustunlik) stavka maydonlari - rateResolver shularni o'qiydi.
      variableType: true,
      variableRate: true,
      percentBase: true,
      // Legacy - eski yozuvlarda stavka shu yerda.
      salaryType: true,
      fixedAmount: true,
      percentRate: true,
    },
  });
  return rows
    .filter((r) => {
      const s = new Date(r.startDate).getTime();
      const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
      return s <= monthEnd && e > monthStart;
    })
    .map((r) => ({ ...r, _id: r.id }));
};

// Guruhda hozir aktiv o'qituvchilar bo'lgan guruh id'lari (teacher uchun).
export const activeGroupIdsForTeacher = async (teacher, onDate = null) => {
  const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
  const rows = await prisma.teacherGroupPeriod.findMany({
    where: { teacherId: String(teacher), isDeleted: false },
    select: { groupId: true, startDate: true, endDate: true },
  });
  const ids = [];
  for (const r of rows) {
    const s = new Date(r.startDate).getTime();
    const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
    if (t >= s && t < e) ids.push(r.groupId);
  }
  return ids;
};

export const listByGroup = async (group) => {
  const rows = await prisma.teacherGroupPeriod.findMany({
    where: { groupId: String(group), isDeleted: false },
    include: {
      teacher: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
    orderBy: { startDate: "desc" },
  });
  return withLegacyIds(rows);
};

// --- KESH SINXRONI ---

// Group.teachers ni davrlardan HOSILA kesh sifatida yangilaydi (hozir aktivlar).
// Manba - davrlar; teachers faqat so'rov tezligi uchun denormalizatsiya.
//
// Mongo'da bu `$set: { teachers: [...] }` edi. Prisma'da ko'p-ko'pga
// bog'lanish `set` bilan TO'LIQ almashtiriladi - join jadvalidagi eski
// qatorlar o'chib, yangilari yoziladi.
export const syncGroupTeachersCache = async (group) => {
  const ids = await activeTeacherIdsForGroup(group);
  await prisma.group.update({
    where: { id: String(group) },
    data: { teachers: { set: ids.map((id) => ({ id: String(id) })) } },
  });
  return ids;
};

// --- RECOMPUTE (o'zgargan oylardagi shu o'qituvchi maoshi) ---

// Davr qamragan oylar ro'yxati (year/month). OY darajasida ishlaydi: oxiri JORIY
// OYGACHA cheklanadi - kelajak OYLAR uchun maosh plani yaratilmaydi (ular oylik
// jobda paydo bo'ladi), lekin joriy oyning kelajak KUNIDA boshlangan davr ham
// joriy oyni qayta hisoblaydi. endDate EXCLUSIVE - oxirgi kun = endDate - 1 kun.
const monthIdx = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();

const monthsSpanned = (startDate, endDateExcl) => {
  const DAY = 24 * 60 * 60 * 1000;
  const curIdx = monthIdx(localTodayMidnight());
  const startIdx = monthIdx(new Date(startDate));
  let endIdx;
  if (endDateExcl) {
    endIdx = monthIdx(new Date(new Date(endDateExcl).getTime() - DAY));
  } else {
    endIdx = curIdx; // ochiq davr → joriy oygacha
  }
  endIdx = Math.min(endIdx, curIdx); // kelajak oylar yo'q
  if (startIdx > endIdx) return [];
  const months = [];
  for (let idx = startIdx; idx <= endIdx; idx += 1) {
    months.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }
  return months;
};

// Oraliqdagi har bir oy uchun maosh planini YARATADI (yo'q bo'lsa) va qayta
// hisoblaydi. Yangi davr qo'shilganda o'sha oy uchun plan darhol paydo bo'ladi.
const recomputeForRange = async (teacher, group, startDate, endDate) => {
  const teacherSalaryService = await import(
    "../../teacherSalary/services/teacherSalary.service.js"
  );
  for (const { year, month } of monthsSpanned(startDate, endDate)) {
    const sal = await teacherSalaryService.ensureSalaryForTeacherGroup(
      teacher,
      group,
      year,
      month,
    );
    if (sal) await teacherSalaryService.recalc(sal.id || sal._id);
  }
};

// --- CRUD (invariant-li) ---

const assertTeacher = async (teacher) => {
  const doc = await prisma.user.findFirst({
    where: { id: String(teacher), role: ROLES.TEACHER, isDeleted: false },
    select: { id: true, firstName: true, lastName: true, hiredAt: true, isActive: true },
  });
  if (!doc) throw new ApiError(400, "O'qituvchi topilmadi");
  return doc;
};

const loadScope = async (teacher, group, excludeId) =>
  prisma.teacherGroupPeriod.findMany({
    where: {
      teacherId: String(teacher),
      groupId: String(group),
      isDeleted: false,
      ...(excludeId ? { id: { not: String(excludeId) } } : {}),
    },
    select: { id: true, startDate: true, endDate: true },
  });

const loadGroup = (group) =>
  prisma.group.findUnique({
    where: { id: String(group) },
    select: GROUP_WITH_SCHEDULE,
  });

// `currentUser` Mongoose davridan `_id` bilan keladi, ko'chirilgan
// chaqiruvchilar esa `id` bilan - ikkalasini ham qabul qilamiz.
const actorId = (u) => u?.id || u?._id || null;

export const create = async (
  {
    teacher,
    group,
    startDate,
    endDate = null,
    salaryType,
    fixedAmount,
    percentRate,
    // STAVKANI MEROS QILISH: true bo'lsa davrga stavka YOZILMAYDI (barcha
    // maydonlar null) va rateResolver o'qituvchining STANDART stavkasiga
    // (TeacherCompensation) tushadi.
    //
    // NEGA ALOHIDA BAYROQ KERAK: normalizeRate() stavka berilmasa ham
    // `salaryType:"fixed", fixedAmount:0` yozadi, rateResolver esa
    // `salaryType != null` ni USTUNLIK deb biladi (hasOwnRate). Ya'ni
    // stavkasiz yaratilgan davr o'qituvchini shu guruhda NOL maoshga
    // qulflab qo'yardi. Guruh boshqa o'qituvchiga topshirilganda aynan shu
    // kerak emas: yangi o'qituvchi O'Z shartnomasi bo'yicha olishi kerak.
    inheritStandardRate = false,
  },
  currentUser,
) => {
  const teacherDoc = await assertTeacher(teacher);
  const grp = await loadGroup(group);
  assertGroupActive(grp);

  // O'ZIGA O'ZI STAVKA QO'YISH TAQIQI - faqat stavka HAQIQATAN
  // yozilayotgan bo'lsa. `inheritStandardRate` da davrga hech qanday
  // summa yozilmaydi (o'qituvchining standart shartnomasi ishlaydi),
  // ya'ni bu yerda taqiqlaydigan narsa yo'q - aks holda guruhni boshqa
  // o'qituvchiga topshirish kabi oddiy amal ham to'silib qolardi.
  if (!inheritStandardRate) {
    assertNotSelfSalary(currentUser, teacher);
  }

  const candidate = {
    startDate: toUtcMidnight(startDate),
    endDate: endDate ? toUtcMidnight(endDate) : null,
  };
  const existing = await loadScope(teacher, group);
  assertPeriodInvariants(candidate, existing, "date");
  assertWithinGroupBounds(candidate, grp);
  // Davr o'qituvchi ishga olingan sanadan OLDIN boshlanmasin (mas. guruh o'qituvchi
  // ishga qabul qilinishidan avval boshlangan bo'lsa - uni biriktirib bo'lmaydi).
  if (teacherDoc.hiredAt) {
    const hire = toUtcMidnight(teacherDoc.hiredAt).getTime();
    if (candidate.startDate.getTime() < hire) {
      throw new ApiError(
        400,
        `Dars davri o'qituvchining ishga olingan sanasidan (${fmtDate(hire)}) oldin boshlanishi mumkin emas`,
      );
    }
  }
  // O'qituvchining boshqa guruhdagi darsi bilan bir vaqtga tushmasin.
  await assertTeacherScheduleFree(teacher, grp.schedule, group);

  const doc = await prisma.teacherGroupPeriod.create({
    data: {
      teacherId: String(teacher),
      groupId: String(group),
      startDate: candidate.startDate,
      endDate: candidate.endDate,
      ...(inheritStandardRate
        ? { salaryType: null, fixedAmount: null, percentRate: null }
        : normalizeRate(salaryType, fixedAmount, percentRate)),
      createdById: actorId(currentUser),
      updatedById: actorId(currentUser),
    },
  });
  await syncGroupTeachersCache(group);
  await recomputeForRange(teacher, group, candidate.startDate, candidate.endDate);
  return withLegacyId(doc);
};

export const update = async (id, patch, currentUser) => {
  const doc = await prisma.teacherGroupPeriod.findUnique({ where: { id: String(id) } });
  if (!doc || doc.isDeleted) throw new ApiError(404, "Dars berish davri topilmadi");
  const grp = await loadGroup(doc.groupId);
  assertGroupActive(grp);

  // O'ZIGA O'ZI STAVKA QO'YISH TAQIQI - faqat patch STAVKAGA tegsa.
  // Sanani surish yoki davrni yopish stavkani o'zgartirmaydi, ya'ni
  // o'qituvchi o'z davrining sanasini tuzata olishi kerak.
  const touchesRate =
    patch.salaryType !== undefined ||
    patch.fixedAmount !== undefined ||
    patch.percentRate !== undefined;
  if (touchesRate) {
    assertNotSelfSalary(currentUser, doc.teacherId);
  }

  const next = {
    startDate: patch.startDate ? toUtcMidnight(patch.startDate) : doc.startDate,
    endDate:
      patch.endDate === undefined
        ? doc.endDate
        : patch.endDate
          ? toUtcMidnight(patch.endDate)
          : null,
  };
  const existing = await loadScope(doc.teacherId, doc.groupId, doc.id);
  assertPeriodInvariants(next, existing, "date");
  assertWithinGroupBounds(next, grp);

  const oldStart = doc.startDate;
  const oldEnd = doc.endDate;

  const data = {
    startDate: next.startDate,
    endDate: next.endDate,
    updatedById: actorId(currentUser),
  };
  // Maosh stavkasi - berilgan bo'lsa yangilanadi.
  if (patch.salaryType !== undefined) {
    Object.assign(data, normalizeRate(patch.salaryType, patch.fixedAmount, patch.percentRate));
  }

  const saved = await prisma.teacherGroupPeriod.update({
    where: { id: doc.id },
    data,
  });

  await syncGroupTeachersCache(doc.groupId);
  await recomputeForRange(doc.teacherId, doc.groupId, oldStart, oldEnd);
  await recomputeForRange(doc.teacherId, doc.groupId, next.startDate, next.endDate);
  return withLegacyId(saved);
};

// ─────────────────────────────────────────────────────────────────────────
// OMMAVIY TOPSHIRISH (ishdan bo'shatish oqimi)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Ketayotgan o'qituvchining guruhlarini BIR AMALDA bir nechta o'qituvchiga
 * taqsimlaydi: "5 ta guruh Aziza'ga, 3 tasi Bekzod'ga, 20-avgustdan".
 *
 * MAOSH O'ZI TO'G'RI BO'LINADI - bu yerda hech qanday pul hisoblanmaydi.
 * Eski davr `endDate = topshirish sanasi` (EKSKLYUZIV) bilan yopiladi, yangisi
 * o'sha sanadan ochiladi. salaryCompute har davrni oy ichidagi KUNLARIGA
 * proratsiya qilib qo'shgani uchun 20 kun ishlagan eski o'qituvchi 20 kunlik,
 * qolgan 10 kunni olgan yangisi 10 kunlik haq oladi. `claimedUntil` kursori
 * bir kunni ikki marta to'lashga yo'l qo'ymaydi.
 *
 * BARCHA TEKSHIRUVLAR YOZISHDAN OLDIN. Sabab avvalgidek: create/update har
 * biri o'z ichida maosh qayta hisobini yuritadi va ular bitta tranzaksiyaga
 * o'ralmagan. Yarim bajarilgan topshirish esa eng yomon holat bo'lardi -
 * guruh o'qituvchisiz qolib ketardi. Shuning uchun avval hammasi quruq
 * tekshiriladi, keyingina yoziladi.
 */
export const handover = async (
  { teacher, handoverDate, assignments = [] },
  currentUser,
) => {
  const outgoing = await assertTeacher(teacher);
  const cutoff = toUtcMidnight(handoverDate);
  if (Number.isNaN(cutoff.getTime())) {
    throw new ApiError(400, "Topshirish sanasi noto'g'ri");
  }

  // ── 1. Topshirish sanasida hali AMALDA bo'lgan davrlar ──
  // Sanadan oldin yopilgan davrda topshiradigan narsa yo'q.
  const cutTs = cutoff.getTime();
  const allPeriods = await prisma.teacherGroupPeriod.findMany({
    where: { teacherId: outgoing.id, isDeleted: false },
    select: { id: true, groupId: true, startDate: true, endDate: true },
  });
  const live = allPeriods.filter(
    (p) => !p.endDate || new Date(p.endDate).getTime() > cutTs,
  );

  if (!live.length) {
    throw new ApiError(
      400,
      "Bu o'qituvchida topshirish sanasida amaldagi guruh yo'q - topshiradigan narsa yo'q.",
    );
  }

  // Kelajakda boshlanadigan davrni "yopib" bo'lmaydi (tugash sanasi
  // boshlanishidan oldin bo'lib qolardi). Bunday davr butunlay ortiqcha -
  // uni o'chirish kerak, topshirish emas.
  const notStarted = live.filter(
    (p) => new Date(p.startDate).getTime() >= cutTs,
  );
  if (notStarted.length) {
    const names = await prisma.group.findMany({
      where: { id: { in: notStarted.map((p) => p.groupId) } },
      select: { name: true },
    });
    throw new ApiError(
      400,
      `Quyidagi guruhlarda dars davri topshirish sanasidan keyin boshlanadi ` +
        `(${names.map((g) => g.name).join(", ")}). Avval o'sha davrlarni o'chiring.`,
    );
  }

  const liveGroupIds = [...new Set(live.map((p) => String(p.groupId)))];
  const groups = await prisma.group.findMany({
    where: { id: { in: liveGroupIds }, isDeleted: false },
    select: GROUP_WITH_SCHEDULE,
  });
  const groupById = new Map(groups.map((g) => [String(g.id), g]));

  // ── 2. Taqsimotni tekshirish ──
  const targetByGroup = new Map(); // groupId -> assignment
  for (const a of assignments) {
    if (!a?.toTeacher) throw new ApiError(400, "Qabul qiluvchi o'qituvchi ko'rsatilmagan");
    if (String(a.toTeacher) === String(outgoing.id)) {
      throw new ApiError(400, "Guruhni o'qituvchining o'ziga topshirib bo'lmaydi");
    }
    for (const g of a.groups || []) {
      const key = String(g);
      if (!groupById.has(key)) {
        throw new ApiError(
          400,
          "Ro'yxatdagi guruhlardan biri bu o'qituvchining topshirish sanasidagi guruhi emas",
        );
      }
      if (targetByGroup.has(key)) {
        const g1 = groupById.get(key);
        throw new ApiError(
          400,
          `"${g1.name}" guruhi bir necha o'qituvchiga berilgan - har guruh bitta qabul qiluvchiga tegishli bo'lishi kerak`,
        );
      }
      targetByGroup.set(key, a);
    }
  }

  // Qabul qiluvchilar haqiqiy va faol o'qituvchi bo'lsin.
  const targetIds = [...new Set([...targetByGroup.values()].map((a) => String(a.toTeacher)))];
  const targets = await prisma.user.findMany({
    where: { id: { in: targetIds }, role: ROLES.TEACHER, isDeleted: false },
    select: { id: true, firstName: true, lastName: true, isActive: true },
  });
  const targetById = new Map(targets.map((t) => [String(t.id), t]));
  for (const id of targetIds) {
    const t = targetById.get(id);
    if (!t) throw new ApiError(400, "Qabul qiluvchi o'qituvchi topilmadi");
    if (t.isActive === false) {
      throw new ApiError(
        400,
        `${t.firstName} ${t.lastName} arxivlangan - unga guruh berib bo'lmaydi`,
      );
    }
  }

  // ── 3. ENG MUHIM QOIDA: guruh o'qituvchisiz qolmasin ──
  // Taqsimotga kirmagan guruhda BOSHQA o'qituvchi qolyaptimi?
  const orphans = [];
  for (const gid of liveGroupIds) {
    if (targetByGroup.has(gid)) continue;
    const grp = groupById.get(gid);
    if (!grp || grp.isActive === false) continue; // arxiv guruh - muhim emas
    // eslint-disable-next-line no-await-in-loop
    const activeIds = await activeTeacherIdsForGroup(gid, cutoff);
    const others = activeIds.filter((id) => String(id) !== String(outgoing.id));
    if (!others.length) orphans.push(grp.name);
  }
  if (orphans.length) {
    throw new ApiError(
      400,
      `Quyidagi guruhlar o'qituvchisiz qolib ketadi: ${orphans.join(", ")}. ` +
        `Ularni ham boshqa o'qituvchiga taqsimlang.`,
    );
  }

  // ── 4. Yozishdan OLDIN quruq tekshiruv (yarim topshirish bo'lmasin) ──
  for (const [gid, a] of targetByGroup) {
    const grp = groupById.get(gid);
    const candidate = { startDate: cutoff, endDate: null };
    assertWithinGroupBounds(candidate, grp);
    // Qabul qiluvchining shu guruhdagi mavjud davrlari bilan kesishmasin.
    // eslint-disable-next-line no-await-in-loop
    const existing = await loadScope(a.toTeacher, gid);
    assertPeriodInvariants(candidate, existing, "date");
    // Va boshqa guruhdagi darsi bilan jadval to'qnashuvi bo'lmasin.
    // eslint-disable-next-line no-await-in-loop
    await assertTeacherScheduleFree(a.toTeacher, grp.schedule, gid);
  }

  // ── 5. Yozish: eski davrni yopish, yangisini ochish ──
  const closed = [];
  const opened = [];
  for (const p of live) {
    const gid = String(p.groupId);
    // Ochiq bo'lmagan, lekin cutoff'dan keyin tugaydigan davr ham cutoff'ga
    // qisqartiriladi - o'qituvchi o'sha kundan keyin dars bermaydi.
    // eslint-disable-next-line no-await-in-loop
    await update(p.id, { endDate: cutoff }, currentUser);
    closed.push({ group: gid, period: p.id });
  }
  for (const [gid, a] of targetByGroup) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await create(
      {
        teacher: a.toTeacher,
        group: gid,
        startDate: cutoff,
        endDate: null,
        // Stavka berilmasa - qabul qiluvchining O'Z standart shartnomasi.
        ...(a.salaryType
          ? {
              salaryType: a.salaryType,
              fixedAmount: a.fixedAmount,
              percentRate: a.percentRate,
            }
          : { inheritStandardRate: true }),
      },
      currentUser,
    );
    opened.push({ group: gid, teacher: String(a.toTeacher), period: doc.id });
  }

  return {
    teacher: String(outgoing.id),
    handoverDate: cutoff,
    closed: closed.length,
    opened: opened.length,
    groups: liveGroupIds.length,
    details: { closed, opened },
  };
};

export const remove = async (id) => {
  const doc = await prisma.teacherGroupPeriod.findUnique({ where: { id: String(id) } });
  if (!doc || doc.isDeleted) throw new ApiError(404, "Dars berish davri topilmadi");
  assertGroupActive(await loadGroup(doc.groupId));

  // To'lov qo'riqlovchisi: davr qamragan oylarda maosh to'lovi (tranzaktsiya)
  // bo'lsa - o'chirib bo'lmaydi (avval to'lovlar o'chirilishi kerak).
  const months = monthsSpanned(doc.startDate, doc.endDate);
  if (months.length) {
    // Mongo `$or: [{year,month},...]` → Prisma `OR: [...]` (shakl bir xil).
    const paid = await prisma.salaryTransaction.findFirst({
      where: {
        teacherId: doc.teacherId,
        groupId: doc.groupId,
        isDeleted: false,
        OR: months,
      },
      select: { id: true },
    });
    if (paid) {
      throw new ApiError(
        400,
        "Bu davrga oid maosh to'lovi mavjud. Avval to'lovlarni o'chiring.",
      );
    }
  }

  // Mongoose plagini bergan `softDelete()` o'rniga ochiq yangilanish.
  await prisma.teacherGroupPeriod.update({
    where: { id: doc.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await syncGroupTeachersCache(doc.groupId);
  await recomputeForRange(doc.teacherId, doc.groupId, doc.startDate, doc.endDate);
  return { id: doc.id, _id: doc.id };
};

// --- MAOSH STAVKASI TASDIG'I (owner tasdig'i talab qilinganda) ---
//
// Maosh stavkasi TAKRORLANUVCHI xarajat: bir marta belgilangan foiz har oy
// qayta-qayta hisoblanadi. Shuning uchun u chiqim limitiga emas, IKKILIK
// huquqqa bog'lanadi (approvals.decide_config) - qarang checkConfigApproval.
//
// TASDIQLANMAGUNCHA TeacherGroupPeriod YARATILMAYDI. Bu ataylab: davr yozuvi
// mavjud bo'lishining o'zi maosh hisobiga (periodsForMonth -> recalc) darhol
// kirib ketardi, ya'ni tasdiqlanmagan stavka to'lanadigan summaga aylanardi.
// So'rov ma'lumoti faqat Approval.payload ichida yashaydi.

// Subyekt qulfi kaliti: bitta o'qituvchining bitta guruhdagi stavkasi uchun
// bir vaqtda faqat BITTA kutilayotgan so'rov bo'lsin. "create" va "update"
// bir xil kalitni beradi - aks holda bir direktor yangi davr, ikkinchisi
// mavjud davrni o'zgartirishni so'rab, ikkalasi ham tasdiqlanardi.
const salaryTermsSubjectKey = (group, teacher) =>
  `salary_terms:${String(group)}:${String(teacher)}`;

/**
 * Maosh stavkasi o'zgarishini TASDIQQA yuboradi (yozuv yaratmaydi).
 *
 * Bu yerda faqat YENGIL tekshiruv bor (guruh/o'qituvchi bor-yo'qligi) - to'liq
 * invariantlar (davrlar kesishuvi, jadval to'qnashuvi, guruh chegaralari)
 * ATAYLAB tasdiqlash paytida qayta tekshiriladi, chunki so'rov va tasdiq
 * orasida holat o'zgarishi mumkin.
 */
export const requestSalaryTerms = async ({ op, group, periodId, body }, currentUser) => {
  const approvalService = await import(
    "../../expenseApprovals/services/expenseApproval.service.js"
  );

  let teacher;
  let groupId = group;
  if (op === "update") {
    const period = await prisma.teacherGroupPeriod.findUnique({
      where: { id: String(periodId) },
      select: { teacherId: true, groupId: true, isDeleted: true },
    });
    if (!period || period.isDeleted) throw new ApiError(404, "Dars berish davri topilmadi");
    teacher = period.teacherId;
    groupId = period.groupId;
  } else {
    teacher = body.teacher;
  }

  const grp = await loadGroup(groupId);
  assertGroupActive(grp);
  const teacherDoc = await assertTeacher(teacher);

  // O'ZIGA O'ZI STAVKA: so'rov ham YARATILMAYDI. Tasdiqlash bosqichida
  // approve() o'zini-o'zi tasdiqlashni to'sardi, lekin so'rov owner
  // navbatiga tushib, u e'tiborsiz tasdiqlab yuborishi mumkin edi.
  assertNotSelfSalary(currentUser, teacher);

  const branchId = await resolveBranchFromGroup(groupId);

  return approvalService.createRequest({
    branchId,
    kind: APPROVAL_KINDS.SALARY_TERMS,
    payload: {
      op,
      group: String(groupId),
      teacher: String(teacher),
      periodId: periodId ? String(periodId) : undefined,
      startDate: body.startDate,
      endDate: body.endDate,
      salaryType: body.salaryType,
      fixedAmount: body.fixedAmount,
      percentRate: body.percentRate,
    },
    subjectKey: salaryTermsSubjectKey(groupId, teacher),
    subjectName: [teacherDoc.firstName, teacherDoc.lastName].filter(Boolean).join(" "),
    contextName: grp?.name || "",
    requestNote: body.requestNote,
    currentUser,
  });
};

/**
 * Tasdiqlangan maosh stavkasi so'rovini BAJARADI.
 *
 * create/update ning O'ZINI chaqiradi - ya'ni barcha invariantlar (davr
 * kesishuvi, guruh oynasi, ishga olingan sana, jadval to'qnashuvi) shu yerda
 * QAYTA ishlaydi. Ular yiqilsa approve() so'rovni FAILED qiladi va owner
 * sababni ko'radi.
 *
 * CRON POYGASI shu yerda yopiladi: create/update ichidagi recomputeForRange
 * o'sha oy uchun maosh planini ENSURE qilib qayta hisoblaydi. Ya'ni oylik job
 * 1-sanada eski stavka bilan qator yaratgan bo'lsa ham, 20-sanadagi tasdiq
 * o'sha MAVJUD qatorni yangilaydi - kelajak oyga surilmaydi.
 */
export const executeApprovedSalaryTerms = async (approval) => {
  const p = approval?.payload || {};
  // Amalni so'ragan odam nomidan bajariladi (createdBy/updatedBy tarixda
  // tasdiqlovchi emas, so'rovchi bo'lib qolsin).
  // Approval moduli hali ko'chirilmagan - `requestedById`/`requestedBy`
  // ikkalasi ham bo'lishi mumkin.
  const requesterId = approval?.requestedById || approval?.requestedBy || null;
  const actor = { id: requesterId, _id: requesterId };

  const rate = {
    salaryType: p.salaryType,
    fixedAmount: p.fixedAmount,
    percentRate: p.percentRate,
  };

  if (p.op === "create") {
    return create(
      {
        teacher: p.teacher,
        group: p.group,
        startDate: p.startDate,
        endDate: p.endDate ?? null,
        ...rate,
      },
      actor,
    );
  }

  if (p.op === "update") {
    if (!p.periodId) throw new ApiError(400, "So'rovda davr identifikatori yo'q");
    return update(
      p.periodId,
      { startDate: p.startDate, endDate: p.endDate, ...rate },
      actor,
    );
  }

  throw new ApiError(400, `Noma'lum maosh sharti amali: ${p.op}`);
};

// --- ERGONOMIK ASSIGN / UNASSIGN ---

// O'qituvchini guruhga biriktiradi (ochiq davr ochadi). startDate default bugun.
export const assignTeacher = async (group, teacher, { startDate } = {}, currentUser) => {
  const open = await prisma.teacherGroupPeriod.findFirst({
    where: {
      teacherId: String(teacher),
      groupId: String(group),
      endDate: null,
      isDeleted: false,
    },
  });
  if (open) return withLegacyId(open); // allaqachon aktiv

  const grp = await prisma.group.findUnique({
    where: { id: String(group) },
    select: { startDate: true },
  });
  const start = startDate
    ? toUtcMidnight(startDate)
    : grp?.startDate
      ? toUtcMidnight(grp.startDate)
      : localTodayMidnight();
  return create({ group, teacher, startDate: start }, currentUser);
};

// Arxivdan chiqarishda: arxiv yopgan davrni qayta ochadi (endDate=null), agar shu
// scope'da boshqa ochiq davr bo'lmasa (single-open invariant). Maoshni qayta hisoblaydi.
export const reopenPeriod = async (id, currentUser) => {
  const doc = await prisma.teacherGroupPeriod.findUnique({ where: { id: String(id) } });
  if (!doc || doc.isDeleted || doc.endDate === null) {
    return doc ? withLegacyId(doc) : null;
  }
  const open = await prisma.teacherGroupPeriod.findFirst({
    where: {
      teacherId: doc.teacherId,
      groupId: doc.groupId,
      endDate: null,
      isDeleted: false,
    },
    select: { id: true },
  });
  if (open) return withLegacyId(doc); // boshqa ochiq davr bor - invariant buzilmasin

  const saved = await prisma.teacherGroupPeriod.update({
    where: { id: doc.id },
    data: { endDate: null, updatedById: actorId(currentUser) },
  });
  await syncGroupTeachersCache(doc.groupId);
  await recomputeForRange(doc.teacherId, doc.groupId, doc.startDate, null);
  return withLegacyId(saved);
};

// O'qituvchini guruhdan chiqaradi (ochiq davrni endDate da yopadi). EXCLUSIVE.
export const unassignTeacher = async (group, teacher, { endDate } = {}, currentUser) => {
  const open = await prisma.teacherGroupPeriod.findFirst({
    where: {
      teacherId: String(teacher),
      groupId: String(group),
      endDate: null,
      isDeleted: false,
    },
  });
  if (!open) return null;

  const end = endDate ? toUtcMidnight(endDate) : localTodayMidnight();
  const saved = await prisma.teacherGroupPeriod.update({
    where: { id: open.id },
    data: { endDate: end, updatedById: actorId(currentUser) },
  });
  await syncGroupTeachersCache(group);
  await recomputeForRange(teacher, group, open.startDate, end);
  logger.info({ teacher, group }, "O'qituvchi guruhdan chiqarildi (davr yopildi)");
  return withLegacyId(saved);
};
