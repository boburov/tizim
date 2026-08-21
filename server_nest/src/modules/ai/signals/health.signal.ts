import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PulseSignalService } from './pulse.signal.js';
import { FinanceSignalService } from './finance.signal.js';

import {
  branchFilter,
  userBranchCondition,
} from "../../../common/als/branch-context.js";
import { localDayStart, DAY_MS } from './pulse.signal.js';

/** BIZNES SALOMATLIGI — `signals/health.signal.js` ning ko'chirmasi. */
const HEALTH_WEIGHTS: any = {
  finance: 0.3,
  students: 0.3,
  teachers: 0.2,
  marketing: 0.1,
  sales: 0.1,
};

const clamp = (n: any,min: any = 0,max: any = 100) => Math.max(min, Math.min(max, n));

const pct = (v: any) => (v == null ? null : Math.round(v * 100));

// --- MOLIYA -----------------------------------------------------------
//
// Uch savol: pul KELDIMI (yig'ish darajasi), qancha pul OSILIB qoldi
// (qarz), va oy ichida kirim chiqimni QOPLAYAPTIMI (kassa).

// --- O'QUVCHILAR ------------------------------------------------------
//
// Uch savol: darsga KELISHYAPTIMI, soni O'SYAPTIMI, va qanchasi ketish
// arafasida.

// --- O'QITUVCHILAR ----------------------------------------------------
//
// Uch savol: darsga CHIQYAPTIMI, ular haqida SHIKOYAT bormi, shikoyatlar
// YOPILYAPTIMI.

// --- MARKETING --------------------------------------------------------
//
// Ikki savol: yangi lid OQIMI o'sdimi, va u bazaga nisbatan YETARLIMI.

// --- SOTUV ------------------------------------------------------------
//
// Ikki savol: lid o'quvchiga AYLANYAPTIMI, va navbatdagi lidlar bilan
// VAQTIDA bog'lanilyaptimi.

@Injectable()
export class HealthSignalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly pulse: PulseSignalService,
    private readonly finance: FinanceSignalService,
  ) {}

  /**
   * Og'irlikli o'rtacha - `null` qismlar TASHLAB YUBORILADI va ularning
   * og'irligi qolganlarga qayta taqsimlanadi.
   *
   * @param {Array<{value: number|null, weight: number}>} parts
   * @returns {number|null} null = birorta ham qism hisoblanmadi
   */
  private blend(parts: any) {
  const usable = parts.filter((p: any) => p.value != null && Number.isFinite(p.value));
  if (!usable.length) return null;
  const total = usable.reduce((s: any,p: any) => s + p.weight, 0);
  if (total <= 0) return null;
  return Math.round(usable.reduce((s: any,p: any) => s + p.value * p.weight, 0) / total);
}

  /**
   * Ball → daraja. UI rangni SHU YERDAN oladi, o'zi qayta hisoblamaydi -
   * aks holda chegaralar ikki joyda yashab, jimgina ayrilib ketardi.
   */
  healthLevel(score: any) {
  if (score == null) return "unknown";
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

  /** Chiziqli normallashtirish: `good` qiymatda 100, `bad` qiymatda 0. */
  private scale(value: any,bad: any,good: any) {
  if (value == null || !Number.isFinite(value)) return null;
  if (good === bad) return null;
  return clamp(((value - bad) / (good - bad)) * 100);
}

  /**
   * BESHTA YO'NALISH BO'YICHA SALOMATLIK.
   *
   * MUHIM: filial kontekstI ICHIDA chaqirilishi kerak - barcha so'rovlar
   * branchFilter() / userBranchCondition() orqali ko'lamlanadi.
   *
   * @param {Date} now
   * @returns {Promise<{overall: object, domains: object[]}>}
   */
  async businessHealth(now = new Date()) {
  const todayStart = localDayStart(now);
  const win30 = { start: new Date(todayStart.getTime() - 30 * DAY_MS), end: todayStart };
  const win60 = { start: new Date(todayStart.getTime() - 60 * DAY_MS), end: win30.start };

  const userCond = userBranchCondition();
  // `$and` -> `AND`: `userBranchCondition()` endi PRISMA shaklini
  // qaytaradi va uni `$and` ichiga solish Prisma uchun noma'lum kalit
  // bo'lardi (xato bermay, filtr JIMGINA qo'llanmasdi).
  const withUserBranch = (base: any) => (userCond ? { AND: [base, userCond] } : base);

  const [
    pulse30,
    prior30,
    collection,
    overdue,
    cashflow,
    teacherCount,
    activeStudents,
    churnOpen,
    leadPipeline,
  ] = await Promise.all([
    this.pulse.periodPulse(win30),
    this.pulse.periodPulse(win60),
    this.finance.historicalCollectionRate(now),
    this.finance.overdueSignal(now),
    this.finance.cashflowSignal(now),
    this.prisma.user.count({
      where: withUserBranch({
        role: "teacher",
        isActive: true,
        isDeleted: false,
      }),
    }),
    this.activeStudentCount(),
    this.prisma.insight.count({
      where: {
        ...branchFilter(),
        kind: "student_churn_risk",
        status: { in: ["open", "acked"] },
      },
    }),
    this.openLeadDiscipline(todayStart),
  ]);

  const domains = [
    this.financeDomain({ collection, overdue, cashflow }),
    this.studentDomain({ pulse30, activeStudents, churnOpen }),
    this.teacherDomain({ pulse30, teacherCount, activeStudents }),
    this.marketingDomain({ pulse30, prior30, activeStudents }),
    this.salesDomain({ pulse30, prior30, leadPipeline }),
  ];

  const overall = this.blend(
    domains.map((d) => ({ value: d.score, weight: HEALTH_WEIGHTS[d.key] })),
  );

  return {
    overall: {
      score: overall,
      level: this.healthLevel(overall),
      // Nechta yo'nalish haqiqatan hisoblandi - "72 ball" ning ostidagi
      // asos. 5 dan 2 tasi bo'lsa owner buni bilishi kerak.
      covered: domains.filter((d) => d.score != null).length,
      total: domains.length,
    },
    domains,
    // XOM AGREGATLAR - brifing KPI kartalarini SHU YERDAN quradi.
    //
    // Nega qaytariladi: KPI'lar ham, ballar ham AYNAN bir xil sonlarga
    // tayanadi (30 kunlik puls, qarz, kassa, faol o'quvchilar). Ularni
    // ikki marta so'rash bir xil javob uchun ikki barobar yuklama
    // bo'lardi - va yomoni, ikki so'rov orasida ma'lumot o'zgarsa
    // "Moliya 48" bali yonidagi KPI boshqa raqam ko'rsatardi.
    //
    // Bu blok mijozga UZATILMAYDI (briefing.service uni ishlatib,
    // javobdan chiqarib tashlaydi) - u ichki hisob-kitob materiali.
    raw: {
      pulse30,
      prior30,
      collection,
      overdue,
      cashflow,
      teacherCount,
      activeStudents,
      churnOpen,
      leadPipeline,
      window: win30,
    },
  };
}

  /** Filialdagi faol o'quvchilar soni (ochiq guruh a'zoligi bo'yicha). */
  private async activeStudentCount() {
  const groups = await this.prisma.group.findMany({
    where: { ...branchFilter(), isDeleted: false, isActive: true },
    select: { id: true },
  });
  if (!groups.length) return 0;
  // `distinct("student")` o'rni: `distinct: ["studentId"]`.
  const rows = await this.prisma.groupMembership.findMany({
    where: {
      groupId: { in: groups.map((g) => g.id) },
      leftAt: null,
      isDeleted: false,
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.length;
}

  /** Ochiq lidlar va ulardan qanchasining bog'lanish muddati o'tgan. */
  private async openLeadDiscipline(todayStart: any) {
  const base: any = { ...branchFilter(), status: { notIn: ["enrolled", "rejected"] } };
  const [open, overdue] = await Promise.all([
    this.prisma.lead.count({ where: base }),
    // `followUpAt` NULLABLE -> `not: null` ruxsat etilgan; `not` va `lt`
    // BIR obyektda birga turadi.
    this.prisma.lead.count({
      where: { ...base, followUpAt: { not: null, lt: todayStart } },
    }),
  ]);
  return { open, overdue };
}

  private financeDomain({ collection, overdue, cashflow }: any) {
  // Oxirgi 3 tugagan oyning O'RTACHA kutilgan daromadi - qarzni shunga
  // nisbatan o'lchaymiz. "12 mln qarz" o'zi hech narsa demaydi: oylik
  // aylanmasi 15 mln bo'lsa bu falokat, 300 mln bo'lsa shovqin.
  const monthlyExpected =
    collection.months > 0 ? collection.expected / collection.months : 0;

  const collectionScore = collection.months > 0 ? pct(collection.rate) : null;

  // Bir OYLIK aylanmaga teng qarz = 0 ball. Yarmi = 50 ball.
  const overdueRatio = monthlyExpected > 0 ? overdue.amount / monthlyExpected : null;
  const overdueScore = this.scale(overdueRatio, 1, 0);

  // Kassa: joriy oyda kirim chiqimdan ko'pmi. Nisbat 1.0 = tenglashgan.
  const cashRatio =
    cashflow.outflow > 0 ? cashflow.inflow / cashflow.outflow : cashflow.inflow > 0 ? 2 : null;
  // 0.8 da (chiqim kirimdan 25% ko'p) 0 ball, 1.3 da to'liq ball.
  const cashScore = this.scale(cashRatio, 0.8, 1.3);

  const drivers = [];
  if (collectionScore != null) {
    drivers.push({ label: "Yig'ish darajasi", value: `${collectionScore}%` });
  }
  if (overdue.amount > 0) {
    drivers.push({ label: "Muddati o'tgan qarz", value: overdue.amount, unit: "so'm" });
  }
  if (cashRatio != null) {
    drivers.push({
      label: "Kirim / chiqim",
      value: `${Math.round(cashRatio * 100)}%`,
    });
  }

  return {
    key: "finance",
    label: "Moliya",
    score: this.blend([
      { value: collectionScore, weight: 0.45 },
      { value: overdueScore, weight: 0.35 },
      { value: cashScore, weight: 0.2 },
    ]),
    note: this.financeNote({ collectionScore, overdue, cashRatio }),
    drivers,
    href: "/owner/finance/accounting",
  };
}

  private financeNote({ collectionScore, overdue, cashRatio }: any) {
  if (collectionScore == null && !overdue.amount) return "Moliya tarixi hali yig'ilmagan.";
  if (cashRatio != null && cashRatio < 1) {
    return "Bu oyda chiqim kirimdan oshdi — qarz yig'ishni tezlashtiring.";
  }
  if (overdue.students > 0) {
    return `${overdue.students} o'quvchining to'lovi muddatidan kechikkan.`;
  }
  if (collectionScore != null && collectionScore < 90) {
    return `Kutilgan to'lovlarning ${100 - collectionScore}% i yig'ilmay qolmoqda.`;
  }
  return "To'lovlar rejadagidek yig'ilmoqda.";
}

  private studentDomain({ pulse30, activeStudents, churnOpen }: any) {
  // Kamida 20 ta yozuv bo'lmasa davomat foizi tasodifiy son.
  const attendanceScore =
    pulse30.attendance.marked >= 20 ? pct(pulse30.attendance.rate) : null;

  const net = pulse30.students.joined - pulse30.students.left;
  // Bazaning 5% iga teng oylik o'sish = to'liq ball, 5% qisqarish = 0.
  const netRatio = activeStudents > 0 ? net / activeStudents : null;
  const flowScore = this.scale(netRatio, -0.05, 0.05);

  // Bazaning 15% i ketish xavfida = 0 ball. Bu qattiq chegara: o'quv
  // markazida har oyda 15% o'quvchi ketsa biznes bir yilda yopiladi.
  const churnRatio = activeStudents > 0 ? churnOpen / activeStudents : null;
  const churnScore = this.scale(churnRatio, 0.15, 0);

  const drivers = [];
  if (attendanceScore != null) {
    drivers.push({ label: "Davomat", value: `${attendanceScore}%` });
  }
  drivers.push({
    label: "30 kunlik oqim",
    value: `${net >= 0 ? "+" : "−"}${Math.abs(net)}`,
  });
  if (churnOpen > 0) {
    drivers.push({ label: "Ketish xavfida", value: `${churnOpen} ta` });
  }

  return {
    key: "students",
    label: "O'quvchilar",
    score: this.blend([
      { value: attendanceScore, weight: 0.4 },
      { value: flowScore, weight: 0.3 },
      { value: churnScore, weight: 0.3 },
    ]),
    note: this.studentNote({ attendanceScore, net, churnOpen, pulse30 }),
    drivers,
    href: "/owner/students",
  };
}

  private studentNote({ attendanceScore, net, churnOpen, pulse30 }: any) {
  if (attendanceScore == null && !pulse30.students.joined && !pulse30.students.left) {
    return "Oxirgi 30 kunda harakat qayd etilmadi.";
  }
  if (net < 0) {
    return `30 kunda ${pulse30.students.left} o'quvchi ketdi, ${pulse30.students.joined} tasi qo'shildi.`;
  }
  if (churnOpen > 0) {
    return `${churnOpen} o'quvchi ketish xavfi ro'yxatida — ular bilan ishlash kerak.`;
  }
  if (attendanceScore != null && attendanceScore < 85) {
    return `Har 100 darsdan ${100 - attendanceScore} tasi qoldirilmoqda.`;
  }
  return "O'quvchilar bazasi barqaror.";
}

  private teacherDomain({ pulse30, teacherCount, activeStudents }: any) {
  const misses = pulse30.teachers.hrAbsences + pulse30.teachers.missedLessons;
  // Har bir o'qituvchiga oyiga 3 ta o'tkazilmagan dars = 0 ball.
  const perTeacher = teacherCount > 0 ? misses / teacherCount : null;
  const reliabilityScore = this.scale(perTeacher, 3, 0);

  // Har 100 o'quvchiga 5 ta shikoyat = 0 ball.
  const per100 = activeStudents > 0 ? (pulse30.complaints.created / activeStudents) * 100 : null;
  const complaintScore = this.scale(per100, 5, 0);

  const unresolved = pulse30.complaints.created - pulse30.complaints.resolved;
  const resolutionScore =
    pulse30.complaints.created >= 3
      ? pct(pulse30.complaints.resolved / pulse30.complaints.created)
      : null;

  const drivers = [];
  if (teacherCount > 0) {
    drivers.push({ label: "O'qituvchilar", value: `${teacherCount} ta` });
  }
  if (misses > 0) {
    drivers.push({ label: "O'tkazilmagan dars", value: `${misses} ta` });
  }
  if (pulse30.complaints.created > 0) {
    drivers.push({
      label: "Shikoyatlar",
      value: `${pulse30.complaints.created} ta`,
    });
  }

  return {
    key: "teachers",
    label: "O'qituvchilar",
    score: this.blend([
      { value: reliabilityScore, weight: 0.45 },
      { value: complaintScore, weight: 0.35 },
      { value: resolutionScore, weight: 0.2 },
    ]),
    note: this.teacherNote({ teacherCount, misses, unresolved, pulse30 }),
    drivers,
    href: "/owner/teachers",
  };
}

  private teacherNote({ teacherCount, misses, unresolved, pulse30 }: any) {
  if (!teacherCount) return "Filialda faol o'qituvchi topilmadi.";
  if (misses > 0) {
    return `30 kunda ${misses} dars o'tkazilmadi (${pulse30.teachers.affectedTeachers} o'qituvchi).`;
  }
  if (unresolved > 0) {
    return `${unresolved} shikoyat hali yopilmagan.`;
  }
  return "Darslar jadval bo'yicha o'tmoqda.";
}

  private marketingDomain({ pulse30, prior30, activeStudents }: any) {
  const created = pulse30.leads.created;
  const before = prior30.leads.created;

  const trend = before > 0 ? (created - before) / before : null;
  // −25% = 0 ball, +25% = 100 ball.
  const trendScore = this.scale(trend, -0.25, 0.25);

  // Oyiga bazaning 12% iga teng yangi lid = sog'lom voronka. Sabab:
  // o'quv markazida oylik chiqib ketish odatda 4-8%, ya'ni shunchasini
  // qoplash uchun konversiyani hisobga olib 2 barobar ko'p lid kerak.
  const coverage = activeStudents > 0 ? created / activeStudents : null;
  const coverageScore = this.scale(coverage, 0, 0.12);

  const drivers = [
    { label: "30 kunlik lid", value: `${created} ta` },
    ...(before > 0
      ? [{ label: "Oldingi 30 kun", value: `${before} ta` }]
      : []),
  ];

  return {
    key: "marketing",
    label: "Marketing",
    score: this.blend([
      { value: trendScore, weight: 0.5 },
      { value: coverageScore, weight: 0.5 },
    ]),
    note: this.marketingNote({ created, before, trend }),
    drivers,
    href: "/owner/leads/statistika",
  };
}

  private marketingNote({ created, before, trend }: any) {
  if (!created && !before) return "Oxirgi 60 kunda yangi lid kelmadi.";
  if (trend != null && trend <= -0.2) {
    return `Lid oqimi ${Math.abs(Math.round(trend * 100))}% pasaydi — reklamani tekshiring.`;
  }
  if (trend != null && trend >= 0.2) {
    return `Lid oqimi ${Math.round(trend * 100)}% oshdi.`;
  }
  return `Oxirgi 30 kunda ${created} ta yangi lid keldi.`;
}

  private salesDomain({ pulse30, prior30, leadPipeline }: any) {
  const created = pulse30.leads.created + prior30.leads.created;
  const enrolled = pulse30.leads.enrolled + prior30.leads.enrolled;

  // 5 tadan kam lid ustida konversiya hisoblash yolg'on aniqlik.
  const conversion = created >= 5 ? enrolled / created : null;
  // 30% konversiya = to'liq ball (o'quv markazi uchun kuchli natija).
  const conversionScore = this.scale(conversion, 0, 0.3);

  // Muddati o'tgan bog'lanishlar ulushi: yarmi o'tgan bo'lsa 0 ball.
  const overdueShare = leadPipeline.open > 0 ? leadPipeline.overdue / leadPipeline.open : null;
  const disciplineScore = this.scale(overdueShare, 0.5, 0);

  const drivers = [];
  if (conversion != null) {
    drivers.push({ label: "Konversiya", value: `${pct(conversion)}%` });
  }
  drivers.push({ label: "Ochiq lid", value: `${leadPipeline.open} ta` });
  if (leadPipeline.overdue > 0) {
    drivers.push({ label: "Muddati o'tgan", value: `${leadPipeline.overdue} ta` });
  }

  return {
    key: "sales",
    label: "Sotuv",
    score: this.blend([
      { value: conversionScore, weight: 0.6 },
      { value: disciplineScore, weight: 0.4 },
    ]),
    note: this.salesNote({ conversion, created, enrolled, leadPipeline }),
    drivers,
    href: "/owner/leads",
  };
}

  private salesNote({ conversion, created, enrolled, leadPipeline }: any) {
  if (conversion == null) return "Konversiya uchun lid soni yetarli emas.";
  if (leadPipeline.overdue > 0) {
    return `${leadPipeline.overdue} lid bilan bog'lanish muddati o'tgan.`;
  }
  if (conversion < 0.15) {
    return `60 kunda ${created} liddan ${enrolled} tasi yozildi — voronkani ko'rib chiqing.`;
  }
  return `Har 100 liddan ${pct(conversion)} tasi o'quvchiga aylanmoqda.`;
}
}