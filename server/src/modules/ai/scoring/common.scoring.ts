// UMUMIY SCORING PRIMITIVLARI - sof funksiyalar, DB yo'q, LLM yo'q.
//
// NEGA ALOHIDA ISHONCH FORMULASI (churn.scoring.js dagidan farqli):
// o'quvchi ballida ishonch "shu o'quvchi uchun qancha dars kuzatilgan"
// dan chiqadi. Filial/kurs/o'qituvchi darajasidagi insight'da esa savol
// boshqa: "xulosa chiqarish uchun namuna yetarlimi". 3 o'qituvchili
// filialda "o'rtachadan past" degan xulosa - statistik shovqin, 20
// o'qituvchida esa haqiqiy signal. Bir xil formulani ikki joyda ishlatish
// aynan shu farqni ko'r qilardi.

/** Xom qiymatni [0,1] ga siqadi. full = "to'liq yomon/to'liq yaxshi" nuqtasi. */
export const norm = (value: any,full: any) => {
  if (value == null || !Number.isFinite(value) || !(full > 0)) return 0;
  return Math.max(0, Math.min(1, value / full));
};

// `softNorm` egilish nuqtasi: `full` ga yetganda shu qiymat chiqadi,
// qolgan 0.15 esa undan keyingi butun diapazonga taqsimlanadi.
const SOFT_KNEE = 0.85;
// Dumning cho'zilishi: qancha katta bo'lsa, `full` dan keyin shuncha
// sekin o'sadi. 4 = "full dan 4 barobar oshganda dumning yarmi".
const SOFT_TAIL = 4;

/**
 * CHEGARASIZ kattaliklar uchun normallashtirish - `norm` dan farqli
 * o'laroq `full` dan oshgandan keyin ham O'SISHDA DAVOM ETADI.
 *
 * NEGA KERAK. `norm` qattiq kesadi: `full` dan oshgan hamma qiymat 1
 * bo'lib qoladi. `debtDaysFull = 30` bo'lganda 120 kunlik qarzdor 400
 * kunlik bilan AYNAN bir xil ball olardi va ro'yxat ustuvorlikni
 * ko'rsatishni to'xtatardi - hamma 94% ga yopishib qolardi.
 *
 * QAYERDA ISHLATILADI. Faqat tabiiy shifti YO'Q kattaliklarda: qarz
 * kunlari, to'lanmagan davrlar soni, ketma-ket qoldirilgan darslar,
 * muzlatishlar soni. Tabiiy chegarasi bor nisbatlar (davomat foizi,
 * guruhdagi ketish ulushi) `norm` da qoladi - u yerda chegaradan oshish
 * ma'noga ega emas.
 *
 * Shakli: [0, full] oralig'ida CHIZIQLI (0 → SOFT_KNEE), undan keyin
 * giperbolik dum. 1 ga hech qachon yetmaydi, monoton o'sadi - shuning
 * uchun tartib har doim saqlanadi.
 */
export const softNorm = (value: any,full: any) => {
  if (value == null || !Number.isFinite(value) || !(full > 0)) return 0;
  const x = Math.max(0, value / full);
  if (x <= 1) return x * SOFT_KNEE;
  const over = x - 1;
  return SOFT_KNEE + (1 - SOFT_KNEE) * (over / (over + SOFT_TAIL));
};

/**
 * Logistik siqish - ballni [0,1] bo'ylab yoyadi.
 * Sof vaznli yig'indi chekkalarda yomon tarqaladi: hamma o'rtada
 * to'planib qoladi va "82%" bilan "45%" farqi yo'qoladi.
 */
export const squash = (x: any,k: any = 6,x0: any = 0.45) => 1 / (1 + Math.exp(-k * (x - x0)));

/** Mongoose Map yoki oddiy obyektni default'lar bilan birlashtiradi. */
export const readMap = (map: any,defaults: any) => {
  if (!map) return { ...defaults };
  const obj = map instanceof Map ? Object.fromEntries(map) : map;
  return { ...defaults, ...obj };
};

/**
 * NAMUNAGA ASOSLANGAN ISHONCH - yig'ma (aggregate) insight'lar uchun.
 *
 *   confidence = sampleAdequacy × recency × consistency
 *
 * sampleAdequacy - kuzatuv soni yetarlimi (minSample da 0.5, fullSample da 1).
 *                  Chiziqli emas, ildizli: 10 dan 20 ga o'sish 2 dan 4 ga
 *                  o'sishdan kamroq ma'lumot qo'shadi.
 * recency        - eng so'nggi kuzatuvdan beri o'tgan kun (14 kunlik yarim yemirilish).
 * consistency    - chaqiruvchi beradigan [0,1]: signal barqarormi yoki sakrab
 *                  turadimi. Bilinmasa 1 (neytral).
 */
export const sampleConfidence = ({
  observed = 0,
  minSample = 4,
  fullSample = 20,
  recencyDays = 0,
  consistency = 1,
}) => {
  if (observed <= 0) return 0;
  let adequacy;
  if (observed >= fullSample) adequacy = 1;
  else if (observed <= minSample) {
    // minSample'gacha chiziqli 0 → 0.5: undan kam kuzatuv bilan
    // insight ishonch chegarasidan (0.4) o'tmasligi kerak.
    adequacy = 0.5 * (observed / Math.max(1, minSample));
  } else {
    const t = (observed - minSample) / (fullSample - minSample);
    adequacy = 0.5 + 0.5 * Math.sqrt(t);
  }
  const recency = Math.exp(-Math.max(0, recencyDays) / 14);
  return Math.max(0, Math.min(1, adequacy * recency * Math.max(0, Math.min(1, consistency))));
};

/**
 * Faktor ta'rifini to'liq faktor obyektiga aylantiradi (hissa hisoblanadi).
 * Insight.factors[] shakli bilan aynan mos - UI shu massivni to'g'ridan-
 * to'g'ri ko'rsatadi va LLM narrator ham shundan o'qiydi.
 */
export const buildFactors = (defs: any) =>
  defs
    .map((d: any) => ({
      key: d.key,
      label: d.label,
      value: d.value,
      unit: d.unit || "",
      normalized: Math.max(0, Math.min(1, d.normalized || 0)),
      weight: d.weight,
      contribution: Math.max(0, Math.min(1, d.normalized || 0)) * d.weight,
      direction: d.direction || ((d.normalized || 0) > 0.05 ? "bad" : "neutral"),
    }))
    .sort((a: any,b: any) => b.contribution - a.contribution);

/** Vaznlangan yig'indi → [0,1] ball (vaznlar yig'indisiga normallashtiriladi). */
export const weightedScore = (factors: any,{ k = 6, x0 = 0.45 }: any = {}) => {
  const weightSum = factors.reduce((a: any,f: any) => a + f.weight, 0) || 1;
  const raw = factors.reduce((a: any,f: any) => a + f.contribution, 0) / weightSum;
  return squash(raw, k, x0);
};

/** Balldan severity - chegaralar AiConfig'dan keladi. */
export const severityFor = (score: any,thresholds: any) =>
  score >= thresholds.highSeverityScore
    ? "high"
    : score >= thresholds.mediumSeverityScore
      ? "medium"
      : "low";

/**
 * Variatsiya koeffitsiyentidan izchillik - qatorlar sakrab turadimi.
 * Trend insight'larida ishlatiladi: bir oy 10 mln, keyingisi 2 mln bo'lgan
 * filialda "8% pasayish" bashorati ma'nosiz va ishonch pasayishi kerak.
 */
export const consistencyOf = (values: any) => {
  const nums = values.filter((v: any) => Number.isFinite(v));
  if (nums.length < 2) return 0.7;
  const mean = nums.reduce((a: any,b: any) => a + b, 0) / nums.length;
  if (mean === 0) return 0.7;
  const variance = nums.reduce((a: any,v: any) => a + (v - mean) ** 2, 0) / nums.length;
  const cv = Math.sqrt(variance) / Math.abs(mean);
  // cv=0 → 1 (mutlaqo barqaror), cv>=1 → 0.2 (juda sakroq).
  return Math.max(0.2, Math.min(1, 1 - cv));
};

/**
 * Z-BALL - anomaliya aniqlash (xarajat sakrashi).
 * @returns {{z, mean, stdev}} - |z| > 2 → g'ayrioddiy
 */
export const zScore = (value: any,history: any) => {
  const nums = history.filter((v: any) => Number.isFinite(v));
  if (nums.length < 3) return { z: 0, mean: null, stdev: null };
  const mean = nums.reduce((a: any,b: any) => a + b, 0) / nums.length;
  const variance = nums.reduce((a: any,v: any) => a + (v - mean) ** 2, 0) / nums.length;
  const stdev = Math.sqrt(variance);
  // stdev=0 (hamma oy bir xil) → farq bo'lsa ham z hisoblanmaydi:
  // 0 ga bo'lish emas, "ma'lumot yetarli emas" degan halol javob.
  if (stdev === 0) return { z: 0, mean, stdev };
  return { z: (value - mean) / stdev, mean, stdev };
};
