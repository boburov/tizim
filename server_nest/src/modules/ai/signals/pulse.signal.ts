import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

import { Prisma } from "@prisma/client";
import { GROUP_DAYS } from "../../../common/constants/calendar.js";
import { branchFilter } from "../../../common/als/branch-context.js";

/** PULS SIGNALLARI — `signals/pulse.signal.js` ning ko'chirmasi. */
const num = (v: any) => Number(v) || 0;

/**
 * FILIAL KO'LAMI XOM SQL UCHUN — `finance.signal.js` bilan bir xil.
 *
 * `branchMatchStage()` Mongo quvurining `$match` bosqichi edi va endi
 * PRISMA shaklini qaytaradi, ya'ni quvurga spread qilingan eski kod
 * "Arguments must be aggregate pipeline operators" bilan yiqilardi.
 * Xom SQL'da esa `where` obyekti umuman ishlamaydi.
 *
 * FAIL-CLOSED: bo'sh ro'yxat `AND FALSE` beradi.
 */
const rawBranchClause = () => {
  const bf = branchFilter();
  if (!Object.keys(bf).length) return Prisma.empty;
  const v: any = bf.branchId;
  if (typeof v === "string") return Prisma.sql` AND "branchId" = ${v}`;
  if (v?.in) {
    if (!v.in.length) return Prisma.sql` AND FALSE`;
    return Prisma.sql` AND "branchId" IN (${Prisma.join(v.in)})`;
  }
  return Prisma.empty;
};

/** `IN (...)` bo'lagi - bo'sh ro'yxatda `FALSE` (fail-closed). */
const inIds = (col: any,ids: any) =>
  ids.length
    ? Prisma.sql`${Prisma.raw(`"${col}"`)} IN (${Prisma.join(ids)})`
    : Prisma.sql`FALSE`;

// PULS - bitta VAQT ORALIG'I bo'yicha kesim.
//
// NEGA BITTA UMUMIY FUNKSIYA: "kecha nima bo'ldi", "bu hafta nima bo'ldi"
// va "bu oy nima bo'ldi" - bir xil savol, faqat oyna boshqa. Uchta alohida
// hisobot yozilsa, ularning raqamlari ertami-kechmi bir-biriga zid bo'lib
// qoladi (biri excused'ni hisoblaydi, ikkinchisi yo'q) va owner qaysi
// biriga ishonishni bilmaydi. Bitta manba - bitta haqiqat.
//
// Oralig'i [start, end) - INKLYUZIV boshlanish, EKSKLYUZIV tugash.
// Kodbazadagi leftAt/endDate/effectiveFrom naqshi bilan bir xil.

const DAY_MS = 24 * 60 * 60 * 1000;

// Hafta kunlari - DUSHANBADAN boshlab, GROUP_DAYS bilan bir xil tartibda.
// Bitta manba: ilgari bu ro'yxat todaySnapshot ichida yashiringan edi va
// bashorat kodi uni qayta yozishga majbur bo'lardi.
export const WEEKDAY_LABELS_UZ = [
  "dushanba",
  "seshanba",
  "chorshanba",
  "payshanba",
  "juma",
  "shanba",
  "yakshanba",
];

/** Sanadan hafta kuni indeksi (0 = dushanba). */
const weekdayIndex = (d: any) => (new Date(new Date(d).getTime() + TZ_OFFSET_MS).getUTCDay() + 6) % 7;

// Toshkent vaqti bo'yicha kun boshi. Server UTC da bo'lishi mumkin,
// lekin "kecha" degan tushuncha MAHALLIY kun bo'yicha bo'lishi kerak -
// aks holda kechqurun 22:00 da kiritilgan davomat "ertaga" ga tushib
// ketardi va kunlik hisobot noto'g'ri chiqardi.
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Tashkent = UTC+5

export const localDayStart = (d: any) => {
  const shifted = new Date(new Date(d).getTime() + TZ_OFFSET_MS);
  const midnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnight - TZ_OFFSET_MS);
};

export const localDayKey = (d: any) => {
  const shifted = new Date(new Date(d).getTime() + TZ_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
};

/** Kechagi kun oralig'i. */
export const yesterdayWindow = (now = new Date()) => {
  const todayStart = localDayStart(now);
  return { start: new Date(todayStart.getTime() - DAY_MS), end: todayStart };
};

/** Bugungi kun oralig'i. */
export const todayWindow = (now = new Date()) => {
  const start = localDayStart(now);
  return { start, end: new Date(start.getTime() + DAY_MS) };
};

/** ISO hafta (dushanbadan) - o'tgan to'liq hafta. */
export const lastWeekWindow = (now = new Date()) => {
  const todayStart = localDayStart(now);
  const shifted = new Date(todayStart.getTime() + TZ_OFFSET_MS);
  // getUTCDay(): 0=yakshanba. Dushanbani 0 ga keltiramiz.
  const dow = (shifted.getUTCDay() + 6) % 7;
  const thisMonday = new Date(todayStart.getTime() - dow * DAY_MS);
  return { start: new Date(thisMonday.getTime() - 7 * DAY_MS), end: thisMonday };
};

/** O'tgan to'liq oy. */
export const lastMonthWindow = (now = new Date()) => {
  const shifted = new Date(localDayStart(now).getTime() + TZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1) - TZ_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1) - TZ_OFFSET_MS);
  return { start, end };
};

// `toId` OLIB TASHLANDI: u `new mongoose.Types.ObjectId(...)` edi va
// Postgres'da kerak emas (birlamchi kalit `VARCHAR(24)` — satrning
// o'zi). Hech qayerda import qilinmagan.
export { DAY_MS };

@Injectable()
export class PulseSignalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Bitta oraliq bo'yicha to'liq biznes kesimi.
   *
   * Har bir raqam MANBASI bilan birga qaytariladi (tranzaksiya soni, dars
   * soni) - hisobotda "12 mln so'm" yonida "48 to'lov" turishi kerak,
   * aks holda son tekshirilmaydigan bo'lib qoladi.
   */
  async periodPulse({ start, end }: any) {
  const groupIds = (
    await this.prisma.group.findMany({
      where: { ...branchFilter(), isDeleted: false },
      select: { id: true },
    })
  ).map((g) => g.id);

  const [
    revenueRows,
    expenseRows,
    attendanceRows,
    flowRows,
    leadRows,
    feedbackRows,
    teacherHrRows,
    teacherLessonRows,
  ]: any[] = await Promise.all([
    // DAROMAD: `$cond` bilan shartli yig'indi -> SQL `FILTER (WHERE ...)`.
    this.prisma.$queryRaw`
      SELECT
        COALESCE(SUM("amount"), 0)::float                                   AS amount,
        COUNT(*)::int                                                       AS count,
        COALESCE(SUM("amount") FILTER (WHERE "method" = 'cash'), 0)::float  AS cash,
        COALESCE(SUM("amount") FILTER (WHERE "method" = 'card'), 0)::float  AS card
      FROM "payment_transactions"
      WHERE "paidAt" >= ${start} AND "paidAt" < ${end}
      ${rawBranchClause()}
    `,
    this.prisma.$queryRaw`
      SELECT
        COALESCE(SUM("amount"), 0)::float AS amount,
        COUNT(*)::int                     AS count
      FROM "salary_transactions"
      WHERE "isDeleted" = false AND "paidAt" >= ${start} AND "paidAt" < ${end}
      ${rawBranchClause()}
    `,
    // DAVOMAT: status bo'yicha guruhlash - `groupBy` yetarli.
    groupIds.length
      ? this.prisma.attendance.groupBy({
          by: ["status"],
          where: {
            groupId: { in: groupIds },
            isDeleted: false,
            date: { gte: start, lt: end },
          },
          _count: { _all: true },
          _sum: { lateMinutes: true },
        })
      : [],
    // O'QUVCHI OQIMI: bitta qatorda to'rtta shartli sanoq.
    groupIds.length
      ? this.prisma.$queryRaw`
          SELECT
            COUNT(*) FILTER (WHERE "joinedAt" >= ${start} AND "joinedAt" < ${end})::int AS joined,
            COUNT(*) FILTER (WHERE "leftReason" = 'removed'
              AND "leftAt" >= ${start} AND "leftAt" < ${end})::int     AS left,
            COUNT(*) FILTER (WHERE "leftReason" = 'graduated'
              AND "leftAt" >= ${start} AND "leftAt" < ${end})::int     AS graduated,
            COUNT(*) FILTER (WHERE "leftReason" = 'transferred'
              AND "leftAt" >= ${start} AND "leftAt" < ${end})::int     AS transferred
          FROM "group_memberships"
          WHERE ${inIds("groupId", groupIds)} AND "isDeleted" = false
        `
      : [],
    this.prisma.$queryRaw`
      SELECT
        COUNT(*)::int                                          AS created,
        COUNT(*) FILTER (WHERE "status" = 'enrolled')::int      AS enrolled,
        COUNT(*) FILTER (WHERE "status" = 'rejected')::int      AS rejected
      FROM "leads"
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      ${rawBranchClause()}
    `,
    // MUROJAAT: `feedbacks` da `branchId` YO'Q - ko'lam GURUH orqali.
    this.prisma.$queryRaw`
      SELECT
        COUNT(*)::int                                       AS created,
        COUNT(*) FILTER (WHERE "status" = 'resolved')::int   AS resolved
      FROM "feedbacks"
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
        AND ${groupIds.length ? inIds("groupId", groupIds) : Prisma.sql`TRUE`}
    `,
    // `$addToSet: "$teacher"` + `.length` -> `COUNT(DISTINCT ...)`, lekin
    // pastda ikkala manbaning o'qituvchilari BIRLASHTIRILADI, shuning
    // uchun ID'lar ro'yxatining o'zi kerak (`ARRAY_AGG(DISTINCT ...)`).
    this.prisma.$queryRaw`
      SELECT
        COUNT(*)::int                        AS count,
        ARRAY_AGG(DISTINCT "teacherId")      AS teachers
      FROM "teacher_attendances"
      WHERE "isDeleted" = false AND "status" = 'absent'
        AND "date" >= ${start} AND "date" < ${end}
    `,
    groupIds.length
      ? this.prisma.$queryRaw`
          SELECT
            COUNT(*)::int                        AS count,
            ARRAY_AGG(DISTINCT "teacherId")      AS teachers
          FROM "teacher_absences"
          WHERE ${inIds("groupId", groupIds)} AND "isDeleted" = false
            AND "date" >= ${start} AND "date" < ${end}
        `
      : [],
  ]);

  const att = { present: 0, absent: 0, excused: 0, exempt: 0, lateMinutes: 0 };
  for (const r of attendanceRows) {
    // `groupBy` natijasida kalit `_id` emas, ustun nomi (`status`).
    (att as any)[r.status] = r._count._all;
    att.lateMinutes += r._sum.lateMinutes || 0;
  }
  // MAXRAJ: faqat present + absent. excused/exempt kiritilmaydi - sababli
  // qoldirilgan dars "yomon davomat" emas va uni maxrajga qo'shish
  // kasallik mavsumida davomatni yolg'on pasaytirardi. Bu qoida
  // student.signal.js va course.signal.js bilan AYNAN BIR XIL.
  const marked = att.present + att.absent;

  const rev = revenueRows[0] || {};
  const exp = expenseRows[0] || {};
  const flowRaw = flowRows[0] || {};
  const leadsRaw = leadRows[0] || {};
  const fbRaw = feedbackRows[0] || {};
  const thr = teacherHrRows[0] || {};
  const tlr = teacherLessonRows[0] || {};

  // Xom SQL sonlarni satr sifatida qaytarishi mumkin (bigint) - hamma
  // joyda `num()` bilan raqamga keltiriladi.
  const flow = {
    joined: num(flowRaw.joined),
    left: num(flowRaw.left),
    graduated: num(flowRaw.graduated),
    transferred: num(flowRaw.transferred),
  };
  const leads = {
    created: num(leadsRaw.created),
    enrolled: num(leadsRaw.enrolled),
    rejected: num(leadsRaw.rejected),
  };
  const fb = { created: num(fbRaw.created), resolved: num(fbRaw.resolved) };

  return {
    window: { start, end },
    revenue: {
      collected: num(rev.amount),
      transactions: num(rev.count),
      cash: num(rev.cash),
      card: num(rev.card),
    },
    expense: { salaryPaid: num(exp.amount), transactions: num(exp.count) },
    net: num(rev.amount) - num(exp.amount),
    attendance: {
      ...att,
      marked,
      rate: marked > 0 ? att.present / marked : null,
    },
    students: flow,
    leads,
    complaints: fb,
    teachers: {
      hrAbsences: num(thr.count),
      missedLessons: num(tlr.count),
      affectedTeachers: new Set(
        [...(thr.teachers || []), ...(tlr.teachers || [])].map(String),
      ).size,
    },
  };
}

  /**
   * BUGUN nima bo'layotgani - "hozir" kesimi.
   *
   * Bu puls emas (o'tmish kesimi emas), balki HOLAT: bugun nechta dars bor,
   * qanchasi belgilanmagan, kim javob kutmoqda. Owner ertalab aynan shu
   * ro'yxatni ko'rishi kerak.
   */
  async todaySnapshot(now = new Date()) {
  const { start, end } = todayWindow(now);
  const dayKey = localDayKey(now);

  // Bugun hafta kunining kaliti ("mon", "tue", ...).
  const shifted = new Date(start.getTime() + TZ_OFFSET_MS);
  const dowIndex = (shifted.getUTCDay() + 6) % 7; // 0 = dushanba
  const todayDay = GROUP_DAYS[dowIndex];

  const groups = await this.prisma.group.findMany({
    where: { ...branchFilter(), isDeleted: false, isActive: true },
    select: {
      id: true,
      name: true,
      startDate: true,
      // `schedule` ALOHIDA JADVAL: Mongo'da guruh hujjati ichidagi
      // massiv edi. `select` qilinmasa `undefined` bo'lib, "bugun darsi
      // bor guruhlar" ro'yxati DOIM bo'sh chiqardi.
      schedule: {
        select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
      },
    },
  });

  // Bugun darsi bor guruhlar. Jadval VERSIYALANGAN, shuning uchun faqat
  // bugun AMAL QILAYOTGAN slotlar hisoblanadi (effectiveFrom kelajakda
  // bo'lsa - hali kuchga kirmagan).
  const todayGroups = [];
  let scheduledSessions = 0;
  for (const g of groups) {
    if (g.startDate && new Date(g.startDate) > end) continue;
    const slots = (g.schedule || []).filter(
      (s) => s.day === todayDay && (!s.effectiveFrom || new Date(s.effectiveFrom) <= end),
    );
    if (!slots.length) continue;
    // Bir xil (kun+vaqt) uchun eng yangi versiya - takroriy hisoblamaslik.
    const uniq = new Map();
    for (const s of slots) {
      const prev = uniq.get(s.startTime);
      const prevAt = prev?.effectiveFrom ? new Date(prev.effectiveFrom).getTime() : 0;
      const curAt = s.effectiveFrom ? new Date(s.effectiveFrom).getTime() : 0;
      if (!prev || curAt >= prevAt) uniq.set(s.startTime, s);
    }
    scheduledSessions += uniq.size;
    todayGroups.push({ _id: g.id, name: g.name, slots: [...uniq.keys()].sort() });
  }

  const todayGroupIds = todayGroups.map((g) => g._id);

  const [markedRows, followUps, dueRows, patternRows]: any[] = await Promise.all([
    // Bugun davomat belgilangan guruhlar.
    todayGroupIds.length
      ? this.prisma.attendance.groupBy({
          by: ["groupId"],
          where: {
            groupId: { in: todayGroupIds.map(String) },
            isDeleted: false,
            dateKey: dayKey,
          },
          _count: { _all: true },
        })
      : [],
    // Bugun (yoki oldin) qayta bog'lanish vaqti kelgan lidlar.
    // `followUpAt` NULLABLE, ya'ni `not: null` bu yerda ruxsat etilgan.
    // `not` va `lt` BIR obyektda birga turadi (Mongo'da kalit qayta
    // yozilardi, Prisma'da shartlar birlashadi).
    this.prisma.lead.findMany({
      where: {
        ...branchFilter(),
        followUpAt: { not: null, lt: end },
        status: { notIn: ["enrolled", "rejected"] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        followUpAt: true,
      },
      orderBy: { followUpAt: "asc" },
      take: 20,
    }),
    // Joriy oy to'lanmagan to'lovlar (hali muddati o'tmagan ham).
    // `$expr: { $gt: [...] }` — IKKI USTUNNI solishtirish, Prisma
    // `where` da mumkin emas -> xom SQL.
    this.prisma.$queryRaw`
      SELECT
        COALESCE(SUM("expectedAmount" - "paidAmount"), 0)::float AS amount,
        COUNT(DISTINCT "studentId")::int                         AS students
      FROM "student_payments"
      WHERE "year" = ${now.getUTCFullYear()}
        AND "month" = ${now.getUTCMonth() + 1}
        AND "writtenOff" = false
        AND "status" IN ('unpaid', 'partial')
        AND "expectedAmount" > "paidAmount"
      ${rawBranchClause()}
    `,
    // BUGUN kelmasligi mumkin bo'lganlar: davomat naqshi insight'i
    // ochiq bo'lgan o'quvchilar, ularning "eng yomon kuni" bugunga
    // to'g'ri kelsa.
    //
    // NEGA insight'dan (qayta hisoblashdan emas): naqsh 90 kunlik
    // oynada hisoblangan va kun ichida o'zgarmaydi. Uni har ochilishda
    // qayta hisoblash - bir xil natija uchun og'ir aggregation.
    // `expectedImpact.label` Mongo'da ichma-ich obyekt edi; Prisma'da
    // tekis ustun: `expectedImpactLabel`.
    this.prisma.insight.findMany({
      where: {
        ...branchFilter(),
        kind: "attendance_anomaly",
        status: { in: ["open", "acked"] },
      },
      select: {
        subjectId: true,
        subjectLabel: true,
        factors: true,
        expectedImpactLabel: true,
        score: true,
      },
    }),
  ]);

  // `groupBy` natijasida kalit `_id` emas, ustun nomi (`groupId`).
  const markedByGroup = new Map(
    markedRows.map((r: any) => [String(r.groupId), r._count._all]),
  );
  const unmarked = todayGroups.filter((g) => !markedByGroup.has(String(g._id)));

  // Naqsh insight'ining "naqsh kuchi" faktori qiymati - hafta kuni nomi.
  const todayName = WEEKDAY_LABELS_UZ[dowIndex];
  const likelyAbsent = patternRows
    .filter((i: any) => {
      const f = ((i.factors as any[]) || []).find((x: any) => x.key === "weekdayGap");
      return f && String(f.value).toLowerCase() === todayName;
    })
    .map((i: any) => ({
      studentId: i.subjectId,
      name: i.subjectLabel,
      hint: i.expectedImpactLabel || "",
      score: i.score,
    }))
    .sort((a: any,b: any) => b.score - a.score)
    .slice(0, 15);

  const dueRow = dueRows[0] || {};
  // SQL `COUNT(DISTINCT ...)` — Mongo'dagi `$addToSet` + `.length` ning
  // to'g'ridan-to'g'ri ekvivalenti (massivni tashib kelmasdan).
  const due = { amount: num(dueRow.amount), students: num(dueRow.students) };

  return {
    dayKey,
    weekday: todayName,
    lessons: {
      groups: todayGroups.length,
      sessions: scheduledSessions,
      markedGroups: markedByGroup.size,
      unmarkedGroups: unmarked.map((g) => ({ _id: g._id, name: g.name, slots: g.slots })),
    },
    followUps: followUps.map((l: any) => ({
      _id: l.id,
      name: `${l.firstName} ${l.lastName || ""}`.trim(),
      phone: l.phone,
      status: l.status,
      followUpAt: l.followUpAt,
      overdue: new Date(l.followUpAt) < start,
    })),
    paymentsDue: { amount: due.amount, students: due.students },
    likelyAbsent,
  };
}

  /**
   * DAVOMAT BASHORATI - o'tgan 4 haftaning HAFTA KUNI naqshi.
   *
   * NEGA TREND EMAS, NAQSH: o'quv markazida davomat kun bo'yicha
   * o'zgaradi, hafta bo'yicha emas. Shanba kuni har doim pastroq, chunki
   * o'quvchilar dam olishni afzal ko'radi. Umumiy "davomat 84%" degan
   * son bu farqni yashiradi va owner shanba kuni 60% ga tushganini hech
   * qachon ko'rmaydi.
   *
   * BASHORAT HISOBI OCHIQ: "payshanba kunlari oxirgi 4 haftada o'rtacha
   * 78% — kelasi payshanbada ham shunga yaqin kutiladi". Bu tekshirilishi
   * mumkin va shuning uchun ishonchli.
   *
   * MA'LUMOT YETARLI BO'LMASA `insufficient: true` qaytadi - to'qib
   * chiqarilgan foiz ko'rsatishdan ko'ra halol bo'sh holat yaxshiroq.
   */
  async attendanceOutlook(
  now = new Date(),
  { historyDays = 14, forecastDays = 7, patternWeeks = 4 } = {},
) {
  const todayStart = localDayStart(now);
  const patternStart = new Date(todayStart.getTime() - patternWeeks * 7 * DAY_MS);

  const groups = await this.prisma.group.findMany({
    where: { ...branchFilter(), isDeleted: false, isActive: true },
    select: {
      id: true,
      startDate: true,
      schedule: {
        select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
      },
    },
  });

  const groupIds = groups.map((g) => g.id);

  // `$cond` bilan shartli sanoq -> SQL `FILTER (WHERE ...)`.
  const rows: any = groupIds.length
    ? await this.prisma.$queryRaw`
        SELECT
          "dateKey"                                            AS "dateKey",
          COUNT(*) FILTER (WHERE "status" = 'present')::int      AS present,
          COUNT(*) FILTER (WHERE "status" = 'absent')::int       AS absent
        FROM "attendances"
        WHERE ${inIds("groupId", groupIds)}
          AND "isDeleted" = false
          AND "date" >= ${patternStart} AND "date" < ${todayStart}
        GROUP BY "dateKey"
      `
    : [];

  // `groupBy` natijasida kalit `_id` emas, ustun nomi (`dateKey`).
  const byDay: Map<any, any> = new Map(
    rows.map((r: any) => [r.dateKey, { present: num(r.present), absent: num(r.absent) }]),
  );

  // Hafta kuni bo'yicha yig'indi - naqshning o'zi.
  const weekday = WEEKDAY_LABELS_UZ.map((label, i) => ({
    index: i,
    label,
    present: 0,
    absent: 0,
    days: 0,
  }));

  let totalMarked = 0;
  for (let i = 0; i < patternWeeks * 7; i += 1) {
    const d = new Date(patternStart.getTime() + i * DAY_MS);
    const row: any = byDay.get(localDayKey(d));
    if (!row) continue;
    const marked = row.present + row.absent;
    if (!marked) continue;
    const w: any = weekday[weekdayIndex(d)];
    w.present += row.present;
    w.absent += row.absent;
    w.days += 1;
    totalMarked += marked;
  }

  for (const w of (weekday) as any[]) {
    const marked = w.present + w.absent;
    w.rate = marked > 0 ? w.present / marked : null;
    // O'rtacha nechta yozuv - kutilayotgan kelmaganlar sonini shundan
    // chiqaramiz ("~14 o'quvchi kelmasligi mumkin").
    w.avgMarked = w.days > 0 ? Math.round(marked / w.days) : 0;
  }

  // KO'RINADIGAN TARIX - grafik uchun oxirgi N kun. Darssiz kunlar
  // ATAYLAB tashlab yuborilmaydi: bo'sh ustun "bu kuni dars yo'q" ni
  // ko'rsatadi, uni o'chirish esa haftani qisqartirib, naqshni buzardi.
  const history = [];
  for (let i = historyDays; i >= 1; i -= 1) {
    const d = new Date(todayStart.getTime() - i * DAY_MS);
    const row: any = byDay.get(localDayKey(d));
    const marked = row ? row.present + row.absent : 0;
    history.push({
      dateKey: localDayKey(d),
      weekday: WEEKDAY_LABELS_UZ[weekdayIndex(d)],
      marked,
      rate: marked > 0 ? row.present / marked : null,
    });
  }

  // 30 tadan kam yozuv - naqsh emas, shovqin.
  if (totalMarked < 30) {
    return {
      insufficient: true,
      sample: totalMarked,
      history,
      weekday,
      projection: [],
      expectedRate: null,
      expectedAbsent: 0,
      worstDay: null,
    };
  }

  // KELGUSI KUNLAR - jadval bo'yicha darsi bor kunlargina.
  const projection = [];
  for (let i = 0; i < forecastDays; i += 1) {
    const d = new Date(todayStart.getTime() + i * DAY_MS);
    const wi = weekdayIndex(d);
    const dayKeySchedule = GROUP_DAYS[wi];
    const scheduledGroups = groups.filter(
      (g) =>
        (!g.startDate || new Date(g.startDate) <= d) &&
        (g.schedule || []).some(
          (s) =>
            s.day === dayKeySchedule &&
            (!s.effectiveFrom || new Date(s.effectiveFrom) <= d),
        ),
    ).length;

    if (!scheduledGroups) continue;

    const w: any = weekday[wi];
    projection.push({
      dateKey: localDayKey(d),
      weekday: w.label,
      isToday: i === 0,
      scheduledGroups,
      // Naqsh yo'q kun (mas. hech qachon dars bo'lmagan yakshanba) -
      // foiz ham yo'q. Umumiy o'rtachani qo'yish yolg'on bo'lardi.
      expectedRate: w.rate,
      expectedAbsent: w.rate == null ? null : Math.round(w.avgMarked * (1 - w.rate)),
    });
  }

  const rated = projection.filter((p) => p.expectedRate != null);
  const expectedRate = rated.length
    ? rated.reduce((s, p) => s + p.expectedRate, 0) / rated.length
    : null;
  const expectedAbsent = rated.reduce((s, p) => s + (p.expectedAbsent || 0), 0);

  // ENG XAVFLI KUN - tavsiya aynan shu kunga beriladi.
  const worstDay = rated.length
    ? rated.reduce((worst, p) => (p.expectedRate < worst.expectedRate ? p : worst))
    : null;

  return {
    insufficient: false,
    sample: totalMarked,
    history,
    weekday,
    projection,
    expectedRate,
    expectedAbsent,
    worstDay,
  };
}
}