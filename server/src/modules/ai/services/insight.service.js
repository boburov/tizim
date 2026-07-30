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
  // Domen bo'yicha filtr - modul panellari ("Moliya → AI Insights") shu
  // orqali o'qiydi. Hujjatdagi indekslangan maydon, 20 ta kind'ni sanab
  // o'tish shart emas.
  if (query.domain) filter.domain = query.domain;
  if (query.stance) filter.stance = query.stance;
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
    //
    // AJRATUVCHI - `stance`, `kind` EMAS. Kind bo'yicha tekshirish har
    // safar yangi imkoniyat turi qo'shilganda jimgina buzilardi: turi
    // ro'yxatda yo'q imkoniyat "o'rta ustuvorlikdagi muammo" bo'lib
    // ko'rinardi. stance taksonomiyada bir marta belgilanadi va
    // buildInsight() uni hujjatga yozadi.
    if (it.stance === "opportunity") opportunities.push(it);
    else if (it.severity === "high") high.push(it);
    else medium.push(it);
  }

  const totals = await Insight.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { severity: "$severity", stance: "$stance" },
        count: { $sum: 1 },
        impact: { $sum: "$expectedImpact.amount" },
      },
    },
  ]);

  // Imkoniyatlar xavf sanog'iga QO'SHILMAYDI: "12 ta muammo bor" deb
  // ko'rsatish, holbuki 4 tasi o'sish taklifi, owner'ni behuda
  // vahimaga soladi va sonning o'ziga ishonchni yo'qotadi.
  const summary = { high: 0, medium: 0, low: 0, opportunities: 0, impactAtRisk: 0, upside: 0 };
  for (const t of totals) {
    if (t._id.stance === "opportunity") {
      summary.opportunities += t.count;
      summary.upside += t.impact || 0;
    } else {
      summary[t._id.severity] = (summary[t._id.severity] || 0) + t.count;
      summary.impactAtRisk += t.impact || 0;
    }
  }

  return {
    high: high.slice(0, limit),
    medium: medium.slice(0, limit),
    opportunities: opportunities.slice(0, limit),
    summary,
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

/**
 * MODUL PANELI - "Moliya → AI Insights" bo'limining yagona manbai.
 *
 * NEGA ALOHIDA (list() ga domain filtri qo'shish yetarli emas): panel
 * xavf va imkoniyatni ALOHIDA ro'yxatda ko'rsatishi kerak, va ikkalasini
 * bitta sahifalangan ro'yxatdan olish mumkin emas - prioritet bo'yicha
 * saralanganda imkoniyatlar ikkinchi sahifaga tushib ketardi va modulda
 * hech qachon ko'rinmasdi.
 *
 * Panel KICHIK bo'lishi kerak: modul sahifasi insight ro'yxati emas,
 * uning ustidagi qisqa maslahat. To'liq ro'yxat Action Center'da.
 */
export const byDomain = async (domain, query = {}) => {
  const limit = Math.min(20, Math.max(1, Number(query.limit) || 4));
  const filter = { ...branchFilter(), domain, status: { $in: OPEN_STATUSES } };

  const [risks, opportunities, totals] = await Promise.all([
    Insight.find({ ...filter, stance: { $in: ["risk", "watch"] } })
      .sort({ priority: -1, generatedAt: -1 })
      .limit(limit)
      .lean(),
    Insight.find({ ...filter, stance: "opportunity" })
      .sort({ priority: -1, generatedAt: -1 })
      .limit(limit)
      .lean(),
    Insight.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { severity: "$severity", stance: "$stance" },
          count: { $sum: 1 },
          impact: { $sum: "$expectedImpact.amount" },
        },
      },
    ]),
  ]);

  const summary = { high: 0, medium: 0, low: 0, opportunities: 0, impactAtRisk: 0, upside: 0 };
  for (const t of totals) {
    if (t._id.stance === "opportunity") {
      summary.opportunities += t.count;
      summary.upside += t.impact || 0;
    } else {
      summary[t._id.severity] = (summary[t._id.severity] || 0) + t.count;
      summary.impactAtRisk += t.impact || 0;
    }
  }

  return { domain, risks, opportunities, summary };
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
