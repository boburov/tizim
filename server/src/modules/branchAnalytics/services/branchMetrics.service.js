import prisma from "../../../config/prisma.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import { pnl } from "./branchPnl.service.js";

// NORMALIZATSIYA VA UNUMDORLIK.
//
// ══════════════════════════════════════════════════════════════════
// NEGA ABSOLYUT RAQAM YETARLI EMAS
// ══════════════════════════════════════════════════════════════════
// "Chilonzor 80 mln, Yunusobod 40 mln daromad qildi" - bu Chilonzor
// yaxshi ishlayapti degani EMAS. Chilonzorda 12 xona, Yunusobodda 4 ta
// bo'lsa, aslida Yunusobod IKKI BAROBAR samaraliroq ishlayapti.
//
// Shuning uchun barcha ko'rsatkich NISBIY: 1 kv.m ga, 1 xonaga,
// 1 o'quvchiga.
//
// MA'LUMOT YO'Q BO'LSA null - 0 EMAS. Nol "yomon ishlayapti" degan
// yolg'on xabar berardi; null esa "hisoblab bo'lmaydi, kirish
// ma'lumotini to'ldiring" deydi.

/** Nolga bo'lishdan himoyalangan bo'lish. */
const div = (a, b) => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

/**
 * XONA BANDLIGI (utilization).
 *
 * FORMULA: band slot-soat / mavjud slot-soat.
 *
 *   band     = guruhlar jadvalidagi haftalik dars soatlari yig'indisi
 *   mavjud   = xonalar soni × ish kunidagi soat × haftadagi ish kuni
 *
 * "MAVJUD" ni aniqlash SHARTLI: markaz 09:00-21:00 (12 soat), haftada
 * 7 kun ishlaydi deb olinadi. Bu parametr - agar markaz boshqacha
 * ishlasa, uni o'zgartirish kerak (hozircha kod ichida, keyinchalik
 * filial sozlamasiga chiqariladi).
 */
const WORKING_HOURS_PER_DAY = 12;
const WORKING_DAYS_PER_WEEK = 7;

const parseHours = (start, end) => {
  const [sh, sm] = String(start || "0:0").split(":").map(Number);
  const [eh, em] = String(end || "0:0").split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? mins / 60 : 0;
};

export const utilization = async () => {
  const scope = branchFilter();

  const [rooms, groups] = await Promise.all([
    prisma.room.findMany({
      where: { ...scope, isActive: true, isDeleted: false },
      select: { id: true, branchId: true },
    }),
    // ⚠ `schedule` MAJBURIY `include`: Mongo'da u hujjat ICHIDAGI
    // massiv edi va `select` bilan birga kelardi. Prisma'da u ALOHIDA
    // jadval (`GroupScheduleItem`) - so'ralmasa `undefined` bo'lib
    // qoladi va bandlik soati JIMGINA 0 chiqardi.
    prisma.group.findMany({
      where: { ...scope, isActive: true, isDeleted: false },
      select: {
        id: true,
        branchId: true,
        roomId: true,
        schedule: { select: { startTime: true, endTime: true } },
      },
    }),
  ]);

  const roomsByBranch = new Map();
  for (const r of rooms) {
    const k = String(r.branchId);
    roomsByBranch.set(k, (roomsByBranch.get(k) || 0) + 1);
  }

  const busyByBranch = new Map();
  for (const g of groups) {
    const k = String(g.branchId);
    let hours = 0;
    for (const slot of g.schedule || []) {
      hours += parseHours(slot.startTime, slot.endTime);
    }
    busyByBranch.set(k, (busyByBranch.get(k) || 0) + hours);
  }

  const branchIds = [...new Set([...roomsByBranch.keys(), ...busyByBranch.keys()])];
  const branches = branchIds.length
    ? await prisma.branch.findMany({
        where: { id: { in: branchIds.map(String) } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const nameMap = new Map(branches.map((b) => [String(b.id), b]));

  return branchIds.map((k) => {
    const roomCount = roomsByBranch.get(k) || 0;
    const busyHours = Math.round((busyByBranch.get(k) || 0) * 10) / 10;
    const capacityHours = roomCount * WORKING_HOURS_PER_DAY * WORKING_DAYS_PER_WEEK;

    return {
      branchId: k,
      name: nameMap.get(k)?.name || "",
      roomCount,
      busyHours,
      capacityHours,
      // Xona kiritilmagan bo'lsa null - "0% bandlik" degan yolg'on
      // xulosa chiqmasin.
      utilizationPercent:
        capacityHours > 0
          ? Math.round((busyHours / capacityHours) * 10000) / 100
          : null,
    };
  });
};

/**
 * TALABA CHURN (ketib qolish).
 *
 * TA'RIF - bu yerda ENG MUHIM qaror. "Ketdi" ni bir necha xil aniqlash
 * mumkin va har biri boshqa raqam beradi. Tanlangan ta'rif:
 *
 *   KETGAN = davr ichida guruhdan chiqarilgan (GroupMembership.leftAt)
 *            va davr oxirida BOSHQA faol guruhi ham qolmagan
 *
 * NEGA "boshqa guruhi ham yo'q" sharti bor: o'quvchi IELTS dan chiqib
 * CEFR ga o'tsa, u markazni TASHLAB KETMAGAN - u shunchaki guruh
 * almashtirgan. Bu shartsiz churn ikki barobar yuqori ko'rinardi va
 * "biz o'quvchini yo'qotyapmiz" degan yolg'on tashvish tug'dirardi.
 */
export const churn = async ({ from, to } = {}) => {
  const scope = branchFilter();
  const groups = await prisma.group.findMany({
    where: scope,
    select: { id: true, branchId: true },
  });
  const groupBranch = new Map(groups.map((g) => [String(g.id), String(g.branchId)]));
  const groupIds = groups.map((g) => g.id);

  if (!groupIds.length) return [];

  // `leftAt: { $ne: null, $gte, $lte }` -> Prisma'da `not: null` va
  // oraliq BIR obyektda birga turadi. Sana berilmasa oraliq umuman
  // qo'shilmaydi (Mongo'dagi kabi).
  const leftRange = { not: null };
  if (from) leftRange.gte = from;
  if (to) leftRange.lte = to;

  const [left, active] = await Promise.all([
    prisma.groupMembership.findMany({
      // `group` (Mongo ref) -> `groupId`, `student` -> `studentId`.
      where: { groupId: { in: groupIds }, leftAt: leftRange, isDeleted: false },
      select: { studentId: true, groupId: true },
    }),
    prisma.groupMembership.findMany({
      where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
      select: { studentId: true, groupId: true },
    }),
  ]);

  // Hali biror guruhda faol bo'lganlar - ular KETMAGAN.
  const stillActive = new Set(active.map((m) => String(m.studentId)));

  const byBranch = new Map();
  const ensure = (k) =>
    byBranch.get(k) || byBranch.set(k, { branchId: k, churned: 0, active: 0 }).get(k);

  for (const m of left) {
    const k = groupBranch.get(String(m.groupId));
    if (!k) continue;
    if (stillActive.has(String(m.studentId))) continue;
    ensure(k).churned += 1;
  }
  for (const m of active) {
    const k = groupBranch.get(String(m.groupId));
    if (!k) continue;
    ensure(k).active += 1;
  }

  const ids = [...byBranch.keys()];
  const branches = ids.length
    ? await prisma.branch.findMany({
        where: { id: { in: ids.map(String) } },
        select: { id: true, name: true },
      })
    : [];
  const nameMap = new Map(branches.map((b) => [String(b.id), b.name]));

  return [...byBranch.values()].map((b) => {
    const base = b.churned + b.active;
    return {
      ...b,
      name: nameMap.get(b.branchId) || "",
      churnPercent: base > 0 ? Math.round((b.churned / base) * 10000) / 100 : null,
    };
  });
};

/**
 * NORMALIZATSIYALANGAN KO'RSATKICHLAR - filiallarni HAJMIDAN QAT'I
 * NAZAR solishtirish.
 *
 * CAC (bitta o'quvchini jalb qilish narxi) uchun marketing xarajati
 * kerak. U `Expense` dan kategoriya nomi bo'yicha topiladi - agar
 * markazda "Marketing" kategoriyasi bo'lmasa, CAC null bo'ladi.
 */
export const normalized = async ({ from = null, to = null } = {}) => {
  const [report, util, branches] = await Promise.all([
    pnl({ from, to, consolidated: false }),
    utilization(),
    // `branchFilter("_id")` -> `branchFilter("id")`: Prisma'da
    // birlamchi kalit ustuni `id` deb ataladi.
    prisma.branch.findMany({
      where: { ...branchFilter("id"), isDeleted: false },
      select: { id: true, name: true, code: true, areaM2: true, openedAt: true },
    }),
  ]);

  const utilMap = new Map(util.map((u) => [String(u.branchId), u]));
  const pnlMap = new Map(report.items.map((i) => [String(i.branchId), i]));

  // Aktiv o'quvchilar soni (filial bo'yicha).
  const groups = await prisma.group.findMany({
    where: { ...branchFilter(), isActive: true, isDeleted: false },
    select: { id: true, branchId: true },
  });
  const groupBranch = new Map(groups.map((g) => [String(g.id), String(g.branchId)]));
  const memberships = groups.length
    ? await prisma.groupMembership.findMany({
        where: {
          groupId: { in: groups.map((g) => g.id) },
          leftAt: null,
          isDeleted: false,
        },
        select: { studentId: true, groupId: true },
      })
    : [];

  const studentsByBranch = new Map();
  for (const m of memberships) {
    const k = groupBranch.get(String(m.groupId));
    if (!k) continue;
    if (!studentsByBranch.has(k)) studentsByBranch.set(k, new Set());
    studentsByBranch.get(k).add(String(m.studentId));
  }

  // Marketing xarajati - CAC uchun.
  const expRange = {};
  if (from) expRange.gte = from;
  if (to) expRange.lte = to;

  // MARKETING XARAJATI.
  //
  // Mongo'da bu `$lookup` + `$unwind` + regex edi. Prisma'da JOIN
  // RELATION FILTRI bilan ifodalanadi (`category: { name: {...} }`) -
  // qo'lda `$lookup` kerak emas, chunki `Expense.categoryId` haqiqiy
  // tashqi kalit.
  //
  // Regex `mode: "insensitive"` bilan almashtirildi; Mongo'dagi
  // `marketing|reklama` ikkita `contains` shartiga bo'linadi -
  // Postgres'da bu indeksdan foydalana oladi, regexdan farqli.
  //
  // GURUHLASH: `groupBy` bog'langan jadval maydoni bo'yicha guruhlay
  // olmaydi, lekin bu yerda guruhlash `branchId` BO'YICHA - u
  // `expenses` jadvalining O'Z ustuni, ya'ni muammo yo'q.
  const marketing = await prisma.expense.groupBy({
    by: ["branchId"],
    where: {
      ...branchFilter(),
      isDeleted: false,
      ...(Object.keys(expRange).length ? { spentAt: expRange } : {}),
      category: {
        OR: [
          { name: { contains: "marketing", mode: "insensitive" } },
          { name: { contains: "reklama", mode: "insensitive" } },
        ],
      },
    },
    _sum: { amount: true },
  });
  const marketingMap = new Map(
    marketing.map((m) => [String(m.branchId), m._sum.amount || 0]),
  );

  // Yangi o'quvchi (davr ichida yozilgan) - CAC maxraji.
  const newLeads = await prisma.lead.groupBy({
    by: ["branchId"],
    where: {
      ...branchFilter(),
      status: "enrolled",
      ...(Object.keys(expRange).length ? { updatedAt: expRange } : {}),
    },
    _count: { _all: true },
  });
  const newMap = new Map(newLeads.map((n) => [String(n.branchId), n._count._all]));

  return branches.map((b) => {
    const k = String(b.id);
    const p = pnlMap.get(k) || { revenue: 0, expense: 0, net: 0 };
    const u = utilMap.get(k) || { roomCount: 0, utilizationPercent: null };
    const students = studentsByBranch.get(k)?.size || 0;
    const spend = marketingMap.get(k) || 0;
    const acquired = newMap.get(k) || 0;

    return {
      branchId: k,
      name: b.name,
      code: b.code,
      // Xom raqamlar - kontekst uchun.
      revenue: p.revenue,
      net: p.net,
      students,
      roomCount: u.roomCount,
      areaM2: b.areaM2 ?? null,
      openedAt: b.openedAt ?? null,

      // ── NORMALIZATSIYALANGAN ──
      revenuePerM2: b.areaM2 ? div(p.revenue, b.areaM2) : null,
      studentsPerRoom: div(students, u.roomCount),
      revenuePerStudent: div(p.revenue, students), // ARPU
      utilizationPercent: u.utilizationPercent,
      // CAC: marketing xarajati / jalb qilingan o'quvchi.
      cac: acquired > 0 ? div(spend, acquired) : null,
      marketingSpend: spend,
      acquiredStudents: acquired,
    };
  });
};
