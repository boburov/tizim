import Insight from "../../../models/insight.model.js";
import AiRun from "../../../models/aiRun.model.js";
import Branch from "../../../models/branch.model.js";
import { branchFilter, getActiveBranchId } from "../../../helpers/branchContext.helper.js";
import {
  periodPulse,
  todaySnapshot,
  yesterdayWindow,
} from "../signals/pulse.signal.js";
import { revenueForecast, overdueSignal } from "../signals/finance.signal.js";
import { fmtMoney } from "./insightWriter.service.js";
import { openCounts } from "./recompute.service.js";

// BRIFING - dashboardning ASOSI.
//
// Sahifa DOIM to'rtta savolga javob berishi kerak va aynan shu tartibda:
//
//   1. Kecha nima bo'ldi?        → o'lchangan fakt (puls)
//   2. Bugun nima bo'layapti?    → holat (jadval, kutayotganlar)
//   3. Keyin nima bo'lishi mumkin? → bashorat (daromad, ketish xavfi)
//   4. Hozir nima qilishim kerak? → ustuvorlangan harakatlar
//
// TARTIB TASODIFIY EMAS: fakt → holat → bashorat → harakat. Owner
// bashoratga faktni ko'rmasdan ishonmaydi, harakatga esa bashoratni
// ko'rmasdan kirishmaydi. Ro'yxatni aralashtirish sahifani "raqamlar
// devori" ga aylantiradi va aynan shundan qochish kerak.
//
// HAR BIR BO'LIMDA `narration` bor - "har bir grafikdan keyin AI izohi"
// talabi shu yerda bajariladi: raqamlar YOLG'IZ ko'rsatilmaydi.

const pct = (v) => (v == null ? null : Math.round(v * 100));

/** Ikki qiymat orasidagi nisbiy o'zgarish (foizda). null-xavfsiz. */
const delta = (current, previous) => {
  if (previous == null || current == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
};

/** 1. KECHA NIMA BO'LDI - o'lchangan fakt, oldingi kun bilan taqqoslangan. */
const buildYesterday = async (now) => {
  const y = yesterdayWindow(now);
  const dayBefore = {
    start: new Date(y.start.getTime() - (y.end - y.start)),
    end: y.start,
  };

  const [pulse, prior] = await Promise.all([
    periodPulse(y),
    periodPulse(dayBefore),
  ]);

  const lines = [];
  if (pulse.revenue.collected > 0) {
    const d = delta(pulse.revenue.collected, prior.revenue.collected);
    lines.push(
      `${fmtMoney(pulse.revenue.collected)} so'm yig'ildi (${pulse.revenue.transactions} to'lov)` +
        (d != null ? `, oldingi kunga nisbatan ${d > 0 ? "+" : ""}${d}%` : "") +
        ".",
    );
  } else {
    lines.push("Kecha to'lov qabul qilinmagan.");
  }

  if (pulse.attendance.marked > 0) {
    const d = delta(pulse.attendance.rate, prior.attendance.rate);
    lines.push(
      `Davomat ${pct(pulse.attendance.rate)}% (${pulse.attendance.marked} yozuv)` +
        (d != null ? `, ${d > 0 ? "+" : ""}${d}% o'zgarish` : "") +
        ".",
    );
  } else {
    lines.push("Kecha davomat belgilanmagan.");
  }

  if (pulse.students.joined || pulse.students.left) {
    lines.push(
      `O'quvchi oqimi: +${pulse.students.joined} qo'shildi, −${pulse.students.left} ketdi.`,
    );
  }
  if (pulse.leads.created) {
    lines.push(`${pulse.leads.created} yangi lid keldi.`);
  }
  if (pulse.teachers.missedLessons || pulse.teachers.hrAbsences) {
    lines.push(
      `Diqqat: ${pulse.teachers.affectedTeachers} o'qituvchi kelmadi ` +
        `(${pulse.teachers.missedLessons} dars o'tkazilmadi).`,
    );
  }

  return {
    pulse,
    prior,
    metrics: [
      {
        key: "revenue",
        label: "Yig'ilgan to'lov",
        value: pulse.revenue.collected,
        unit: "so'm",
        delta: delta(pulse.revenue.collected, prior.revenue.collected),
        hint: `${pulse.revenue.transactions} tranzaksiya`,
      },
      {
        key: "attendance",
        label: "Davomat",
        value: pct(pulse.attendance.rate),
        unit: "%",
        delta: delta(pulse.attendance.rate, prior.attendance.rate),
        hint: `${pulse.attendance.marked} yozuv`,
      },
      {
        key: "studentFlow",
        label: "O'quvchi oqimi",
        value: pulse.students.joined - pulse.students.left,
        unit: "ta",
        delta: null,
        hint: `+${pulse.students.joined} / −${pulse.students.left}`,
      },
      {
        key: "leads",
        label: "Yangi lidlar",
        value: pulse.leads.created,
        unit: "ta",
        delta: delta(pulse.leads.created, prior.leads.created),
        hint: `${pulse.leads.enrolled} yozildi`,
      },
    ],
    narration: lines.join(" "),
  };
};

/** 2. BUGUN NIMA BO'LAYAPTI - holat, o'tmish emas. */
const buildToday = async (now) => {
  const snap = await todaySnapshot(now);

  const lines = [];
  if (snap.lessons.sessions > 0) {
    lines.push(
      `Bugun ${snap.lessons.groups} guruhda ${snap.lessons.sessions} dars bor.`,
    );
    if (snap.lessons.unmarkedGroups.length) {
      lines.push(
        `${snap.lessons.unmarkedGroups.length} guruhda davomat hali belgilanmagan.`,
      );
    } else if (snap.lessons.markedGroups > 0) {
      lines.push("Barcha guruhlarda davomat belgilangan.");
    }
  } else {
    lines.push("Bugun jadvalda dars yo'q.");
  }

  if (snap.likelyAbsent.length) {
    lines.push(
      `${snap.likelyAbsent.length} o'quvchi bugun kelmasligi mumkin — ` +
        `ular aynan ${snap.weekday} kunlarini qoldirish naqshiga ega.`,
    );
  }
  if (snap.followUps.length) {
    const overdue = snap.followUps.filter((f) => f.overdue).length;
    lines.push(
      `${snap.followUps.length} lid bilan bog'lanish vaqti keldi` +
        (overdue ? ` (${overdue} tasining muddati o'tgan)` : "") +
        ".",
    );
  }
  if (snap.paymentsDue.amount > 0) {
    lines.push(
      `Joriy oyda ${snap.paymentsDue.students} o'quvchidan ` +
        `${fmtMoney(snap.paymentsDue.amount)} so'm kutilmoqda.`,
    );
  }

  return {
    ...snap,
    metrics: [
      {
        key: "lessons",
        label: "Bugungi darslar",
        value: snap.lessons.sessions,
        unit: "ta",
        hint: `${snap.lessons.groups} guruh`,
      },
      {
        key: "unmarked",
        label: "Davomat belgilanmagan",
        value: snap.lessons.unmarkedGroups.length,
        unit: "guruh",
        hint: snap.lessons.unmarkedGroups.length ? "Belgilash kerak" : "Hammasi tayyor",
      },
      {
        key: "likelyAbsent",
        label: "Kelmasligi mumkin",
        value: snap.likelyAbsent.length,
        unit: "o'quvchi",
        hint: `${snap.weekday} naqshi bo'yicha`,
      },
      {
        key: "followUps",
        label: "Bog'lanish kerak",
        value: snap.followUps.length,
        unit: "lid",
        hint: `${snap.followUps.filter((f) => f.overdue).length} muddati o'tgan`,
      },
    ],
    narration: lines.join(" "),
  };
};

/**
 * 3. KEYIN NIMA BO'LISHI MUMKIN - bashorat.
 *
 * Bashorat HAR DOIM hisobi bilan ko'rsatiladi ("142 o'quvchi × o'rtacha
 * to'lov − ketish xavfi"). Yalang'och foiz ("daromad 8% tushadi") ishonch
 * uyg'otmaydi va tekshirib bo'lmaydi.
 */
const buildNext = async (branchId, now) => {
  const [forecast, overdue] = await Promise.all([
    revenueForecast(branchId, now),
    overdueSignal(now),
  ]);

  const dropPct = Math.round(Math.abs(forecast.deltaRatio) * 100);
  const direction = forecast.deltaRatio < 0 ? "pasayish" : "o'sish";

  const lines = [
    `Keyingi oy uchun bashorat: ${fmtMoney(forecast.forecastGross)} so'm ` +
      `(joriy oy ${fmtMoney(forecast.currentExpected)} so'm) — ${dropPct}% ${direction}.`,
    `Hisob: ${forecast.activeStudents} faol o'quvchi, ulardan ${forecast.riskyStudents} tasi ` +
      `ketish xavfida (${fmtMoney(forecast.atRisk)} so'm).`,
  ];
  if (forecast.collectionSample > 0) {
    lines.push(
      `Tarixiy yig'ish darajasi ${pct(forecast.collectionRate)}% — ` +
        `shuni hisobga olsak, real kutilma ${fmtMoney(forecast.forecastNet)} so'm.`,
    );
  }
  if (overdue.amount > 0) {
    lines.push(
      `Bundan tashqari ${fmtMoney(overdue.amount)} so'm muddati o'tgan qarz yig'ilishi kerak.`,
    );
  }

  return {
    forecast,
    overdue,
    metrics: [
      {
        key: "forecastGross",
        label: "Keyingi oy bashorati",
        value: Math.round(forecast.forecastGross),
        unit: "so'm",
        delta: Math.round(forecast.deltaRatio * 100),
        hint: `${forecast.activeStudents} faol o'quvchi`,
      },
      {
        key: "atRisk",
        label: "Ketish xavfidagi summa",
        value: Math.round(forecast.atRisk),
        unit: "so'm",
        hint: `${forecast.riskyStudents} o'quvchi`,
      },
      {
        key: "overdue",
        label: "Muddati o'tgan qarz",
        value: overdue.amount,
        unit: "so'm",
        hint: `${overdue.students} o'quvchi`,
      },
      {
        key: "collectionRate",
        label: "Yig'ish darajasi",
        value: pct(forecast.collectionRate),
        unit: "%",
        hint: `oxirgi ${forecast.collectionSample} oy`,
      },
    ],
    narration: lines.join(" "),
  };
};

/**
 * 4. HOZIR NIMA QILISHIM KERAK - ustuvorlangan harakatlar.
 *
 * Xavf va imkoniyat ALOHIDA: aralashtirilgan ro'yxatda owner imkoniyatni
 * "yana bir muammo" deb o'qiydi va ikkalasiga ham e'tibor bermay qo'yadi.
 */
const buildNow = async (limit = 6) => {
  const filter = { ...branchFilter(), status: { $in: ["open", "acked"] } };

  const [risks, opportunities, counts] = await Promise.all([
    Insight.find({ ...filter, stance: { $in: ["risk", "watch"] } })
      .sort({ priority: -1, generatedAt: -1 })
      .limit(limit)
      .lean(),
    Insight.find({ ...filter, stance: "opportunity" })
      .sort({ priority: -1, generatedAt: -1 })
      .limit(limit)
      .lean(),
    openCounts(),
  ]);

  const lines = [];
  if (counts.high > 0) {
    lines.push(`${counts.high} ta yuqori ustuvorlikli vazifa e'tibor kutmoqda.`);
  }
  if (counts.impactAtRisk > 0) {
    lines.push(`Jami ${fmtMoney(counts.impactAtRisk)} so'm xavf ostida.`);
  }
  if (risks[0]) {
    lines.push(`Eng muhimi: ${risks[0].title || risks[0].subjectLabel}.`);
  }
  if (counts.opportunities > 0) {
    lines.push(`Shu bilan birga ${counts.opportunities} ta o'sish imkoniyati aniqlandi.`);
  }
  if (!lines.length) {
    lines.push("Hozir shoshilinch vazifa yo'q — barcha ko'rsatkichlar normal doirada.");
  }

  return { risks, opportunities, counts, narration: lines.join(" ") };
};

/**
 * TO'LIQ BRIFING - dashboard bitta so'rovda hammasini oladi.
 *
 * NEGA BITTA ENDPOINT: to'rtta savol bitta ekranda va bitta lahzada
 * ko'rinishi kerak. To'rtta alohida so'rov to'rtta turli vaqtdagi
 * kesimni ko'rsatardi (biri yangilangan, boshqasi hali yuklanmagan) va
 * sahifa "yashab turgan maslahatchi" emas, "yuklanayotgan panellar
 * to'plami" bo'lib ko'rinardi.
 *
 * MUHIM: chaqiruvchi branch kontekstida bo'lishi kerak (HTTP qatlamida
 * middleware ta'minlaydi).
 */
export const buildBriefing = async ({ now = new Date(), actionLimit = 6 } = {}) => {
  const branchId = getActiveBranchId();

  // Bashorat aniq filialni talab qiladi (kogortli hisob filial ichida
  // ma'noga ega). "Barcha filiallar" rejimida u o'tkazib yuboriladi -
  // uni filiallar bo'ylab qo'shish har xil narxlarni aralashtirib
  // ma'nosiz son berardi.
  const [yesterday, today, now4, lastRun] = await Promise.all([
    buildYesterday(now),
    buildToday(now),
    buildNow(actionLimit),
    AiRun.findOne({ ...branchFilter(), status: "ok" })
      .sort({ startedAt: -1 })
      .select("startedAt finishedAt scope trigger durationMs")
      .lean(),
  ]);

  const next = branchId ? await buildNext(branchId, now) : null;

  const branch = branchId
    ? await Branch.findById(branchId).select("name").lean()
    : null;

  return {
    generatedAt: now,
    branch: branch ? { _id: branch._id, name: branch.name } : null,
    // "AI oxirgi marta qachon o'yladi" - bu qator bo'lmasa sahifa
    // statik dashboard bo'lib qoladi.
    lastRun: lastRun
      ? {
          at: lastRun.finishedAt || lastRun.startedAt,
          scope: lastRun.scope,
          trigger: lastRun.trigger,
          durationMs: lastRun.durationMs,
        }
      : null,
    yesterday,
    today,
    next,
    now: now4,
    // Butun brifingning bir paragrafli xulosasi - ko'p owner faqat shuni
    // o'qiydi, shuning uchun u o'zini o'zi tushuntiradigan bo'lishi kerak.
    headline: [now4.narration, yesterday.narration, today.narration]
      .filter(Boolean)
      .join(" "),
  };
};
