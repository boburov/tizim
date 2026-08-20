import prisma from "../../../config/prisma.js";
import {
  weeklyRoomHours,
  WORKING_HOURS_PER_DAY,
} from "../../../helpers/roomOccupancy.helper.js";
import { Prisma } from "@prisma/client";
import {
  parseRange, previousRange, journalWhere, branchClause, planPeriodClause,
  SQL_REVENUE_NET, SQL_REVENUE_GROSS, SQL_REFUNDS, SQL_PAYROLL, SQL_FEES,
} from "./analyticsFilter.js";
import { compare, ratioPercent, per, n, rankBy } from "./metrics.js";
import { nameResolvers } from "./revenue.service.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FOYDALILIK TAHLILI — o'qituvchi / yo'nalish / guruh / xona / filial
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA "SOF FOYDA" EMAS, "HISSA FOYDASI" (contribution profit) ──
 *
 * Sof foyda uchun ijara, kommunal, ma'muriyat maoshi va umumiy
 * marketing ham taqsimlanishi kerak. Bizda esa bunday taqsimlash
 * QOIDASI YO'Q.
 *
 * Uni o'ylab topish mumkin edi ("o'quvchilar soniga qarab") — va aynan
 * shu eng zararli variant bo'lardi: raqam ISHONCHLI ko'rinadi, lekin
 * asosi yo'q. Ikki o'qituvchi solishtirilganda farq ularning ishidan
 * emas, TANLANGAN FORMULADAN kelib chiqardi. Bunday raqam asosida
 * odam ishdan bo'shatilishi mumkin.
 *
 * Shuning uchun:
 *
 *   HISSA FOYDASI = attributsiyalangan daromad
 *                   − TO'G'RIDAN-TO'G'RI bog'lanadigan xarajat
 *
 * To'g'ridan-to'g'ri xarajat = o'sha o'lchov MUHRLANGAN maosh va
 * to'lov komissiyasi. Boshqasi qo'shilmaydi.
 *
 * Bu kamroq "to'liq" raqam, lekin HIMOYA QILSA BO'LADIGAN raqam.
 *
 * ── ATRIBUTSIYA QOIDASI (o'qituvchi) ──
 * Daromad o'qituvchiga faqat jurnal yozuvida `teacherId` MUHRLANGAN
 * bo'lsa bog'lanadi. U esa STEP 4 da faqat AYNAN BITTA
 * `TeacherGroupPeriod` mos kelganda muhrlanadi. Ikki o'qituvchili
 * guruhda o'lchov NULL qoladi.
 *
 * Shuning uchun har javobda `attribution` bloki bor: qancha daromad
 * bog'langan va qanchasi bog'lanmagan. Foydalanuvchi qamrovni KO'RIB
 * turadi va past qamrovli reytingga ishonmasligini biladi.
 */

// ── XONA SOATLARI: taxminlar ochiq ko'rsatiladi ──
//
// `branchMetrics.service.js` bilan BIR XIL qiymatlar (ikki sahifada
// ikki xil bandlik chiqmasligi uchun).

const weeksBetween = (from, to) =>
  Math.max(1, (to.getTime() - from.getTime()) / (7 * 86_400_000));

/** Umumiy foydalilik so'rovi — bitta GROUP BY, N+1 yo'q. */
const profitRows = async (col, range, filters, { requireNotNull = true } = {}) => {
  const where = journalWhere({
    ...range,
    branchId: filters.branchId || null,
    dimensions: filters,
    excludeInternal: filters.consolidated === true,
  });
  const c = Prisma.raw(col);
  const notNull = requireNotNull ? Prisma.sql`AND ${c} IS NOT NULL` : Prisma.empty;

  return prisma.$queryRaw`
    SELECT ${c} AS "id",
      ${SQL_REVENUE_NET}   AS "revenue",
      ${SQL_REVENUE_GROSS} AS "gross",
      ${SQL_REFUNDS}       AS "refunds",
      ${SQL_PAYROLL}       AS "payroll",
      ${SQL_FEES}          AS "fees"
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l."entryId"
    WHERE ${where} ${notNull}
    GROUP BY ${c}
  `;
};

/** Attributsiya qamrovi: qancha daromad o'lchovsiz qolgan. */
const attributionCoverage = async (col, range, filters) => {
  const where = journalWhere({ ...range, branchId: filters.branchId || null, dimensions: filters });
  const c = Prisma.raw(col);
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM(CASE WHEN ${c} IS NOT NULL AND l."accountKind" = 'revenue'
        THEN l.credit - l.debit ELSE 0 END), 0) AS "attributed",
      COALESCE(SUM(CASE WHEN ${c} IS NULL AND l."accountKind" = 'revenue'
        THEN l.credit - l.debit ELSE 0 END), 0) AS "unattributed"
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l."entryId"
    WHERE ${where}
  `;
  const a = n(rows[0]?.attributed);
  const u = n(rows[0]?.unattributed);
  return {
    attributedRevenue: a,
    unattributedRevenue: u,
    coveragePercent: ratioPercent(a, a + u),
  };
};

const buildMetrics = (row, counts = {}) => {
  const revenue = n(row.revenue);
  const payroll = n(row.payroll);
  const fees = n(row.fees);
  const directCosts = payroll + fees;
  const contributionProfit = revenue - directCosts;
  return {
    revenue,
    grossRevenue: n(row.gross),
    refunds: n(row.refunds),
    payroll,
    fees,
    directCosts,
    contributionProfit,
    contributionMarginPercent: ratioPercent(contributionProfit, revenue),
    students: counts.students ?? null,
    groups: counts.groups ?? null,
    revenuePerStudent: counts.students ? per(revenue, counts.students) : null,
    profitPerStudent: counts.students ? per(contributionProfit, counts.students) : null,
  };
};

// ══════════════════════════════════════════════════════════════════════
// O'QITUVCHI FOYDALILIGI
// ══════════════════════════════════════════════════════════════════════

/** O'qituvchi bo'yicha o'quvchi/guruh soni — BITTA so'rov. */
const teacherCounts = async (range, branchId) => {
  const bc = branchClause('g."branchId"', branchId);
  const rows = await prisma.$queryRaw`
    SELECT tgp."teacherId" AS "id",
      COUNT(DISTINCT g.id)            AS "groups",
      COUNT(DISTINCT gm."studentId")  AS "students"
    FROM teacher_group_periods tgp
    JOIN groups g ON g.id = tgp."groupId" AND g."isDeleted" = false
    LEFT JOIN group_memberships gm ON gm."groupId" = g.id
      AND gm."joinedAt" <= ${range.to}
      AND (gm."leftAt" IS NULL OR gm."leftAt" >= ${range.from})
    WHERE tgp."isDeleted" = false
      AND tgp."startDate" <= ${range.to}
      AND (tgp."endDate" IS NULL OR tgp."endDate" >= ${range.from})
      ${bc}
    GROUP BY tgp."teacherId"
  `;
  return new Map(rows.map((r) => [String(r.id), {
    groups: Number(r.groups || 0), students: Number(r.students || 0),
  }]));
};

/**
 * O'QITUVCHI DARS SOATLARI.
 *
 * Manba — guruh JADVALI (GroupScheduleItem): haftalik soat × davrdagi
 * haftalar soni. Bu REJALASHTIRILGAN soat, haqiqatda o'tilgan dars
 * emas: bekor qilingan darslar hisobga OLINMAYDI.
 *
 * Shuning uchun `revenuePerHour` javobda `basis: "schedule"` bilan
 * keladi va jadvali yo'q o'qituvchida `null` bo'ladi — nol emas
 * (nol "soat ishlamadi" degan MA'NOGA ega bo'lardi).
 */
const teacherHours = async (range, branchId) => {
  const bc = branchClause('g."branchId"', branchId);
  const weeks = weeksBetween(range.from, range.to);
  const rows = await prisma.$queryRaw`
    SELECT tgp."teacherId" AS "id",
      COALESCE(SUM(
        EXTRACT(EPOCH FROM (gs."endTime"::time - gs."startTime"::time)) / 3600.0
      ), 0) AS "weeklyHours"
    FROM teacher_group_periods tgp
    JOIN groups g ON g.id = tgp."groupId" AND g."isDeleted" = false
    JOIN group_schedule_items gs ON gs."groupId" = g.id
    WHERE tgp."isDeleted" = false
      AND tgp."startDate" <= ${range.to}
      AND (tgp."endDate" IS NULL OR tgp."endDate" >= ${range.from})
      ${bc}
    GROUP BY tgp."teacherId"
  `;
  return new Map(rows.map((r) => {
    const weekly = Number(r.weeklyHours) || 0;
    return [String(r.id), weekly > 0 ? Math.round(weekly * weeks * 10) / 10 : null];
  }));
};

export const getTeacherProfitability = async (filters = {}) => {
  const range = parseRange(filters);
  const branchId = filters.branchId || null;

  const [rows, counts, hours, coverage] = await Promise.all([
    profitRows('e."teacherId"', range, filters),
    teacherCounts(range, branchId),
    teacherHours(range, branchId),
    attributionCoverage('e."teacherId"', range, filters),
  ]);

  const ids = rows.map((r) => String(r.id));
  const names = ids.length ? await nameResolvers.teacher(ids) : new Map();

  const items = rows.map((r) => {
    const id = String(r.id);
    const c = counts.get(id) || {};
    const h = hours.get(id) ?? null;
    const m = buildMetrics(r, c);
    return {
      teacherId: id,
      name: names.get(id) || "",
      ...m,
      teachingHours: h,
      revenuePerHour: h ? per(m.revenue, h) : null,
      profitPerHour: h ? per(m.contributionProfit, h) : null,
    };
  });
  items.sort((a, b) => b.contributionProfit - a.contributionProfit);

  return {
    period: { from: range.from, to: range.to },
    attribution: {
      ...coverage,
      rule: "Daromad o'qituvchiga faqat jurnalda `teacherId` muhrlangan bo'lsa bog'lanadi; "
        + "u esa aynan BITTA TeacherGroupPeriod mos kelganda muhrlanadi. "
        + "Ikki o'qituvchili guruh daromadi bog'lanmagan qoladi.",
    },
    hoursBasis: {
      source: "GroupScheduleItem (rejalashtirilgan jadval)",
      note: "Bekor qilingan darslar hisobga olinmaydi; jadvali yo'q o'qituvchida null",
    },
    items,
    rankings: rankBy(items,
      ["contributionProfit", "contributionMarginPercent", "revenue", "students", "revenuePerStudent"], 10),
  };
};

// ══════════════════════════════════════════════════════════════════════
// YO'NALISH (kurs) FOYDALILIGI
// ══════════════════════════════════════════════════════════════════════

const courseCounts = async (range, branchId) => {
  const bc = branchClause('g."branchId"', branchId);
  const rows = await prisma.$queryRaw`
    SELECT g."courseId" AS "id",
      COUNT(DISTINCT g.id)           AS "groups",
      COUNT(DISTINCT gm."studentId") AS "students"
    FROM groups g
    LEFT JOIN group_memberships gm ON gm."groupId" = g.id
      AND gm."joinedAt" <= ${range.to}
      AND (gm."leftAt" IS NULL OR gm."leftAt" >= ${range.from})
    WHERE g."isDeleted" = false AND g."courseId" IS NOT NULL ${bc}
    GROUP BY g."courseId"
  `;
  return new Map(rows.map((r) => [String(r.id), {
    groups: Number(r.groups || 0), students: Number(r.students || 0),
  }]));
};

export const getDirectionProfitability = async (filters = {}) => {
  const range = parseRange(filters);
  const prev = previousRange(range);
  const branchId = filters.branchId || null;

  const [rows, prevRows, counts, coverage] = await Promise.all([
    profitRows('e."courseId"', range, filters),
    profitRows('e."courseId"', prev, filters),
    courseCounts(range, branchId),
    attributionCoverage('e."courseId"', range, filters),
  ]);

  const prevById = new Map(prevRows.map((r) => [String(r.id), r]));
  const ids = rows.map((r) => String(r.id));
  const names = ids.length ? await nameResolvers.course(ids) : new Map();

  const items = rows.map((r) => {
    const id = String(r.id);
    const m = buildMetrics(r, counts.get(id) || {});
    const p = prevById.get(id);
    return {
      courseId: id,
      name: names.get(id) || "",
      ...m,
      growth: compare(m.revenue, p ? n(p.revenue) : 0),
    };
  });
  items.sort((a, b) => b.contributionProfit - a.contributionProfit);

  return {
    period: { from: range.from, to: range.to },
    attribution: {
      ...coverage,
      rule: "Yo'nalish guruhdan meros olinadi (Group.courseId) va yozuvga muhrlanadi. "
        + "Kursi belgilanmagan guruh daromadi bog'lanmagan qoladi.",
    },
    items,
    rankings: rankBy(items,
      ["revenue", "contributionProfit", "contributionMarginPercent", "students", "revenuePerStudent"], 10),
    fastestGrowing: [...items]
      .filter((i) => i.growth.changePercent !== null)
      .sort((a, b) => b.growth.changePercent - a.growth.changePercent)
      .slice(0, 10),
  };
};

// ══════════════════════════════════════════════════════════════════════
// GURUH FOYDALILIGI
// ══════════════════════════════════════════════════════════════════════

export const getGroupProfitability = async (filters = {}) => {
  const range = parseRange(filters);
  const branchId = filters.branchId || null;
  const bc = branchClause('sp."branchId"', branchId);

  const [rows, coverage] = await Promise.all([
    profitRows('e."groupId"', range, filters),
    attributionCoverage('e."groupId"', range, filters),
  ]);

  // Chegirma, qarz va o'quvchi soni — oylik PLANDAN (jurnal ularni bilmaydi:
  // chegirma pul harakati emas, qarz esa KELMAGAN pul).
  const planRows = await prisma.$queryRaw`
    SELECT sp."groupId" AS "id",
      COUNT(DISTINCT sp."studentId") AS "students",
      COALESCE(SUM(sp."discountApplied"), 0) AS "discounts",
      COALESCE(SUM(sp."expectedAmount") FILTER (WHERE NOT sp."writtenOff"), 0) AS "expected",
      COALESCE(SUM(GREATEST(sp."expectedAmount" - sp."paidAmount", 0))
        FILTER (WHERE NOT sp."writtenOff"), 0) AS "outstanding"
    FROM student_payments sp
    WHERE ${planPeriodClause("sp", range.from, range.to)}
      ${bc}
    GROUP BY sp."groupId"
  `;
  const planById = new Map(planRows.map((r) => [String(r.id), r]));

  const ids = rows.map((r) => String(r.id));
  const names = ids.length ? await nameResolvers.group(ids) : new Map();

  const items = rows.map((r) => {
    const id = String(r.id);
    const p = planById.get(id) || {};
    const students = Number(p.students || 0);
    const m = buildMetrics(r, { students });
    return {
      groupId: id,
      name: names.get(id) || "",
      ...m,
      teacherCost: m.payroll,
      discounts: n(p.discounts),
      expected: n(p.expected),
      outstanding: n(p.outstanding),
      collectionRatePercent: ratioPercent(n(p.expected) - n(p.outstanding), n(p.expected)),
    };
  });
  items.sort((a, b) => b.contributionProfit - a.contributionProfit);

  return {
    period: { from: range.from, to: range.to },
    attribution: { ...coverage, rule: "Guruh o'lchovi to'lov va maosh yozuvlariga bevosita muhrlanadi." },
    items,
    rankings: rankBy(items, ["contributionProfit", "contributionMarginPercent", "revenue", "outstanding"], 10),
  };
};

// ══════════════════════════════════════════════════════════════════════
// XONA: DAROMAD VA BANDLIK  (ATAYLAB "sof foyda" EMAS)
// ══════════════════════════════════════════════════════════════════════

/**
 * Nomi "Room Revenue & Utilization" — "Room Net Profit" EMAS.
 *
 * Xonaga daromadni bog'lash mumkin (guruh o'sha xonada o'qiydi), lekin
 * XARAJATNI bog'lab bo'lmaydi: ijara butun binoga to'lanadi va uni
 * xonalarga bo'lish qoidasi yo'q. "Xona foydasi" deb atash o'ylab
 * topilgan taqsimlashni haqiqatdek ko'rsatardi.
 *
 * MAVJUD SOATLAR — TAXMIN: markaz 09:00-21:00, haftada 7 kun ishlaydi
 * deb olinadi (`branchMetrics.service.js` bilan bir xil qiymatlar).
 * Bu javobda OCHIQ ko'rsatiladi, chunki bandlik foizi to'g'ridan-to'g'ri
 * shu taxminga bog'liq.
 */
export const getRoomRevenue = async (filters = {}) => {
  const range = parseRange(filters);
  const branchId = filters.branchId || null;
  const weeks = weeksBetween(range.from, range.to);

  const [rows, coverage] = await Promise.all([
    profitRows('e."roomId"', range, filters),
    attributionCoverage('e."roomId"', range, filters),
  ]);

  // ══════════════════════════════════════════════════════════════════
  // BAND SOAT — YAGONA MANBADAN (`helpers/roomOccupancy.helper.js`)
  // ══════════════════════════════════════════════════════════════════
  //
  // ── NEGA XOM SQL OLIB TASHLANDI ──
  // Bu yerda `SUM(end - start)` turardi va u IKKI xatoga yo'l qo'yardi:
  //
  //   1. Bitta xonaga bir vaqtda ikki guruh yozilgan bo'lsa, band vaqt
  //      QO'SHILARDI va bandlik 100% dan oshardi. Test buni aniq
  //      ushladi: 101-xona "103.35%" — mavjud bo'lmagan holat.
  //   2. Maxraj haftaning 7 kuni edi, xona tahlilida esa FAOL kunlar.
  //      Ayni xona uchun ikki ekran ikki xil foiz ko'rsatardi.
  //
  // Endi ikkala endpoint AYNI helperdan o'qiydi, ya'ni ular ajralib
  // keta olmaydi. MOLIYAVIY FORMULAGA TEGILMADI — daromad, tannarx va
  // foyda hisobi o'zgarmagan; faqat SOAT hisobi bitta joyga yig'ildi.
  const occupancy = await weeklyRoomHours({ branchId });
  const hoursById = occupancy.byRoom;
  const activeDaysPerWeek = occupancy.activeDaysPerWeek;
  const ids = [...new Set([...rows.map((r) => String(r.id)), ...hoursById.keys()])];
  const names = ids.length ? await nameResolvers.room(ids) : new Map();
  const byId = new Map(rows.map((r) => [String(r.id), r]));

  const availableHours = Math.round(WORKING_HOURS_PER_DAY * activeDaysPerWeek * weeks * 10) / 10;

  const items = ids.map((id) => {
    const r = byId.get(id) || {};
    const h = hoursById.get(id);
    const occupied = h ? Math.round(h.weeklyHours * weeks * 10) / 10 : 0;
    const revenue = n(r.revenue);
    return {
      roomId: id,
      name: names.get(id) || "",
      revenue,
      groups: h?.groups || 0,
      occupiedHours: occupied,
      availableHours,
      utilizationPercent: ratioPercent(occupied, availableHours),
      revenuePerOccupiedHour: occupied > 0 ? per(revenue, occupied) : null,
      // XARAJAT ATAYLAB YO'Q — quyidagi `note` ga qarang.
    };
  });
  items.sort((a, b) => b.revenue - a.revenue);

  return {
    period: { from: range.from, to: range.to },
    attribution: { ...coverage, rule: "Xona guruhdan meros olinadi (Group.roomId) va yozuvga muhrlanadi." },
    availableHoursBasis: {
      assumption: true,
      workingHoursPerDay: WORKING_HOURS_PER_DAY,
      // Jadvaldan O'QILADI, taxmin qilinmaydi — `/branch-analytics/rooms`
      // bilan aynan bir xil qoida.
      workingDaysPerWeek: activeDaysPerWeek,
      weeksInPeriod: Math.round(weeks * 10) / 10,
      note: `Mavjud soat ${WORKING_HOURS_PER_DAY} soatlik kun va haftaning `
        + `${activeDaysPerWeek} faol kuniga nisbatan. Faol kun — jadvalda dars bo'lgan kun.`,
    },
    note: "Xona bo'yicha FOYDA hisoblanmaydi: ijara/kommunal butun binoga to'lanadi "
      + "va uni xonalarga bo'lish qoidasi yo'q. Faqat daromad va bandlik.",
    items,
    rankings: {
      ...rankBy(items, ["revenue", "utilizationPercent", "revenuePerOccupiedHour"], 10),
      lowestUtilization: [...items]
        .filter((i) => i.utilizationPercent !== null)
        .sort((a, b) => a.utilizationPercent - b.utilizationPercent)
        .slice(0, 10),
    },
  };
};

// ══════════════════════════════════════════════════════════════════════
// FILIAL FOYDALILIGI
// ══════════════════════════════════════════════════════════════════════

/**
 * FILIALLARARO ICHKI AYLANMA CHIQARIB TASHLANADI (`excludeInternal`).
 *
 * A filial B ga pul jo'natsa, bu A uchun haqiqiy chiqim (kassadan pul
 * chiqdi), lekin TARMOQ darajasida pul hech qayerga ketmagan. Ikkala
 * tomonda ham sanalsa aylanma ikki barobar oshib ketardi.
 */
export const getBranchProfitability = async (filters = {}) => {
  const range = parseRange(filters);
  const rows = await profitRows('e."branchId"', range, { ...filters, consolidated: true });

  const bc = branchClause('sp."branchId"', filters.branchId || null);
  const planRows = await prisma.$queryRaw`
    SELECT sp."branchId" AS "id",
      COUNT(DISTINCT sp."studentId") AS "students",
      COALESCE(SUM(sp."expectedAmount") FILTER (WHERE NOT sp."writtenOff"), 0) AS "expected",
      COALESCE(SUM(sp."paidAmount") FILTER (WHERE NOT sp."writtenOff"), 0) AS "collected",
      COALESCE(SUM(GREATEST(sp."expectedAmount" - sp."paidAmount", 0))
        FILTER (WHERE NOT sp."writtenOff"), 0) AS "outstanding"
    FROM student_payments sp
    WHERE ${planPeriodClause("sp", range.from, range.to)}
      ${bc}
    GROUP BY sp."branchId"
  `;
  const planById = new Map(planRows.map((r) => [String(r.id), r]));

  const ids = rows.map((r) => String(r.id));
  const names = ids.length ? await nameResolvers.branch(ids) : new Map();

  const items = rows.map((r) => {
    const id = String(r.id);
    const p = planById.get(id) || {};
    const m = buildMetrics(r, { students: Number(p.students || 0) });
    return {
      branchId: id,
      name: names.get(id) || "",
      ...m,
      expected: n(p.expected),
      collected: n(p.collected),
      outstanding: n(p.outstanding),
      collectionRatePercent: ratioPercent(n(p.collected), n(p.expected)),
    };
  });
  items.sort((a, b) => b.contributionProfit - a.contributionProfit);

  return {
    period: { from: range.from, to: range.to },
    consolidated: true,
    note: "Filiallararo ichki o'tkazmalar chiqarib tashlangan (isInternal) — "
      + "aks holda tarmoq aylanmasi ikki barobar ko'rinardi.",
    items,
    rankings: rankBy(items, ["contributionProfit", "revenue", "contributionMarginPercent"], 10),
  };
};
