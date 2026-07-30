import mongoose from "mongoose";
import Insight from "../../../models/insight.model.js";
import ApiError from "../../../utils/ApiError.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";

// O'QISH qatlami. Barcha so'rovlar branchFilter() bilan boshlanadi -
// Insight'da branchId bevosita bor, shuning uchun oddiy filtr yetarli
// (guruh orqali bog'lash kerak emas).

const OPEN_STATUSES = ["open", "acked"];

/** Insight ro'yxati (Action Center va modul panellari uchun). */
export const list = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);

  const filter = { ...branchFilter() };
  if (query.status) filter.status = query.status;
  else filter.status = { $in: OPEN_STATUSES };
  if (query.kind) filter.kind = query.kind;
  if (query.subjectType) filter.subjectType = query.subjectType;
  if (query.severity) filter.severity = query.severity;
  if (query.subjectId) {
    filter.subjectId = new mongoose.Types.ObjectId(String(query.subjectId));
  }

  const [items, total] = await Promise.all([
    Insight.find(filter).sort({ priority: -1, generatedAt: -1 }).skip(skip).limit(limit).lean(),
    Insight.countDocuments(filter),
  ]);

  return { items, meta: buildMeta({ page, limit, total }) };
};

/**
 * ACTION CENTER - ertalabki prioritetli vazifalar ro'yxati.
 *
 * Uch guruhga bo'linadi, chunki owner "nima qilishim kerak" va "nimani
 * bilishim kerak" ni ajratishi kerak. Aralashtirilgan ro'yxat o'qilmaydi.
 */
export const actionCenter = async (query = {}) => {
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const filter = { ...branchFilter(), status: { $in: OPEN_STATUSES } };

  const items = await Insight.find(filter)
    .sort({ priority: -1, generatedAt: -1 })
    .limit(limit * 3)
    .lean();

  const high = [];
  const medium = [];
  const opportunities = [];
  for (const it of items) {
    // Imkoniyatlar - muammo emas, o'sish taklifi. Ular xavf bilan bir
    // ro'yxatda turmasligi kerak, aks holda owner ularni "yana bir
    // muammo" deb o'qiydi.
    if (it.kind === "course_opportunity") opportunities.push(it);
    else if (it.severity === "high") high.push(it);
    else medium.push(it);
  }

  const totals = await Insight.aggregate([
    { $match: filter },
    { $group: { _id: "$severity", count: { $sum: 1 }, impact: { $sum: "$expectedImpact.amount" } } },
  ]);

  return {
    high: high.slice(0, limit),
    medium: medium.slice(0, limit),
    opportunities: opportunities.slice(0, limit),
    summary: {
      high: totals.find((t) => t._id === "high")?.count || 0,
      medium: totals.find((t) => t._id === "medium")?.count || 0,
      low: totals.find((t) => t._id === "low")?.count || 0,
      impactAtRisk: totals.reduce((a, t) => a + (t.impact || 0), 0),
    },
  };
};

/**
 * Bitta subyektning ochiq insight'lari (modul ichidagi badge/panel uchun).
 * Ro'yxat sahifasida N ta o'quvchi uchun N ta so'rov qilmaslik kerak -
 * shuning uchun subjectIds massiv qabul qiladi.
 */
export const bySubjects = async (subjectIds = []) => {
  if (!subjectIds.length) return {};
  const ids = subjectIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Insight.find({
    ...branchFilter(),
    subjectId: { $in: ids },
    status: { $in: OPEN_STATUSES },
  })
    .select("subjectId kind severity score confidence priority narration")
    .sort({ priority: -1 })
    .lean();

  const out = {};
  for (const r of rows) {
    const key = String(r.subjectId);
    if (!out[key]) out[key] = [];
    out[key].push(r);
  }
  return out;
};

const findScoped = async (id) => {
  const doc = await Insight.findOne({ _id: id, ...branchFilter() });
  if (!doc) throw new ApiError(404, "Insight topilmadi");
  return doc;
};

/** Owner "ko'rdim" deb belgilaydi - qayta hisoblash buni bosib o'tmaydi. */
export const acknowledge = async (id, user) => {
  const doc = await findScoped(id);
  doc.status = "acked";
  doc.acknowledgedBy = user?._id || null;
  doc.acknowledgedAt = new Date();
  await doc.save();
  return doc;
};

/** Vazifa bajarildi. outcome tungi job tomonidan 30 kundan keyin aniqlanadi. */
export const resolve = async (id, user) => {
  const doc = await findScoped(id);
  doc.status = "done";
  doc.resolvedAt = new Date();
  if (!doc.acknowledgedBy) {
    doc.acknowledgedBy = user?._id || null;
    doc.acknowledgedAt = new Date();
  }
  await doc.save();
  return doc;
};

/**
 * "Bu noto'g'ri" - modelni kalibrlash uchun ENG QIMMATLI signal.
 * dismissReason ataylab majburiy: sababsiz rad etish hech narsa
 * o'rgatmaydi va vaznlarni tuzatish imkonini bermaydi.
 */
export const dismiss = async (id, reason, user) => {
  if (!reason || !String(reason).trim()) {
    throw new ApiError(400, "Rad etish sababini yozing");
  }
  const doc = await findScoped(id);
  doc.status = "dismissed";
  doc.dismissReason = String(reason).trim();
  doc.resolvedAt = new Date();
  doc.acknowledgedBy = doc.acknowledgedBy || user?._id || null;
  await doc.save();
  return doc;
};
