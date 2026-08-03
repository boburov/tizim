import mongoose from "mongoose";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  resolveBranchForWrite,
  resolveBranchFromGroup,
} from "../../../helpers/branchContext.helper.js";
import { deriveStatus } from "./salaryCompute.helper.js";

// KPI MUKOFOTI VA JARIMA (kind: "bonus" | "deduction").
//
// NEGA ALOHIDA QATOR (guruh maoshiga qo'shilmaydi):
//  1. KPI markaz darajasidagi qaror - u bitta guruhga tegishli emas
//     ("o'quvchilari eng tez o'sadi" 5 ta guruhning yig'indisi).
//  2. Guruh qatori HAR KECHA davrlardan qayta hisoblanadi (recalc). Mukofot
//     o'sha qatorga yozilsa tungi job uni nolga tushirib yuborardi - aynan
//     shuning uchun recalc() kind !== "group" bo'lsa darhol qaytadi.
//  3. Hisobotda "asosiy maosh" va "mukofot" ajratilgan bo'lishi kerak.
//
// Mukofot ODATDAGI maosh qatori kabi ishlaydi: unga SalaryTransaction bilan
// to'lov qilinadi, tasdiq limiti va barcha hisobotlar avtomatik qo'llanadi.

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const assertTeacher = async (teacherId) => {
  const user = await User.findById(toObjectId(teacherId));
  if (!user || user.isDeleted) throw new ApiError(404, "O'qituvchi topilmadi");
  if (user.role !== ROLES.TEACHER) {
    throw new ApiError(400, "Faqat o'qituvchiga mukofot/jarima belgilanadi");
  }
  return user;
};

/**
 * Mukofot yoki jarima qatori yaratadi.
 *
 * amount HAR DOIM musbat kiritiladi; jarima (deduction) da expectedAmount
 * MANFIY qilib saqlanadi - shunda oylik yig'indi oddiy SUM() bilan to'g'ri
 * chiqadi va hisobotlarda maxsus holat kerak bo'lmaydi.
 */
export const create = async (body, currentUser) => {
  const kind = body.kind === "deduction" ? "deduction" : "bonus";
  const teacher = await assertTeacher(body.teacher);
  const amount = Math.round(Number(body.amount) || 0);
  if (amount <= 0) throw new ApiError(400, "Summa noldan katta bo'lishi kerak");

  const year = Number(body.year);
  const month = Number(body.month);
  if (!year || !month || month < 1 || month > 12) {
    throw new ApiError(400, "Yil va oy to'g'ri ko'rsatilishi kerak");
  }

  if (!body.reason || !String(body.reason).trim()) {
    // Sababsiz mukofot audit uchun yaroqsiz - keyin "bu nima edi?" degan
    // savolga javob bo'lmaydi.
    throw new ApiError(400, "Sabab ko'rsatilishi shart");
  }

  // Guruh ixtiyoriy: KPI aniq bir guruh uchun bo'lsa bog'lanadi.
  let group = null;
  let branchId = null;
  if (body.group) {
    const grp = await Group.findById(toObjectId(body.group), { _id: 1 }).lean();
    if (!grp) throw new ApiError(404, "Guruh topilmadi");
    group = grp._id;
    branchId = await resolveBranchFromGroup(group);
  } else {
    branchId =
      (await resolveBranchForWrite(currentUser, body.branchId ?? null)) ||
      teacher.homeBranchId ||
      null;
  }
  if (!branchId) throw new ApiError(400, "Filial aniqlanmadi");

  const expected = kind === "deduction" ? -amount : amount;

  const doc = await TeacherSalary.create({
    branchId,
    teacher: teacher._id,
    group,
    kind,
    year,
    month,
    expectedAmount: expected,
    baseEarnings: expected,
    prorationFactor: 1,
    payableDays: 0,
    totalDays: 0,
    status: deriveStatus(0, expected),
    source: "manual",
    reason: String(body.reason).trim(),
    approvalId: body.approvalId || null,
    createdBy: currentUser?._id || null,
  });
  return doc;
};

/**
 * Mukofot/jarimani o'chiradi.
 * TO'LANGAN qatorni o'chirish MUMKIN EMAS - avval to'lov bekor qilinishi kerak,
 * aks holda SalaryTransaction yetim qolib chiqim hisoboti buzilardi.
 */
export const remove = async (id, currentUser) => {
  const doc = await TeacherSalary.findById(toObjectId(id));
  if (!doc) throw new ApiError(404, "Yozuv topilmadi");
  if (doc.kind !== "bonus" && doc.kind !== "deduction") {
    throw new ApiError(400, "Faqat mukofot yoki jarima o'chiriladi");
  }
  if (doc.paidAmount > 0) {
    throw new ApiError(
      400,
      "Bu yozuv bo'yicha to'lov qilingan. Avval to'lovni bekor qiling.",
    );
  }
  await TeacherSalary.deleteOne({ _id: doc._id });
  return { ok: true, deletedBy: currentUser?._id || null };
};

/** O'qituvchining bir oydagi mukofot/jarimalari. */
export const listByTeacherMonth = async (teacherId, year, month) =>
  TeacherSalary.find({
    teacher: toObjectId(teacherId),
    year: Number(year),
    month: Number(month),
    kind: { $in: ["bonus", "deduction"] },
  })
    .sort({ createdAt: -1 })
    .lean();
