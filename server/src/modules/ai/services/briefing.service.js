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

  // IZOH FAQAT KARTA AYTA OLMAYDIGAN NARSANI AYTADI.
  //
  // Ilgari har bir ko'rsatkich uchun bitta jumla yozilardi ("0 so'm
  // yig'ildi (0 to'lov)") - bu yonidagi kartaning AYNAN o'zi edi. Owner
  // bir xil raqamni ikki marta o'qishga majbur bo'lardi va matnni
  // butunlay o'qimay qo'yardi.
  //
  // Yangi qoida: sezilarli o'zgarish, sof yo'qotish yoki kartada
  // umuman yo'q hodisa (o'qituvchi kelmagani) bo'lsagina jumla yoziladi.
  // Aytadigan gap bo'lmasa - narration null, va bo'lim izohsiz chiqadi.
  const lines = [];

  const revDelta = delta(pulse.revenue.collected, prior.revenue.collected);
  if (revDelta != null && Math.abs(revDelta) >= 20) {
    lines.push(
      revDelta < 0
        ? `To'lov oqimi oldingi kunga nisbatan ${Math.abs(revDelta)}% pasaydi.`
        : `To'lov oqimi ${revDelta}% oshdi.`,
    );
  }

  const attDelta = delta(pulse.attendance.rate, prior.attendance.rate);
  if (attDelta != null && attDelta <= -10) {
    lines.push(`Davomat ${Math.abs(attDelta)}% tushdi — sababini tekshiring.`);
  }

  if (pulse.students.left > pulse.students.joined) {
    lines.push(
      `${pulse.students.left} o'quvchi ketdi, ${pulse.students.joined} tasi qo'shildi.`,
    );
  }

  // Kartada yo'q: o'qituvchi yo'qligi bo'limda umuman ko'rsatkich emas.
  if (pulse.teachers.missedLessons || pulse.teachers.hrAbsences) {
    lines.push(
      `${pulse.teachers.affectedTeachers} o'qituvchi kelmadi, ` +
        `${pulse.teachers.missedLessons} dars o'tkazilmadi.`,
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
    // null = aytadigan gap yo'q. Frontend bunda izoh qutisini
    // umuman chizmaydi (bo'sh quti ham matn kabi joy egallaydi).
    narration: lines.length ? lines.join(" ") : null,
  };
};

/** 2. BUGUN NIMA BO'LAYAPTI - holat, o'tmish emas. */
const buildToday = async (now) => {
  const snap = await todaySnapshot(now);

  // To'rtta karta bugungi holatni to'liq qamraydi (darslar, belgilanmagan
  // guruhlar, kelmasligi mumkin bo'lganlar, bog'lanish kerak bo'lgan
  // lidlar). Shuning uchun izoh ularni TAKRORLAMAYDI - faqat muddati
  // o'tgan ish va kutilayotgan pul haqida gapiradi: bularning ikkalasi
  // ham kartadagi sondan kelib chiqmaydi.
  const lines = [];

  const overdue = snap.followUps.filter((f) => f.overdue).length;
  if (overdue) {
    lines.push(`${overdue} lid bilan bog'lanish muddati o'tgan.`);
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
        hint: `${overdue} muddati o'tgan`,
      },
    ],
    narration: lines.length ? lines.join(" ") : null,
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

  // To'rtta karta bashorat, xavfdagi summa, qarz va yig'ish darajasini
  // ALLAQACHON ko'rsatadi. Ilgari izoh aynan shu to'rt sonni qayta
  // o'qib berardi ("Keyingi oy uchun bashorat: X so'm ... 0% o'sish").
  // Endi u faqat SONDAN KELIB CHIQMAYDIGAN xulosani aytadi: pasayish
  // sababi va yalpi/sof farqi.
  const lines = [];

  // Faol o'quvchi bo'lmasa bashorat ham, izoh ham ma'nosiz.
  if (forecast.activeStudents > 0) {
    if (forecast.deltaRatio <= -0.05) {
      lines.push(
        `Pasayishning asosiy sababi — ketish xavfidagi ${forecast.riskyStudents} o'quvchi.`,
      );
    }
    if (forecast.collectionSample > 0 && forecast.collectionRate < 0.95) {
      lines.push(
        `Tarixda to'lovlarning ${pct(forecast.collectionRate)}% i yig'ilgan — ` +
          `shu tezlikda real kutilma ${fmtMoney(forecast.forecastNet)} so'm.`,
      );
    }
    if (overdue.amount > 0) {
      lines.push(`${fmtMoney(overdue.amount)} so'm eski qarzni undirish kerak.`);
    }
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
    narration: lines.length ? lines.join(" ") : null,
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

  // Vazifa/imkoniyat SONLARI bo'lim sarlavhasidagi hint'da, vazifalarning
  // O'ZI esa darhol pastdagi kartalarda turadi. Ilgari izoh ikkalasini
  // ham qayta aytardi ("N ta yuqori ustuvorlikli vazifa e'tibor
  // kutmoqda", "Eng muhimi: X"), bo'sh holatda esa ActionLists ning
  // bo'sh holat kartasini takrorlardi.
  //
  // Qoladigan yagona gap - PUL: umumiy xavf summasi na hint'da, na
  // kartalarda ko'rinadi, chunki u barcha insight'lar bo'yicha yig'indi.
  const lines = [];
  if (counts.impactAtRisk > 0) {
    lines.push(`Ushbu vazifalar bo'yicha jami ${fmtMoney(counts.impactAtRisk)} so'm xavf ostida.`);
  }

  return {
    risks,
    opportunities,
    counts,
    narration: lines.length ? lines.join(" ") : null,
  };
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
