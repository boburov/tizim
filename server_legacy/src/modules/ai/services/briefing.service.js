import prisma from "../../../config/prisma.js";
import { branchFilter, getActiveBranchId } from "../../../helpers/branchContext.helper.js";
import {
  periodPulse,
  todaySnapshot,
  yesterdayWindow,
  attendanceOutlook,
} from "../signals/pulse.signal.js";
import {
  revenueForecast,
  overdueSignal,
  collectedByMonth,
  shiftMonth,
  monthKey,
} from "../signals/finance.signal.js";
import { businessHealth } from "../signals/health.signal.js";
import { monthNameUz } from "../../../constants/calendar.js";
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
  const filter = { ...branchFilter(), status: { in: ["open", "acked"] } };

  const [risks, opportunities, counts] = await Promise.all([
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

// ======================================================================
// IJROIYA QATLAMI - xulosa, KPI, bashorat.
//
// Yuqoridagi to'rtta blok (kecha/bugun/keyin/hozir) TAFSILOT beradi.
// Quyidagi uchtasi esa dashboardning BIRINCHI EKRANINI to'ldiradi:
// owner 5 soniyada "biznes qanday va men nima qilishim kerak" degan
// savolga javob olishi kerak, tafsilotga esa keyin tushadi.
// ======================================================================

/**
 * KPI KARTALARI - eng ko'pi bilan OLTITA.
 *
 * NEGA CHEKLOV: ilgari sahifada 16 ta ko'rsatkich katakchasi bor edi
 * (to'rtta bo'limda to'rttadan). O'n oltita raqam - bu nol raqam:
 * owner qaysi biri muhimligini ajrata olmagach, hech biriga qaramaydi.
 *
 * HAR BIR KARTA UCHTA SAVOLGA JAVOB BERADI:
 *   value/hint → nima?         (raqam va uning o'lchovi)
 *   why        → nega shunday?  (sababi - raqamdan kelib chiqmaydi)
 *   next       → keyin nima?    (oqibati yoki kutilma)
 *
 * `why` va `next` MAJBURIY. Kontekstsiz raqam owner'ni harakatga
 * undamaydi - u shunchaki hisobot bo'lib qoladi.
 */
const buildKpis = ({ raw, forecast, attendance }) => {
  const { pulse30, prior30, overdue, cashflow, activeStudents, churnOpen, leadPipeline } = raw;

  const kpis = [];

  // --- 1. Bu oy kirim ---------------------------------------------------
  // Oy YARIM o'tgan bo'lsa jami kirimni o'tgan oynikiga taqqoslash
  // noto'g'ri bo'lardi. Shuning uchun taqqoslash PROYEKSIYA bo'yicha:
  // "shu tezlikda oy oxirida qancha bo'ladi".
  const lastMonthCollected = raw.lastMonthCollected;
  kpis.push({
    key: "cashIn",
    label: "Bu oy kirim",
    value: cashflow.inflow,
    unit: "so'm",
    delta:
      lastMonthCollected > 0
        ? Math.round(((cashflow.projectedInflow - lastMonthCollected) / lastMonthCollected) * 100)
        : null,
    hint: `oyning ${Math.round(cashflow.monthProgress * 100)}% i o'tdi`,
    why:
      cashflow.outflow > 0
        ? `Maosh chiqimi ${fmtMoney(cashflow.outflow)} so'm — sof qoldiq ${fmtMoney(cashflow.net)} so'm.`
        : "Bu oyda maosh to'lovi hali yozilmagan.",
    next: `Shu tezlikda oy oxirigacha ~${fmtMoney(Math.round(cashflow.projectedInflow))} so'm kutilmoqda.`,
    href: "/owner/finance/accounting",
  });

  // --- 2. Muddati o'tgan qarz -------------------------------------------
  const overdueShare =
    cashflow.projectedInflow > 0 ? overdue.amount / cashflow.projectedInflow : null;
  kpis.push({
    key: "overdue",
    label: "Muddati o'tgan qarz",
    value: overdue.amount,
    unit: "so'm",
    delta: null,
    hint: overdue.students ? `${overdue.students} o'quvchi` : "qarzdor yo'q",
    why: overdue.maxDebtDays
      ? `Eng eski qarzning muddati ${overdue.maxDebtDays} kun oldin o'tgan.`
      : "Barcha tugagan davrlar yopilgan.",
    next:
      overdueShare > 0.02
        ? `Yig'ilsa bu oy kirimi ${Math.round(overdueShare * 100)}% ga oshadi.`
        : "Kirimga sezilarli ta'sir qilmaydi.",
    href: "/owner/students/qarzdorlar",
  });

  // --- 3. Davomat --------------------------------------------------------
  const attRate = pct(pulse30.attendance.rate);
  const priorRate = pct(prior30.attendance.rate);
  kpis.push({
    key: "attendance",
    label: "Davomat (30 kun)",
    value: attRate,
    unit: "%",
    delta: delta(pulse30.attendance.rate, prior30.attendance.rate),
    hint: `${pulse30.attendance.marked} yozuv`,
    why:
      pulse30.attendance.absent > 0
        ? `${pulse30.attendance.absent} dars sababsiz qoldirilgan.`
        : "Sababsiz qoldirilgan dars yo'q.",
    next:
      attendance && !attendance.insufficient && attendance.expectedRate != null
        ? `Keyingi 7 kunda ~${pct(attendance.expectedRate)}% kutilmoqda (${attendance.expectedAbsent} kelmasligi mumkin).`
        : priorRate != null
          ? "Naqsh hisoblanishi uchun ma'lumot yig'ilmoqda."
          : "Davomat yozuvlari hali yetarli emas.",
    href: "/owner/attendance",
  });

  // --- 4. Faol o'quvchilar -----------------------------------------------
  const net = pulse30.students.joined - pulse30.students.left;
  kpis.push({
    key: "students",
    label: "Faol o'quvchilar",
    value: activeStudents,
    unit: "ta",
    delta: null,
    hint: `+${pulse30.students.joined} / −${pulse30.students.left} (30 kun)`,
    why:
      net < 0
        ? `Oxirgi 30 kunda baza ${Math.abs(net)} taga qisqardi.`
        : net > 0
          ? `Oxirgi 30 kunda baza ${net} taga o'sdi.`
          : "Oxirgi 30 kunda baza o'zgarmadi.",
    next:
      churnOpen > 0 && activeStudents > 0
        ? `${churnOpen} o'quvchi ketish xavfida — hammasi ketsa baza ${Math.round((churnOpen / activeStudents) * 100)}% qisqaradi.`
        : "Ketish xavfi ro'yxati bo'sh.",
    href: "/owner/students",
  });

  // --- 5. Keyingi oy bashorati -------------------------------------------
  // FAQAT aniq filial tanlanganda. "Barcha filiallar" rejimida bashorat
  // hisoblanmaydi (turli narxlar aralashadi), shuning uchun karta
  // umuman chizilmaydi - bo'sh karta ko'rsatishdan yaxshiroq.
  if (forecast) {
    kpis.push({
      key: "forecastGross",
      label: "Keyingi oy bashorati",
      value: Math.round(forecast.forecastGross),
      unit: "so'm",
      delta: Math.round(forecast.deltaRatio * 100),
      hint: `${forecast.activeStudents} faol o'quvchi`,
      why:
        forecast.atRisk > 0
          ? `Ketish xavfi hisobga olingan: −${fmtMoney(Math.round(forecast.atRisk))} so'm.`
          : "Ketish xavfi topilmadi — baza to'liq hisoblandi.",
      next: `Tarixiy yig'ish darajasi ${pct(forecast.collectionRate)}% — real kutilma ${fmtMoney(Math.round(forecast.forecastNet))} so'm.`,
      href: "/owner/finance/accounting",
    });
  }

  // --- 6. Lid konversiyasi ------------------------------------------------
  // Oyna 60 kun: 30 kunlik lid soni ko'p markazlarda 20 tadan kam va
  // bunday namunada konversiya har hafta 15% ga sakraydi.
  const created = pulse30.leads.created + prior30.leads.created;
  const enrolled = pulse30.leads.enrolled + prior30.leads.enrolled;
  const conversion = created >= 5 ? enrolled / created : null;
  kpis.push({
    key: "conversion",
    label: "Lid konversiyasi",
    value: conversion == null ? null : pct(conversion),
    unit: "%",
    delta:
      prior30.leads.created >= 5 && pulse30.leads.created >= 5
        ? delta(
            pulse30.leads.enrolled / pulse30.leads.created,
            prior30.leads.enrolled / prior30.leads.created,
          )
        : null,
    hint: created ? `60 kunda ${created} liddan ${enrolled} tasi` : "lid kelmadi",
    why: leadPipeline.overdue
      ? `${leadPipeline.overdue} lid bilan bog'lanish muddati o'tgan.`
      : `${leadPipeline.open} lid navbatda kutmoqda.`,
    next:
      conversion != null
        ? `Har 10 ta yangi lid ~${Math.round(conversion * 10)} o'quvchi keltiradi.`
        : "Konversiya uchun lid soni yetarli emas.",
    href: "/owner/leads",
  });

  return kpis;
};

/**
 * BASHORAT BLOKI - daromad va davomat.
 *
 * DIAGRAMMA QOIDASI: tarixiy ustunlar HAQIQATDA YIG'ILGAN pulni
 * ko'rsatadi, shuning uchun bashorat ustuni ham NET (yig'ish darajasiga
 * ko'paytirilgan) bo'lishi shart. Yalpi (gross) bashoratni yig'ilgan
 * pul yoniga qo'yish diagrammani sun'iy o'sib borayotgan qilib
 * ko'rsatardi - va bu eng yomon turdagi yolg'on: ko'zga ishonarli
 * ko'rinadigan yolg'on.
 */
const buildForecastBlock = async ({ now, forecast, attendance }) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const collected = await collectedByMonth(7, now);
  const byKey = new Map(collected.map((r) => [r.key, r]));

  // Oxirgi 5 TUGAGAN oy. Joriy oy ATAYLAB yo'q: u yarim to'lgan va
  // to'liq oylar yonida "daromad tushib ketdi" degan yolg'on ko'rinish
  // berardi. Joriy oy KPI kartasida o'z konteksti bilan turadi.
  const history = [5, 4, 3, 2, 1]
    .map((back) => shiftMonth(year, month, -back))
    .map((p) => {
      const key = monthKey(p);
      const row = byKey.get(key);
      return {
        key,
        label: monthNameUz(p.month),
        amount: row?.amount || 0,
        transactions: row?.count || 0,
        isForecast: false,
      };
    });

  const nextPeriod = shiftMonth(year, month, 1);

  return {
    revenue: {
      history,
      next: forecast
        ? {
            key: monthKey(nextPeriod),
            label: monthNameUz(nextPeriod.month),
            // Diagramma NET ustunni chizadi (yuqoridagi izohga qarang),
            // gross esa tafsilotda ko'rsatiladi.
            amount: Math.round(forecast.forecastNet),
            gross: Math.round(forecast.forecastGross),
            atRisk: Math.round(forecast.atRisk),
            riskyStudents: forecast.riskyStudents,
            activeStudents: forecast.activeStudents,
            collectionRate: pct(forecast.collectionRate),
            collectionSample: forecast.collectionSample,
            isForecast: true,
          }
        : null,
      // O'tgan oy bilan taqqoslash - bashorat ustunining o'sish/pasayish
      // belgisi shundan chiqadi.
      lastActual: history[history.length - 1]?.amount || 0,
    },
    attendance,
  };
};

/**
 * AI KUNLIK XULOSA - sahifaning eng tepasidagi uch jumla.
 *
 * NEGA `headline` DAN BOSHQA: eski `headline` uchta bo'lim izohini
 * BIRLASHTIRARDI, ya'ni pastdagi matnni so'zma-so'z takrorlardi.
 * Bu xulosa esa boshqa savolga javob beradi - "bugun eng muhim narsa
 * nima va uni kim hal qiladi".
 *
 * UCH JUMLADAN OSHMAYDI. To'rtinchi jumla qo'shilishi bilan bu blok
 * "paragraf" ga aylanadi va owner uni o'qimay o'tib ketadi - aynan
 * shundan qochish uchun qayta ishlandi.
 */
const buildSummary = ({ counts, risks, opportunities, health, today, overdue }) => {
  const urgent = counts.high;
  const level = urgent > 0 ? "critical" : counts.medium > 0 ? "warning" : "good";

  const lines = [];

  // 1-jumla: HOLAT. Nechta ish va qanchalik shoshilinch.
  if (urgent > 0) {
    lines.push(`Bugun ${urgent} ta shoshilinch ish bor.`);
  } else if (counts.medium > 0) {
    lines.push(`Shoshilinch ish yo'q, ${counts.medium} ta vazifa navbatda.`);
  } else {
    lines.push("Shoshilinch ish yo'q — ko'rsatkichlar normal doirada.");
  }

  // 2-jumla: PUL yoki eng katta muammo. Owner uchun "nega bu muhim".
  const top = risks[0];
  if (counts.impactAtRisk > 0 && top) {
    lines.push(
      `Jami ${fmtMoney(counts.impactAtRisk)} so'm xavf ostida, eng kattasi — ${top.subjectLabel}.`,
    );
  } else if (counts.impactAtRisk > 0) {
    lines.push(`Jami ${fmtMoney(counts.impactAtRisk)} so'm xavf ostida.`);
  } else if (overdue?.amount > 0) {
    lines.push(`${fmtMoney(overdue.amount)} so'm eski qarz hali yig'ilmagan.`);
  } else if (today?.lessons?.unmarkedGroups?.length) {
    lines.push(`${today.lessons.unmarkedGroups.length} guruhda davomat belgilanmagan.`);
  }

  // 3-jumla: ZAIF NUQTA yoki imkoniyat. Kunning "keyingi qadami".
  const weakest = (health?.domains || [])
    .filter((d) => d.score != null)
    .sort((a, b) => a.score - b.score)[0];

  if (weakest && weakest.score < 60) {
    lines.push(`Eng zaif yo'nalish — ${weakest.label} (${weakest.score}): ${weakest.note}`);
  } else if (counts.opportunities > 0 && counts.upside > 0) {
    lines.push(
      `${counts.opportunities} ta o'sish imkoniyati ham topildi — taxminan ${fmtMoney(counts.upside)} so'm.`,
    );
  } else if (opportunities.length > 0) {
    lines.push(`${opportunities.length} ta o'sish imkoniyati ham topildi.`);
  }

  // BIRLAMCHI HARAKAT - sahifadagi YAGONA to'q tugma.
  //
  // Nega bitta: ikkita teng ko'rinishdagi tugma "qaysi birini bosay"
  // degan pauza yaratadi, va o'sha pauza owner'ning sahifadan chiqib
  // ketishiga yetarli. Manzil eng ustuvor xavfning manba havolasidan
  // olinadi - u aynan muammo turgan ekranga olib boradi.
  const primaryAction = top
    ? {
        label: top.recommendedActions?.[0]?.label || `${top.subjectLabel} bilan ishlash`,
        href: top.sourceRefs?.[0]?.href || top.subjectHref || "/owner/ai/tasks",
        insightId: String(top._id),
      }
    : null;

  return { level, text: lines.join(" "), primaryAction };
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
  const [yesterday, today, now4, lastRun, health, attendance] = await Promise.all([
    buildYesterday(now),
    buildToday(now),
    buildNow(actionLimit),
    prisma.aiRun.findFirst({
      where: { ...branchFilter(), status: "ok" },
      orderBy: { startedAt: "desc" },
      select: {
        startedAt: true,
        finishedAt: true,
        scope: true,
        trigger: true,
        durationMs: true,
      },
    }),
    businessHealth(now),
    attendanceOutlook(now),
  ]);

  const next = branchId ? await buildNext(branchId, now) : null;

  // Bashorat bloki KPI'lardan OLDIN quriladi: "bu oy kirim" kartasining
  // o'zgarish foizi o'tgan TUGAGAN oy bilan taqqoslanadi va o'sha son
  // aynan shu yerda hisoblanadi. Ikkinchi marta so'rash bir xil javob
  // uchun ikkinchi aggregation bo'lardi.
  const forecast = await buildForecastBlock({
    now,
    forecast: next?.forecast || null,
    attendance,
  });

  const kpis = buildKpis({
    raw: { ...health.raw, lastMonthCollected: forecast.revenue.lastActual },
    forecast: next?.forecast || null,
    attendance,
  });

  const summary = buildSummary({
    counts: now4.counts,
    risks: now4.risks,
    opportunities: now4.opportunities,
    health,
    today,
    overdue: health.raw.overdue,
  });

  const branch = branchId
    ? await prisma.branch.findUnique({
        where: { id: String(branchId) },
        // ⚠ `id` ATAYLAB: javobdagi `branch._id` shu yerdan keladi.
        select: { id: true, name: true },
      })
    : null;

  // `health.raw` MIJOZGA UZATILMAYDI: u ichki hisob materiali (ikkita
  // to'liq puls kesimi) va javob hajmini bekorga ikki barobar oshirardi.
  const { raw: _healthRaw, ...healthPublic } = health;

  return {
    generatedAt: now,
    branch: branch ? { _id: branch.id, name: branch.name } : null,
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

    // --- IJROIYA QATLAMI (birinchi ekran) ---
    //
    // TARTIB DASHBOARDDAGI TARTIB BILAN BIR XIL: xulosa → KPI →
    // salomatlik → bashorat. Javob shaklini ekran shakliga moslash
    // frontend'ni "ma'lumotni qayta joylashtiruvchi" bo'lishdan
    // saqlaydi: u shunchaki chizadi.
    summary,
    kpis,
    health: healthPublic,
    forecast,

    // --- TAFSILOT QATLAMI (pastki bo'limlar va boshqa sahifalar) ---
    yesterday,
    today,
    next,
    now: now4,
  };
};
