import prisma from "../../../config/prisma.js";
import { AI_ENGINE_VERSION } from "../../../constants/ai.js";
import { kindMeta, isOpportunity } from "../insightKinds.js";
import { subjectHref } from "./subjectLink.service.js";

// INSIGHT YOZISH qatlami - barcha domen servislari uchun BITTA yo'l.
//
// NEGA ALOHIDA: yozish mantiqida uchta nozik qoida bor (prioritet formulasi,
// "ko'rdim" holatini bosib o'tmaslik, eskirganni yopish). Ular har bir
// domenda takrorlansa, ertami-kechmi bittasida noto'g'ri qilinadi va
// Action Center tartibi yoki insight tarixи jimgina buziladi.

const DAY_MS = 24 * 60 * 60 * 1000;

// Insight shu muddatdan keyin eskirgan hisoblanadi.
// 14 kun: bir hisob-kitob davri ichida ikki marta ko'rib chiqiladi, lekin
// owner e'tibor bermasa abadiy osilib qolmaydi.
export const INSIGHT_TTL_DAYS = 14;

export const OPEN_STATUSES = ["open", "acked"];

export const fmtMoney = (n) =>
  new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(
    Math.round(n || 0),
  );

// ID ENDI ODDIY SATR - Postgres birlamchi kaliti `VARCHAR(24)`.
const toId = (v) => String(v);

/**
 * PRIORITET = pul × ehtimol × shoshilinchlik × ishonch.
 *
 * Action Center TARTIBI shu formuladan chiqadi va bu mahsulotning eng
 * muhim qarori: owner ro'yxatning YUQORISIDAN boshlab ishlaydi, shuning
 * uchun tartib noto'g'ri bo'lsa qolgan hamma narsa bekor.
 *
 * Pul birinchi ko'paytuvchi: 90% xavfli, lekin 200 000 so'mlik o'quvchidan
 * ko'ra 60% xavfli 900 000 so'mlik o'quvchi muhimroq.
 *
 * IMKONIYATLAR 0.6 koeffitsiyenti bilan: ular ALOHIDA ro'yxatda ko'rinadi,
 * lekin bir xil shkalada bo'lishi kerak - "yana bir guruh ochish" (kelajak
 * daromadi) hozir ketayotgan o'quvchidan (bugungi yo'qotish) muhimroq
 * emas. Yo'qotishni to'xtatish har doim birinchi.
 */
export const computePriority = ({ amount, score, severity, confidence, kind }) => {
  const urgency = severity === "high" ? 1.5 : severity === "medium" ? 1 : 0.6;
  const stanceWeight = isOpportunity(kind) ? 0.6 : 1;
  // Ishonch ham ko'paytuvchi: shubhali insight ro'yxat tepasiga chiqmasligi kerak.
  return Math.round(
    (amount || 0) * score * urgency * Math.max(0.3, confidence) * stanceWeight,
  );
};

/**
 * Insight hujjatini quradi: domain/stance/priority/expiresAt ni O'ZI to'ldiradi.
 *
 * Chaqiruvchi faqat "nima topildi" ni beradi - taksonomiya va reyting
 * shu yerda hal bo'ladi, shuning uchun yangi detektor qo'shish uchun
 * insightKinds.js ga bitta qator yozish kifoya.
 */
export const buildInsight = ({
  branchId,
  kind,
  subjectId,
  subjectLabel = "",
  title = "",
  severity,
  score,
  confidence,
  factors = [],
  sourceRefs = [],
  recommendedActions = [],
  expectedImpact = { amount: 0, currency: "UZS", label: "" },
  narration = null,
  now = new Date(),
  ttlDays = INSIGHT_TTL_DAYS,
}) => {
  const meta = kindMeta(kind);
  if (!meta) throw new Error(`Noma'lum insight turi: ${kind}`);

  return {
    branchId: toId(branchId),
    subjectType: meta.subject,
    subjectId: toId(subjectId),
    subjectLabel,
    // SUBYEKT PROFILIGA HAVOLA - kartadagi ism bosiladigan bo'lishi uchun.
    //
    // Nega yozish paytida hisoblanadi (frontend'da emas): bir xil
    // moslashuv reyting qatorlarida va kelajakdagi hisobot/Telegram
    // matnida ham kerak. Frontend'da qilinsa, hisobotdagi havola
    // boshqacha qurilardi va ikkisi jimgina ayrilib ketardi.
    //
    // Havolasi bo'lmagan tur (kurs) uchun null qoladi va UI ismni
    // oddiy matn sifatida chizadi - 404 ga olib boradigan havola
    // umuman havolasizlikdan yomonroq.
    subjectHref: subjectHref(meta.subject, subjectId),
    title,
    kind,
    domain: meta.domain,
    stance: meta.stance,
    severity,
    score,
    confidence,
    factors,
    sourceRefs,
    recommendedActions,
    // `expectedImpact` Mongo'da ICHMA-ICH obyekt edi; Prisma'da uchta
    // TEKIS ustun. Chaqiruvchilar hamon obyekt uzatadi, shuning uchun
    // yoyish shu YAGONA nuqtada bo'ladi.
    expectedImpactAmount: expectedImpact?.amount || 0,
    expectedImpactCurrency: expectedImpact?.currency || "UZS",
    expectedImpactLabel: expectedImpact?.label || "",
    priority: computePriority({
      amount: expectedImpact?.amount,
      score,
      severity,
      confidence,
      kind,
    }),
    narration,
    narrationModel: null,
    engineVersion: AI_ENGINE_VERSION,
    generatedAt: now,
    expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
  };
};

/**
 * Insight'ni yaratadi yoki mavjudini yangilaydi.
 *
 * status va acknowledgedBy TEGILMAYDI: owner "ko'rdim" deb belgilagan
 * insight qayta hisoblashdan keyin yana "open" ga qaytmasligi kerak -
 * aks holda Action Center har kuni ertalab bir xil vazifani qayta
 * ko'rsatadi va owner ro'yxatga ishonishni to'xtatadi.
 *
 * @returns {"created"|"updated"}
 */
export const upsertInsight = async (doc) => {
  const existing = await prisma.insight.findFirst({
    where: {
      subjectType: doc.subjectType,
      subjectId: doc.subjectId,
      kind: doc.kind,
      status: { in: OPEN_STATUSES },
    },
    select: { id: true },
  });

  if (existing) {
    // `status` va `acknowledgedBy` DOC ICHIDA YO'Q (buildInsight ularni
    // yozmaydi), shuning uchun `update` ularga tegmaydi - owner
    // "ko'rdim" belgisi saqlanadi.
    await prisma.insight.update({ where: { id: existing.id }, data: doc });
    return "updated";
  }
  await prisma.insight.create({ data: doc });
  return "created";
};

/**
 * Endi signal bermayotgan subyektlarning ochiq insight'larini yopadi.
 *
 * outcome="prevented": bashorat qilingan hodisa SODIR BO'LMADI. Yopiq
 * halqaning boshlanishi - "sizga aytgan 12 tadan 9 tasi qoldi" degan
 * hisobot aynan shu maydondan chiqadi.
 *
 * @param {string} branchId
 * @param {string[]} kinds - qaysi turlar tozalanadi
 * @param {Set<string>} stillOpen - hali ham signal berayotgan subjectId'lar
 */
export const closeStale = async (branchId, kinds, stillOpen, now = new Date()) => {
  const kindList = Array.isArray(kinds) ? kinds : [kinds];
  const closable = await prisma.insight.findMany({
    where: {
      branchId: toId(branchId),
      kind: { in: kindList },
      status: { in: OPEN_STATUSES },
      subjectId: { notIn: [...stillOpen].map(toId) },
    },
    select: { id: true },
  });

  if (!closable.length) return 0;
  await prisma.insight.updateMany({
    where: { id: { in: closable.map((d) => d.id) } },
    data: {
      status: "done",
      resolvedAt: now,
      outcome: "prevented",
      outcomeCheckedAt: now,
    },
  });
  return closable.length;
};

/** Detektor statistikasi uchun bo'sh hisoblagich. */
export const mkStats = () => ({
  created: 0,
  updated: 0,
  closed: 0,
  skippedLowConfidence: 0,
});

/**
 * Bitta detektor natijasini yozadi va statistikani yuritadi.
 *
 * Ishonch filtri SHU YERDA: sayoz ma'lumot ustida ishonchli ko'rinadigan
 * raqam chiqarish - eng katta mahsulot xavfi. Past ishonchli insight
 * umuman YARATILMAYDI (UI da yashirilmaydi - bu ikki xil narsa:
 * yaratilmagan insight Action Center hisobini ham shishirmaydi).
 *
 * @returns {boolean} insight yozildimi
 */
export const writeIfConfident = async ({
  candidate,
  confidenceFloor,
  stats,
  stillOpen,
}) => {
  if (candidate.confidence < confidenceFloor) {
    stats.skippedLowConfidence += 1;
    return false;
  }
  const res = await upsertInsight(candidate);
  stats[res] += 1;
  stillOpen?.add(String(candidate.subjectId));
  return true;
};
