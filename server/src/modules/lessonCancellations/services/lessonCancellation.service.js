import mongoose from "mongoose";
import LessonCancellation from "../../../models/lessonCancellation.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { parseLocalDay, dateKeyOf } from "../../../helpers/attendance.helper.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";

// BEKOR QILINGAN DARS - servis qatlami.
//
// Har bir yozuv/o'chirish MOLIYAGA ta'sir qiladi (o'quvchi qarzi va o'qituvchi
// soatbay maoshi dars soniga bog'liq), shuning uchun o'sha oy DARHOL qayta
// hisoblanadi. Tungi job'ni kutish "nega qarz o'zgarmadi?" degan savolni
// tug'dirardi.

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const assertGroup = async (groupId) => {
  const group = await Group.findOne({
    _id: toObjectId(groupId),
    ...branchFilter(),
    isDeleted: { $ne: true },
  }).lean();
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  return group;
};

// Moliya kaskadi: shu oyning to'lovlari va maoshlari qayta hisoblanadi.
// Best-effort - kaskad xatosi yozuvni bekor QILMAYDI (u allaqachon saqlangan
// va to'g'ri; tungi job qolganini tuzatadi).
const recomputeMonth = async (groupId, date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  try {
    await financePaymentService.recalcForGroupMonth(groupId, year, month);
    await teacherSalaryService.recalcForGroupMonth(groupId, year, month);
  } catch (err) {
    logger.warn({ err, groupId, year, month }, "Dars bekor qilingach moliya qayta hisoblanmadi");
  }
};

export const create = async (body, currentUser) => {
  await assertGroup(body.group);
  const date = parseLocalDay(body.date);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");

  try {
    const doc = await LessonCancellation.create({
      group: toObjectId(body.group),
      date,
      dateKey: dateKeyOf(date),
      slot: body.slot || "",
      reason: body.reason || "other",
      note: body.note || "",
      // Ko'chirilgan (makeup) bo'lsa dars baribir o'tiladi -> pul o'zgarmaydi.
      billable: Boolean(body.makeupDate) || Boolean(body.billable),
      makeupDate: body.makeupDate ? parseLocalDay(body.makeupDate) : null,
      createdBy: currentUser?._id || null,
    });
    await recomputeMonth(doc.group, date);
    return doc;
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, "Bu dars allaqachon bekor qilingan deb belgilangan");
    }
    throw err;
  }
};

export const list = async ({ groupId, year, month }) => {
  const filter = { isDeleted: { $ne: true } };
  if (groupId) filter.group = toObjectId(groupId);
  if (year && month) {
    filter.date = {
      $gte: new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
      $lte: new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999)),
    };
  }
  return LessonCancellation.find(filter)
    .populate("group", { name: 1 })
    .populate("createdBy", { firstName: 1, lastName: 1 })
    .sort({ date: -1 })
    .lean();
};

export const remove = async (id, currentUser) => {
  const doc = await LessonCancellation.findOne({
    _id: toObjectId(id),
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Yozuv topilmadi");
  await assertGroup(doc.group);

  await doc.softDelete(currentUser?._id);
  // Bekor qilish olib tashlandi -> dars qaytadi -> qarz va maosh oshadi.
  await recomputeMonth(doc.group, doc.date);
  return { ok: true };
};
