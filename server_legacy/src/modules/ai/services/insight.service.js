import prisma from "../../../config/prisma.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
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
  else filter.status = { in: OPEN_STATUSES };
  if (query.kind) filter.kind = query.kind;
  if (query.subjectType) filter.subjectType = query.subjectType;
  if (query.severity) filter.severity = query.severity;
  // Domen bo'yicha filtr - modul panellari ("Moliya → AI Insights") shu
  // orqali o'qiydi. Hujjatdagi indekslangan maydon, 20 ta kind'ni sanab
  // o'tish shart emas.
  if (query.domain) filter.domain = query.domain;
  if (query.stance) filter.stance = query.stance;
  // ID ENDI ODDIY SATR - Postgres birlamchi kaliti `VARCHAR(24)`.
  if (query.subjectId) filter.subjectId = String(query.subjectId);

  const [items, total] = await Promise.all([
    prisma.insight.findMany({
      where: filter,
      orderBy: [{ priority: "desc" }, { generatedAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.insight.count({ where: filter }),
  ]);

  return { items: withLegacyIds(items), meta: buildMeta({ page, limit, total }) };
};

/**
 * ACTION CENTER - ertalabki prioritetli vazifalar ro'yxati.
 *
 * Uch guruhga bo'linadi, chunki owner "nima qilishim kerak" va "nimani
 * bilishim kerak" ni ajratishi kerak. Aralashtirilgan ro'yxat o'qilmaydi.
 */
export const actionCenter = async (query = {}) => {
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const filter = { ...branchFilter(), status: { in: OPEN_STATUSES } };

  const items = withLegacyIds(
    await prisma.insight.findMany({
      where: filter,
      orderBy: [{ priority: "desc" }, { generatedAt: "desc" }],
      take: limit * 3,
    }),
  );

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

  // Guruhlash IKKI ustun bo'yicha - `insights` jadvalining O'Z
  // ustunlari, ya'ni `groupBy` yetarli. `expectedImpact.amount` Mongo'da
  // ichma-ich obyekt edi; Prisma'da tekis `expectedImpactAmount`.
  const totals = await prisma.insight.groupBy({
    by: ["severity", "stance"],
    where: filter,
    _count: { _all: true },
    _sum: { expectedImpactAmount: true },
  });

  // Imkoniyatlar xavf sanog'iga QO'SHILMAYDI: "12 ta muammo bor" deb
  // ko'rsatish, holbuki 4 tasi o'sish taklifi, owner'ni behuda
  // vahimaga soladi va sonning o'ziga ishonchni yo'qotadi.
  const summary = { high: 0, medium: 0, low: 0, opportunities: 0, impactAtRisk: 0, upside: 0 };
  // `groupBy` natijasida kalitlar `_id` emas, USTUN NOMLARI; sanoq va
  // yig'indi esa `_count` / `_sum` ichida.
  for (const t of totals) {
    const count = t._count._all;
    const impact = t._sum.expectedImpactAmount || 0;
    if (t.stance === "opportunity") {
      summary.opportunities += count;
      summary.upside += impact;
    } else {
      summary[t.severity] = (summary[t.severity] || 0) + count;
      summary.impactAtRisk += impact;
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
  const ids = subjectIds.map(String);
  const rows = await prisma.insight.findMany({
    where: {
      ...branchFilter(),
      subjectId: { in: ids },
      status: { in: OPEN_STATUSES },
    },
    // `id` ATAYLAB: klient tavsiyani `_id` bo'yicha ochadi.
    select: {
      id: true,
      subjectId: true,
      kind: true,
      severity: true,
      score: true,
      confidence: true,
      priority: true,
      narration: true,
    },
    orderBy: { priority: "desc" },
  });

  const out = {};
  for (const r of rows) {
    const key = String(r.subjectId);
    if (!out[key]) out[key] = [];
    out[key].push(withLegacyId(r));
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
  const filter = { ...branchFilter(), domain, status: { in: OPEN_STATUSES } };

  const [risks, opportunities, totals] = await Promise.all([
    prisma.insight.findMany({
      where: { ...filter, stance: { in: ["risk", "watch"] } },
      orderBy: [{ priority: "desc" }, { generatedAt: "desc" }],
      take: limit,
    }),
    prisma.insight.findMany({
      where: { ...filter, stance: "opportunity" },
      orderBy: [{ priority: "desc" }, { generatedAt: "desc" }],
      take: limit,
    }),
    prisma.insight.groupBy({
      by: ["severity", "stance"],
      where: filter,
      _count: { _all: true },
      _sum: { expectedImpactAmount: true },
    }),
  ]);

  const summary = { high: 0, medium: 0, low: 0, opportunities: 0, impactAtRisk: 0, upside: 0 };
  // `groupBy` natijasida kalitlar `_id` emas, USTUN NOMLARI; sanoq va
  // yig'indi esa `_count` / `_sum` ichida.
  for (const t of totals) {
    const count = t._count._all;
    const impact = t._sum.expectedImpactAmount || 0;
    if (t.stance === "opportunity") {
      summary.opportunities += count;
      summary.upside += impact;
    } else {
      summary[t.severity] = (summary[t.severity] || 0) + count;
      summary.impactAtRisk += impact;
    }
  }

  return {
    domain,
    risks: withLegacyIds(risks),
    opportunities: withLegacyIds(opportunities),
    summary,
  };
};

const findScoped = async (id) => {
  const doc = await prisma.insight.findFirst({
    where: { id: String(id), ...branchFilter() },
  });
  if (!doc) throw new ApiError(404, "Insight topilmadi");
  return doc;
};

/** Owner "ko'rdim" deb belgilaydi - qayta hisoblash buni bosib o'tmaydi. */
export const acknowledge = async (id, user) => {
  const doc = await findScoped(id);
  // MONGO'DA BU `doc.save()` EDI - Prisma'da faqat o'zgargan maydonlar.
  return withLegacyId(
    await prisma.insight.update({
      where: { id: doc.id },
      data: {
        status: "acked",
        acknowledgedById: user?._id ? String(user._id) : null,
        acknowledgedAt: new Date(),
      },
    }),
  );
};

/** Vazifa bajarildi. outcome tungi job tomonidan 30 kundan keyin aniqlanadi. */
export const resolve = async (id, user) => {
  const doc = await findScoped(id);
  const data = { status: "done", resolvedAt: new Date() };
  // Ilgari "ko'rdim" belgilanmagan bo'lsa - hozir belgilaymiz
  // (`acknowledgedBy` -> `acknowledgedById`).
  if (!doc.acknowledgedById) {
    data.acknowledgedById = user?._id ? String(user._id) : null;
    data.acknowledgedAt = new Date();
  }
  return withLegacyId(
    await prisma.insight.update({ where: { id: doc.id }, data }),
  );
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
  return withLegacyId(
    await prisma.insight.update({
      where: { id: doc.id },
      data: {
        status: "dismissed",
        dismissReason: String(reason).trim(),
        resolvedAt: new Date(),
        acknowledgedById:
          doc.acknowledgedById || (user?._id ? String(user._id) : null),
      },
    }),
  );
};
