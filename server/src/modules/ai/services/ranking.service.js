import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import AiRanking, { RANKING_TYPES } from "../../../models/aiRanking.model.js";
import { ROLES } from "../../../constants/roles.js";
import { branchMatchStage } from "../../../helpers/branchContext.helper.js";
import { collectStudentSignals } from "../signals/student.signal.js";
import { collectTeacherSignals } from "../signals/teacher.signal.js";
import { scorePaymentRisk } from "../scoring/payment.scoring.js";
import { scoreChurn } from "../scoring/churn.scoring.js";
import { scoreTeacher, qualifiesForRaise } from "../scoring/teacher.scoring.js";
import { sampleConfidence } from "../scoring/common.scoring.js";
import { resolveConfig } from "./aiConfig.service.js";
import { fmtMoney } from "./insightWriter.service.js";
import { subjectHref } from "./subjectLink.service.js";

// REYTINGLAR - "eng yomon N ta" ro'yxatlari.
//
// NEGA UMUMAN KERAK (va nega Insight yetarli emas):
//
// Insight ANOMALIYA detektori: u chegaradan oshgan holatni topadi. Bu
// to'g'ri primitiv, lekin owner boshqa savol so'raydi - "kim eng yomoni?".
// Bu savolning javobi HAR DOIM mavjud: hatto hamma yaxshi to'lasa ham
// kimdir eng oxirgi o'rinda turadi. Anomaliya ro'yxati bo'sh bo'lishi
// mumkin, reyting esa hech qachon bo'sh emas (ma'lumot bo'lsa).
//
// SCORING QATLAMI TAKRORLANMAYDI: bu yerda o'sha collectStudentSignals()
// va scorePaymentRisk()/scoreChurn() chaqiriladi. Yagona farq - chegara
// (`confidenceFloor`, `severity`) QO'LLANILMAYDI va natija saralanadi.
//
// TARTIBLASH MEZONI ATAYLAB "XAVF BALLI" EMAS:
//
//   scorePaymentRisk = BASHORAT ("keyingi oy kechikadimi?")
//   reyting mezoni   = KUZATILGAN FAKT ("necha marta kechiktirgan?")
//
// Owner "eng ko'p kechiktirgan" deb so'raganda faktni so'raydi, bashoratni
// emas. Bashoratni tartib asosi qilib olsak, hech qachon kechiktirmagan
// lekin bugun qarzi bor yangi o'quvchi ro'yxat boshiga chiqib qolardi va
// ro'yxat yolg'on bo'lardi. Bashorat ball sifatida YONIDA ko'rsatiladi.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Filialdagi faol o'quvchilar + guruhlari (studentInsight bilan bir xil qamrov). */
const loadStudents = async (branchId) => {
  const bid = new mongoose.Types.ObjectId(String(branchId));

  const groups = await Group.find({ branchId: bid, isDeleted: false })
    .select("_id")
    .lean();
  const groupIds = groups.map((g) => g._id);
  if (!groupIds.length) return [];

  const memberships = await GroupMembership.find({
    group: { $in: groupIds },
    leftAt: null,
    isDeleted: false,
  })
    .select("student group")
    .lean();
  if (!memberships.length) return [];

  const byStudent = new Map();
  for (const m of memberships) {
    const sid = String(m.student);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push(m.group);
  }

  const users = await User.find({
    _id: { $in: [...byStudent.keys()].map((id) => new mongoose.Types.ObjectId(id)) },
    role: ROLES.STUDENT,
    isActive: true,
    isDeleted: false,
    completedAt: null,
  })
    .select("_id firstName lastName enrolledAt")
    .lean();

  return users.map((u) => ({
    ...u,
    groupIds: byStudent.get(String(u._id)) || [],
  }));
};

const nameOf = (u) => `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Noma'lum";

/**
 * TO'LOV KECHIKTIRISH INDEKSI - kuzatilgan xulq-atvor, bashorat emas.
 *
 * To'rt qism:
 *   0.30 kechikish nisbati  - "har 10 to'lovidan nechtasi kechikkan"
 *   0.18 o'rtacha kechikish - "kechikkanda necha kun"
 *   0.26 joriy qarz muddati - "hozir qancha vaqtdan beri to'lamayapti"
 *   0.26 yopilmagan davrlar - "nechta oyi umuman yopilmagan"
 *
 * NEGA NISBAT (mutlaq son emas): 12 oy to'lagan va 6 marta kechiktirgan
 * o'quvchi 2 oy to'lagan va 1 marta kechiktirgandan YOMONROQ, garchi
 * mutlaq son (6 va 1) taqqoslansa ham. Mutlaq sonni asos qilsak reyting
 * "eng eski o'quvchilar" ro'yxatiga aylanardi.
 *
 * NEGA QARZ SUMMASI TARTIB ASOSI EMAS: qimmat kursda o'qiydigan
 * o'quvchining qarzi doim kattaroq. Summa bo'yicha tartiblash "kim eng
 * qimmat kursda o'qiydi" ni ko'rsatardi, "kim eng yomon to'laydi" ni
 * emas. Summa qatorda KO'RSATILADI (owner uchun muhim), lekin tartibni
 * belgilamaydi.
 *
 * TO'RTINCHI QISM VA U NEGA KERAK ("hech to'lamaganlar tuzog'i"):
 *
 * Kechikish nisbati TRANZAKSIYALARDAN hisoblanadi - ya'ni faqat TO'LAGAN
 * o'quvchi o'lchanadi. Umuman to'lamagan o'quvchining tranzaksiyasi yo'q,
 * demak lateRatio = 0 va u "eng intizomli" bo'lib ko'rinadi. Bu eng yomon
 * to'lovchini ro'yxat TAGIGA tushirardi - reyting aynan teskarisini
 * ko'rsatardi.
 *
 * Shuning uchun to'rtinchi qism: YOPILMAGAN DAVRLAR SONI. U to'lov
 * tarixiga emas, qarz yozuviga tayanadi va hech to'lamaganni ham to'g'ri
 * o'lchaydi.
 */
const paymentDelayIndex = ({ discipline, debt }) => {
  const ratio = clamp01(discipline.lateRatio || 0);
  // 30 kun kechikish = to'liq signal. Undan ortig'i ham 1.0.
  const avgDays = clamp01((discipline.avgLateDays || 0) / 30);
  // 90 kunlik ochiq qarz = to'liq signal. 60 emas: 60 da ko'p qarzdor
  // aynan 1.0 ga to'yinib bir xil ball olardi va reyting tartibi
  // tasodifiy bo'lib qolardi.
  const debtDays = clamp01((debt.debtDays || 0) / 90);
  // 4 ta yopilmagan davr = to'liq signal (chorak yillik qarz).
  const unpaid = clamp01((debt.periods || 0) / 4);
  return clamp01(0.3 * ratio + 0.18 * avgDays + 0.26 * debtDays + 0.26 * unpaid);
};

/**
 * Reytingning O'Z ishonchi - bashorat ishonchidan farq qiladi.
 *
 * scorePaymentRisk ning confidence'i "keyingi oyni bashorat qilish uchun
 * yetarli tarix bormi" degan savolga javob beradi va to'lov tarixi
 * bo'lmasa 0 ga tushadi. Reyting uchun bu NOTO'G'RI: 6 oy umuman
 * to'lamagan o'quvchi haqida bizda shubha yo'q - u aniq eng yomon
 * to'lovchi. Bu yerda dalil = to'langan davrlar + yopilmagan davrlar.
 */
const paymentEvidenceConfidence = ({ discipline, debt }) =>
  sampleConfidence({
    observed: (discipline.periods || 0) + (debt.periods || 0),
    minSample: 2,
    fullSample: 8,
  });

/** 1-REYTING: eng ko'p to'lovni kechiktirganlar. */
const buildPaymentDelayRanking = async ({ branchId, students, signals, config, limit }) => {
  const monthly = await loadMonthlyExpected(students.map((s) => String(s._id)));

  const rows = [];
  let totalDebt = 0;

  for (const s of students) {
    const sid = String(s._id);
    const sig = signals.get(sid);
    if (!sig) continue;

    const { discipline, debt } = sig;
    // Hech qachon to'lov davri bo'lmagan VA qarzi ham yo'q o'quvchi
    // reytingda umuman qatnashmaydi - u "yaxshi to'laydi" degani emas,
    // "hali o'lchanmagan" degani. Ikkalasini aralashtirish ro'yxatning
    // pastini ma'nosiz qiladi.
    if (!discipline.periods && !debt.periods) continue;

    const index = paymentDelayIndex(sig);
    // Faqat haqiqatan biror kechikish/qarz belgisi borlar. Nol indeksli
    // o'quvchini "eng yomon 10" ga qo'yish reytingni yolg'on qiladi.
    if (index <= 0) continue;

    totalDebt += debt.debtAmount || 0;

    // BASHORAT balli - tartib uchun emas, jiddiylik darajasi (badge) uchun.
    const risk = scorePaymentRisk(sig, config);

    // Bo'sh o'lchov KO'RSATILMAYDI: hech to'lamagan o'quvchida
    // "Kechikish soni: 0 ta" turishi uni yaxshi to'lovchi deb o'qitardi -
    // aynan qarama-qarshi xabar.
    const metrics = [];
    if (discipline.periods > 0) {
      metrics.push(
        {
          key: "lateRatio",
          label: "Kechikkan to'lovlar",
          value: Math.round((discipline.lateRatio || 0) * 100),
          unit: "%",
        },
        {
          key: "avgLateDays",
          label: "O'rtacha kechikish",
          value: Math.round(discipline.avgLateDays || 0),
          unit: "kun",
        },
      );
    }
    if (debt.periods > 0) {
      metrics.push({
        key: "unpaidPeriods",
        label: "Yopilmagan oylar",
        value: debt.periods,
        unit: "ta",
      });
    }
    if (debt.debtAmount > 0) {
      metrics.push(
        {
          key: "debtAmount",
          label: "Joriy qarz",
          value: Math.round(debt.debtAmount),
          unit: "so'm",
        },
        {
          key: "debtDays",
          label: "Qarz muddati",
          value: debt.debtDays || 0,
          unit: "kun",
        },
      );
    }

    rows.push({
      subjectType: "student",
      subjectId: s._id,
      label: nameOf(s),
      href: subjectHref("student", s._id),
      score: index,
      severity: risk.severity,
      confidence: paymentEvidenceConfidence(sig),
      metrics,
      note: buildPaymentNote(discipline, debt, monthly.get(sid) || 0),
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return {
    type: "payment_delay",
    branchId,
    scanned: students.length,
    rows: rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })),
    totals: { debtAmount: Math.round(totalDebt), affected: rows.length },
  };
};

/** Qatorning bir jumlalik xulosasi - kartadagi raqamlarni TAKRORLAMAYDI. */
const buildPaymentNote = (discipline, debt, monthlyExpected) => {
  // Eng og'ir holat birinchi: ochiq qarz kechikish tarixidan muhimroq.
  if (debt.debtDays > 60) {
    return `${debt.periods} oylik to'lov ${debt.debtDays} kundan beri yopilmagan — bu yo'qotilgan pul bo'lib qolmoqda.`;
  }
  if (debt.debtAmount > 0) {
    return `Hozirgi qarzi ${fmtMoney(debt.debtAmount)} so'm.`;
  }
  if (discipline.lateRatio >= 0.5) {
    return `To'lovlarining yarmidan ko'pini kechiktiradi — to'lov sanasini kelishib olish kerak.`;
  }
  if (monthlyExpected > 0) {
    return `Joriy oyda ${fmtMoney(monthlyExpected)} so'm kutilmoqda.`;
  }
  return "";
};

/**
 * 2-REYTING: eng ko'p dars qoldirganlar.
 *
 * Tartib asosi - QOLDIRILGAN DARSLAR SONI emas, ULUSHI + ketma-ketlik.
 * Sabab: haftada 3 marta dars bor guruhdagi o'quvchi 5 ta qoldirsa,
 * haftada 1 marta dars bor guruhdagi 5 ta qoldirgan bilan bir xil emas.
 * Ulush ikkalasini adolatli taqqoslaydi. Ketma-ketlik alohida qo'shiladi:
 * 8 darsdan 4 tasini sochilgan holda qoldirish va oxirgi 4 tasini
 * KETMA-KET qoldirish butunlay boshqa holat - ikkinchisi ketish arafasi.
 */
const buildAbsenceRanking = async ({ branchId, students, signals, config, limit }) => {
  const rows = [];
  let totalMissed = 0;

  for (const s of students) {
    const sid = String(s._id);
    const sig = signals.get(sid);
    if (!sig) continue;

    const { attendance, streak } = sig;
    const lessons = attendance.lessons || 0;
    // Dars yozuvi yo'q o'quvchi o'lchanmagan - reytingga kirmaydi.
    if (lessons < 4) continue;

    const rate = attendance.recentRate ?? 1;
    const missed = Math.round(lessons * (1 - rate));
    if (missed <= 0) continue;

    totalMissed += missed;

    const missRatio = clamp01(1 - rate);
    // 4 ta ketma-ket qoldirish = to'liq signal (ikki haftalik yo'qlik).
    const streakScore = clamp01((streak.streak || 0) / 4);
    const index = clamp01(0.7 * missRatio + 0.3 * streakScore);

    // Ketish xavfi balli - kontekst uchun. Bu yerda churn ishlatiladi,
    // chunki dars qoldirish TO'LOV emas, KETISH belgisi.
    const churn = scoreChurn(sig, config);

    rows.push({
      subjectType: "student",
      subjectId: s._id,
      label: nameOf(s),
      href: subjectHref("student", s._id),
      score: index,
      severity: churn.severity,
      confidence: churn.confidence,
      metrics: [
        { key: "missed", label: "Qoldirgan darslar", value: missed, unit: "ta" },
        { key: "lessons", label: "Jami darslar", value: lessons, unit: "ta" },
        {
          key: "attendanceRate",
          label: "Davomat",
          value: Math.round(rate * 100),
          unit: "%",
        },
        { key: "streak", label: "Ketma-ket", value: streak.streak || 0, unit: "ta" },
      ],
      note: buildAbsenceNote(streak, missRatio, sig),
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return {
    type: "absence",
    branchId,
    scanned: students.length,
    rows: rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })),
    totals: { missedLessons: totalMissed, affected: rows.length },
  };
};

/**
 * "Bu o'quvchi bilan ishlashimiz kerak" - owner aynan shu iborani so'radi.
 * Lekin u SHARTSIZ yozilmaydi: har qatorda bir xil jumla turса, u shovqinga
 * aylanadi va o'qilmay qoladi. Faqat haqiqatan aralashuv talab qiladigan
 * holatda chiqadi.
 */
const buildAbsenceNote = (streak, missRatio, sig) => {
  if ((streak.streak || 0) >= 3) {
    return `Oxirgi ${streak.streak} darsni ketma-ket qoldirdi — bu o'quvchi bilan ZUDLIK bilan ishlashimiz kerak.`;
  }
  if (missRatio >= 0.4) {
    return `Darslarning ${Math.round(missRatio * 100)}% ini qoldirgan — bu o'quvchi bilan ishlashimiz kerak.`;
  }
  if (sig.debt?.debtAmount > 0) {
    return `Dars qoldirish qarz bilan birga kelmoqda — sabab moliyaviy bo'lishi mumkin.`;
  }
  return `Davomati pasaymoqda — sababini so'rab ko'ring.`;
};

/** Joriy oy uchun kutilayotgan to'lov (qatordagi kontekst uchun). */
const loadMonthlyExpected = async (studentIds) => {
  if (!studentIds.length) return new Map();
  const now = new Date();
  const rows = await StudentPayment.aggregate([
    ...branchMatchStage(),
    {
      $match: {
        student: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
      },
    },
    { $group: { _id: "$student", amount: { $sum: "$expectedAmount" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.amount || 0]));
};

/**
 * 3-REYTING: O'QITUVCHILAR - yuqoridan pastga.
 *
 * BU REYTING BOSHQA IKKITASIDAN TUB FARQ QILADI: u "eng yomon" emas,
 * "eng yaxshi" dan boshlanadi. Sabab shunchaki ohang emas - odam haqidagi
 * ommaviy reyting pastdan boshlansa, u jazolash quroliga aylanadi va
 * o'qituvchilar tizimga qarshi ishlaydi (bahoni bo'rttirish, davomatni
 * soxtalashtirish). Yuqoridan boshlansa - rag'batlantirish quroli.
 *
 * Har qatorda maosh tavsiyasi CHIQMAYDI - faqat qat'iy shartlardan
 * o'tganlarda (teacher.scoring.js dagi RAISE_GATE).
 */
const buildTeacherRanking = async ({ branchId, now, limit }) => {
  const { teachers, signals, baseline } = await collectTeacherSignals(branchId, now);
  if (!teachers.length) {
    return { type: "teacher", branchId, scanned: 0, rows: [], totals: {} };
  }

  // BIRINCHI O'TISH: ball. Maosh tavsiyasi bu bosqichda HAL QILINMAYDI -
  // u "yuqori 10% da" shartiga tayanadi, ya'ni butun ro'yxat saralanmaguncha
  // ma'lum emas.
  const scored = [];
  for (const t of teachers) {
    const tid = String(t._id);
    const sig = signals.get(tid);
    if (!sig) continue;

    const result = scoreTeacher(sig);
    // O'lchanmagan o'qituvchi reytingga KIRMAYDI. Uni oxirgi o'ringa
    // qo'yish "yomon ishlayapti" degan yolg'on xabar berardi.
    if (result.score == null) continue;

    scored.push({ teacher: t, sig, result });
  }

  scored.sort((a, b) => b.result.score - a.result.score);

  // IKKINCHI O'TISH: o'rin ma'lum bo'lgach - gate va matn.
  const total = scored.length;
  const rows = [];
  let raiseCount = 0;

  scored.forEach((entry, i) => {
    const { teacher: t, sig, result } = entry;
    const raise = qualifiesForRaise(result, baseline, { rank: i + 1, total });
    if (raise) raiseCount += 1;

    const metrics = result.dimensions
      .filter((d) => d.score != null)
      .map((d) => ({
        key: d.key,
        label: d.label,
        value: d.display,
        unit: d.unit,
      }));

    // Yuklama har doim ko'rsatiladi: "ta'sir doirasi" bo'lmasa, 6
    // o'quvchili o'qituvchi 60 o'quvchilik bilan bir xil o'qiladi.
    metrics.push({
      key: "students",
      label: "O'quvchilari",
      value: sig.load.students || 0,
      unit: "ta",
    });

    rows.push({
      rank: i + 1,
      subjectType: "teacher",
      subjectId: t._id,
      label: `${t.firstName || ""} ${t.lastName || ""}`.trim() || "Noma'lum",
      href: subjectHref("teacher", t._id),
      score: result.score,
      // Bu reytingda "severity" xavf emas, DARAJA: high = eng yaxshi.
      // Rangni UI shunga qarab yashil beradi (xavf reytinglarida qizil).
      severity: raise ? "high" : result.score >= 0.5 ? "medium" : "low",
      confidence: result.confidence,
      metrics,
      note: buildTeacherNote({ result, raise, signals: sig }),
    });
  });

  return {
    type: "teacher",
    branchId,
    scanned: teachers.length,
    rows: rows.slice(0, limit),
    // Nomzodlar butun ro'yxat bo'yicha sanaladi (limit'dan tashqarida
    // qolgani ham) - "2 ta nomzod bor" soni kesilgan ro'yxatga bog'liq
    // bo'lmasligi kerak.
    totals: { raiseCandidates: raiseCount, ranked: total },
  };
};

/**
 * O'qituvchi qatorining xulosasi.
 *
 * MAOSH TAVSIYASI shu yerda yoziladi va MIQDOR ATAYLAB AYTILMAYDI -
 * teacher.scoring.js dagi izohga qarang. AI ko'rsatkichni beradi,
 * miqdorni owner belgilaydi.
 */
const buildTeacherNote = ({ result, raise, signals }) => {
  const best = result.dimensions
    .filter((d) => d.score != null)
    .sort((a, b) => b.score - a.score)[0];

  if (raise) {
    const reason =
      best?.key === "attendance"
        ? `o'quvchilarining davomati filial o'rtachasidan ${best.display}% yuqori`
        : best?.key === "grade"
          ? `o'quvchilarining bahosi filial o'rtachasidan ${best.display} ball tez o'smoqda`
          : `o'quvchilari filial o'rtachasidan ${best?.display}% ko'proq o'z vaqtida to'laydi`;
    return `Kuchli ko'rsatkich — ${reason}. Maoshini oshirishni ko'rib chiqing (miqdorni o'zingiz belgilaysiz).`;
  }

  const weak = result.dimensions
    .filter((d) => d.score != null)
    .sort((a, b) => a.score - b.score)[0];

  if (weak && weak.score < 0.35) {
    return weak.key === "attendance"
      ? `Guruhlarida davomat filial o'rtachasidan ${Math.abs(weak.display)}% past — sababini birga aniqlang.`
      : weak.key === "grade"
        ? `O'quvchilarining bahosi filial o'rtachasidek o'smayapti — metodik yordam kerak bo'lishi mumkin.`
        : `Guruhlarida to'lov intizomi past — ota-onalar bilan aloqani tekshiring.`;
  }

  if (signals.absence?.missedLessons > 0) {
    return `${signals.absence.missedLessons} ta dars o'tkazilmagan — ko'rsatkichga ta'sir qilmoqda.`;
  }
  return "";
};

/**
 * Bitta filial uchun O'QUVCHI reytinglarini qayta hisoblab saqlaydi.
 *
 * Ikkala reyting BIR MARTA yig'ilgan signaldan quriladi - collectStudentSignals
 * 8 ta aggregation qiladi va uni ikki marta chaqirish bekorga ikki barobar
 * yuk bo'lardi.
 *
 * MUHIM: chaqiruvchi runWithBranchContext() ichida bo'lishi SHART.
 */
export const recomputeRankings = async (branchId, { limit = DEFAULT_LIMIT } = {}) => {
  const now = new Date();
  const config = await resolveConfig(branchId);
  const students = await loadStudents(branchId);

  // O'qituvchi reytingi o'quvchilardan MUSTAQIL - guruhda o'quvchi
  // qolmasa ham o'qituvchilar ro'yxati o'z holicha hisoblanadi.
  const teacher = await buildTeacherRanking({ branchId, now, limit });
  await saveRanking(teacher);

  if (!students.length) {
    await saveRanking({ type: "payment_delay", branchId, scanned: 0, rows: [], totals: {} });
    await saveRanking({ type: "absence", branchId, scanned: 0, rows: [], totals: {} });
    return { payment_delay: 0, absence: 0, teacher: teacher.rows.length };
  }

  const signals = await collectStudentSignals(students, now);

  const payment = await buildPaymentDelayRanking({
    branchId,
    students,
    signals,
    config,
    limit,
  });
  const absence = await buildAbsenceRanking({
    branchId,
    students,
    signals,
    config,
    limit,
  });

  await saveRanking(payment);
  await saveRanking(absence);

  return {
    payment_delay: payment.rows.length,
    absence: absence.rows.length,
    teacher: teacher.rows.length,
  };
};

/** Snapshotni yozadi (filial + tur bo'yicha bitta joriy yozuv). */
export const saveRanking = async ({ type, branchId, scanned, rows, totals }) => {
  await AiRanking.findOneAndUpdate(
    { branchId, type },
    {
      $set: {
        generatedAt: new Date(),
        scanned: scanned || 0,
        rows: rows || [],
        totals: totals || {},
      },
    },
    { upsert: true, new: true },
  );
};

/**
 * Saqlangan reytingni o'qiydi.
 *
 * Snapshot yo'q bo'lsa null qaytariladi - HTTP qatlami buni "hali
 * hisoblanmagan" holati sifatida ko'rsatadi. Bu yerda jimgina qayta
 * hisoblash QILINMAYDI: 800 o'quvchilik hisob so'rovni 2 soniyaga
 * cho'zardi va owner sababini bilmasdi.
 */
export const readRanking = async (branchId, type) => {
  const doc = await AiRanking.findOne({ branchId, type }).lean();
  if (!doc) return null;
  return {
    type: doc.type,
    generatedAt: doc.generatedAt,
    scanned: doc.scanned,
    rows: doc.rows || [],
    totals: plainTotals(doc.totals),
    // Snapshot eskirganini UI aytishi kerak - "kecha hisoblangan" reyting
    // bugungi qaror uchun boshqacha o'qiladi.
    staleDays: Math.floor((Date.now() - new Date(doc.generatedAt).getTime()) / DAY_MS),
  };
};

/**
 * Barcha turlarni bitta so'rovda (dashboard uchun).
 *
 * Turlar ro'yxati MODELDAN olinadi - bu yerda ikkinchi nusxa saqlansa,
 * yangi reyting turi qo'shilganda u modelda paydo bo'lib, dashboardda
 * jimgina yo'q bo'lib qolardi.
 */
export const readAllRankings = async (branchId, types = RANKING_TYPES) => {
  const docs = await AiRanking.find({ branchId, type: { $in: types } }).lean();
  const byType = new Map(docs.map((d) => [d.type, d]));
  const out = {};
  for (const t of types) {
    const doc = byType.get(t);
    out[t] = doc
      ? {
          type: doc.type,
          generatedAt: doc.generatedAt,
          scanned: doc.scanned,
          rows: doc.rows || [],
          totals: plainTotals(doc.totals),
        }
      : null;
  }
  return out;
};

/**
 * Mongoose Map maydonini oddiy obyektga aylantiradi.
 *
 * DIQQAT: .lean() Map'ni ODDIY OBYEKT qilib qaytaradi, .lean()siz esa
 * haqiqiy Map. Object.fromEntries() faqat ikkinchisida ishlaydi va
 * birinchisida "object is not iterable" bilan yiqiladi. Ikkala shakl ham
 * kelishi mumkin, shuning uchun tekshiruv shu yerda - bitta joyda.
 */
const plainTotals = (totals) => {
  if (!totals) return {};
  if (totals instanceof Map) return Object.fromEntries(totals);
  return { ...totals };
};
