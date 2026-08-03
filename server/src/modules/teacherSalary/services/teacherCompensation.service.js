import mongoose from "mongoose";
import TeacherCompensation from "../../../models/teacherCompensation.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import User from "../../../models/user.model.js";
import { APPROVAL_KINDS } from "../../../models/approval.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { toUtcMidnight, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import { resolveBranchForWrite } from "../../../helpers/branchContext.helper.js";
import * as teacherSalaryService from "./teacherSalary.service.js";

// O'QITUVCHINING STANDART MAOSH STAVKASI - servis qatlami.
//
// ASOSIY QOIDA: stavka HECH QACHON joyida tahrirlanmaydi. O'zgarish har doim
// eskisini yopib (effectiveTo) yangisini ochadi. Shu tufayli "martda oshirdik"
// yanvar maoshini qayta yozib yubormaydi - o'tgan oy recalc bo'lsa ham o'sha
// oyda amal qilgan stavkani topadi.

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const assertTeacher = async (teacherId) => {
  const user = await User.findById(toObjectId(teacherId));
  if (!user || user.isDeleted) throw new ApiError(404, "O'qituvchi topilmadi");
  if (user.role !== ROLES.TEACHER) {
    throw new ApiError(400, "Faqat o'qituvchiga maosh stavkasi belgilanadi");
  }
  return user;
};

/** O'qituvchining barcha stavka tarixi (yangisidan eskisiga). */
export const listByTeacher = async (teacherId) => {
  const rows = await TeacherCompensation.find({
    teacher: toObjectId(teacherId),
    isDeleted: { $ne: true },
  })
    .sort({ effectiveFrom: -1 })
    .lean();
  return rows;
};

/** Berilgan sanada (default - bugun) amal qilgan stavka. */
export const getActive = async (teacherId, onDate = null) => {
  const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
  const rows = await TeacherCompensation.find({
    teacher: toObjectId(teacherId),
    isDeleted: { $ne: true },
  })
    .sort({ effectiveFrom: -1 })
    .lean();
  return (
    rows.find((r) => {
      const s = toUtcMidnight(r.effectiveFrom).getTime();
      const e = r.effectiveTo ? toUtcMidnight(r.effectiveTo).getTime() : Infinity;
      return s <= t && t < e;
    }) || null
  );
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
  const from = toUtcMidnight(body.effectiveFrom || localTodayMidnight());

  // Ishga olingan sanadan oldin stavka bo'la olmaydi.
  if (teacher.hiredAt && from.getTime() < toUtcMidnight(teacher.hiredAt).getTime()) {
    throw new ApiError(
      400,
      "Maosh stavkasi ishga olingan sanadan oldin boshlana olmaydi",
    );
  }

  const branchId = await resolveBranchForWrite(currentUser, body.branchId ?? null);

  const open = await TeacherCompensation.findOne({
    teacher: teacher._id,
    effectiveTo: null,
    isDeleted: { $ne: true },
  });

  if (open) {
    const openFrom = toUtcMidnight(open.effectiveFrom).getTime();
    if (from.getTime() <= openFrom) {
      throw new ApiError(
        400,
        "Yangi stavka amaldagi stavkadan keyin boshlanishi kerak. Xato kiritilgan bo'lsa amaldagi stavkani tahrirlang.",
      );
    }
    open.effectiveTo = from;
    open.updatedBy = currentUser?._id || null;
    await open.save();
  }

  const created = await TeacherCompensation.create({
    teacher: teacher._id,
    branchId,
    effectiveFrom: from,
    effectiveTo: null,
    baseType: body.baseType || "none",
    baseAmount: Number(body.baseAmount) || 0,
    variableType: body.variableType || "none",
    variableRate: Number(body.variableRate) || 0,
    percentBase: body.percentBase || "billed",
    note: body.note || "",
    createdBy: currentUser?._id || null,
  });

  // Natijaga qayta hisob xulosasini biriktiramiz - UI "3 oy yangilandi,
  // 2 oy to'langani uchun o'zgarmadi" deb ko'rsatadi.
  const recompute = await recomputeFrom(teacher._id, from);
  const result = created.toObject();
  result.recompute = recompute;
  return result;
};

/**
 * Amaldagi (ochiq) stavkani TUZATADI - yangi davr ochmaydi.
 * Faqat XATO KIRITISH uchun ("nolni ko'p yozdim"). Haqiqiy oshirish
 * setCompensation orqali bo'lishi kerak, aks holda tarix yo'qoladi.
 */
export const amendCompensation = async (id, patch, currentUser) => {
  const doc = await TeacherCompensation.findById(toObjectId(id));
  if (!doc || doc.isDeleted) throw new ApiError(404, "Maosh stavkasi topilmadi");

  const before = toUtcMidnight(doc.effectiveFrom);
  if (patch.effectiveFrom !== undefined) doc.effectiveFrom = toUtcMidnight(patch.effectiveFrom);
  if (patch.baseType !== undefined) doc.baseType = patch.baseType;
  if (patch.baseAmount !== undefined) doc.baseAmount = Number(patch.baseAmount) || 0;
  if (patch.variableType !== undefined) doc.variableType = patch.variableType;
  if (patch.variableRate !== undefined) doc.variableRate = Number(patch.variableRate) || 0;
  if (patch.percentBase !== undefined) doc.percentBase = patch.percentBase;
  if (patch.branchId !== undefined) doc.branchId = patch.branchId || null;
  if (patch.note !== undefined) doc.note = patch.note;
  doc.updatedBy = currentUser?._id || null;
  await doc.save();

  // Sana orqaga surilgan bo'lsa - eskiroq nuqtadan qayta hisoblaymiz.
  const from = new Date(Math.min(before.getTime(), toUtcMidnight(doc.effectiveFrom).getTime()));
  await recomputeFrom(doc.teacher, from);
  return doc;
};

/**
 * Stavkani o'chiradi (soft). Eng oxirgi (ochiq) stavkani o'chirsa - undan
 * oldingisi qayta ochiladi, aks holda "stavkasiz teshik" qolardi.
 */
export const removeCompensation = async (id, currentUser) => {
  const doc = await TeacherCompensation.findById(toObjectId(id));
  if (!doc || doc.isDeleted) throw new ApiError(404, "Maosh stavkasi topilmadi");

  const from = toUtcMidnight(doc.effectiveFrom);
  await doc.softDelete(currentUser?._id);

  const prev = await TeacherCompensation.findOne({
    teacher: doc.teacher,
    isDeleted: { $ne: true },
    effectiveTo: from,
  });
  if (prev) {
    prev.effectiveTo = doc.effectiveTo || null;
    prev.updatedBy = currentUser?._id || null;
    await prev.save();
  }

  await recomputeFrom(doc.teacher, from);
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
      const rows = await TeacherSalary.find(
        { teacher: teacherId, year, month },
        { _id: 1, kind: 1, status: 1, paidAmount: 1 },
      ).lean();

      for (const r of rows) {
        if (r.status === "paid" && r.paidAmount > 0) lockedRows += 1;
      }

      await teacherSalaryService.recalcBaseForTeacherMonth(teacherId, year, month);
      for (const r of rows) {
        if (r.kind !== "group") continue;
        await teacherSalaryService.recalc(r._id);
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
 * Stavka o'zgarishini TASDIQQA yuboradi (hujjat yaratmaydi).
 * To'liq tekshiruvlar ATAYLAB bajarish paytida qayta ishlaydi - so'rov va
 * tasdiq orasida holat o'zgargan bo'lishi mumkin.
 */
export const requestSet = async (body, currentUser) => {
  const approvalService = await import(
    "../../expenseApprovals/services/expenseApproval.service.js"
  );
  const teacher = await assertTeacher(body.teacher);
  const branchId = await resolveBranchForWrite(currentUser, body.branchId ?? null);

  return approvalService.createRequest({
    branchId,
    kind: APPROVAL_KINDS.TEACHER_COMPENSATION_SET,
    payload: {
      op: body.op || "set",
      compensationId: body.compensationId ? String(body.compensationId) : undefined,
      teacher: String(teacher._id),
      branchId: branchId ? String(branchId) : null,
      effectiveFrom: body.effectiveFrom,
      baseType: body.baseType,
      baseAmount: body.baseAmount,
      variableType: body.variableType,
      variableRate: body.variableRate,
      percentBase: body.percentBase,
      note: body.note,
    },
    subjectKey: subjectKeyFor(teacher._id),
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
  const actor = { _id: approval?.requestedBy || null };

  if (p.op === "amend") {
    if (!p.compensationId) throw new ApiError(400, "So'rovda stavka identifikatori yo'q");
    return amendCompensation(p.compensationId, p, actor);
  }
  return setCompensation(p, actor);
};
