import mongoose from "mongoose";
import Course from "../../../models/course.model.js";
import Group from "../../../models/group.model.js";
import Attendance from "../../../models/attendance.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import { buildWindows } from "./student.signal.js";

// KURS SIGNALLARI - "qaysi kurs ishlayapti, qaysi biri yo'q" savolining
// deterministik javobi.
//
// Kurs filialsiz taksonomiya (Course modelidagi izohga qarang), filial
// ko'lami GURUH orqali keladi: avval shu filialning guruhlari olinadi,
// keyin ular kurs bo'yicha guruhlanadi. Shuning uchun bu yerda hech qanday
// branchMatchStage() chaqirilmaydi - guruh ro'yxati allaqachon filialga
// filtrlangan holda kiradi va bu KUCHLIROQ kafolat (ID ro'yxati bo'yicha
// $in kontekstga tayanmaydi).
//
// "Kursi belgilanmagan" guruhlar (courseId: null) ALOHIDA qatorga tushadi
// va jimgina yo'qolmaydi - aks holda migratsiya to'liq bo'lmagan filialda
// hisobot noto'g'ri, lekin ishonchli ko'rinardi.

const toId = (v) => new mongoose.Types.ObjectId(String(v));
const UNASSIGNED = "__unassigned__";

/**
 * Filial guruhlarini kurs bo'yicha guruhlaydi.
 * @param {Array} groups - loadGroups() natijasi (faol guruhlar)
 */
export const groupsByCourse = async (groups) => {
  const courseIds = [
    ...new Set(groups.filter((g) => g.courseId).map((g) => String(g.courseId))),
  ];
  const courses = courseIds.length
    ? await Course.find({ _id: { $in: courseIds.map(toId) } })
        .select("_id title code level")
        .lean()
    : [];
  const courseById = new Map(courses.map((c) => [String(c._id), c]));

  const buckets = new Map();
  for (const g of groups) {
    const key = g.courseId ? String(g.courseId) : UNASSIGNED;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        course: courseById.get(key) || null,
        title: courseById.get(key)?.title || "Kursi belgilanmagan",
        groups: [],
      });
    }
    buckets.get(key).groups.push(g);
  }
  return [...buckets.values()];
};

/**
 * KURS DAVOMATI - ikki oyna bo'yicha ishtirok darajasi.
 *
 * excused/exempt maxrajga kirmaydi - o'quvchi signalidagi bilan bir xil
 * qoida: sababli qoldirilgan dars "yomon signal" emas. Ikki joyda turli
 * qoida bo'lsa, kurs kesimi va o'quvchi kesimi bir-biriga qarama-qarshi
 * raqam ko'rsatardi.
 */
export const courseAttendance = async (buckets, now) => {
  const windows = buildWindows(now);
  const allGroupIds = buckets.flatMap((b) => b.groups.map((g) => g._id));
  if (!allGroupIds.length) return new Map();

  const rows = await Attendance.aggregate([
    {
      $match: {
        group: { $in: allGroupIds },
        isDeleted: false,
        date: { $gte: windows.priorStart, $lt: windows.end },
        status: { $in: ["present", "absent"] },
      },
    },
    {
      $group: {
        _id: {
          group: "$group",
          window: {
            $cond: [{ $gte: ["$date", windows.recentStart] }, "recent", "prior"],
          },
        },
        present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
        total: { $sum: 1 },
        absentIds: {
          $push: { $cond: [{ $eq: ["$status", "absent"] }, "$_id", "$$REMOVE"] },
        },
      },
    },
  ]);

  // Guruh darajasidan kurs darajasiga yig'ish: present va total YIG'INDISI
  // olinadi, guruh foizlarining o'rtachasi EMAS. Sabab: 3 o'quvchilik guruh
  // va 20 o'quvchilik guruh foizlari teng vaznda bo'lmasligi kerak.
  const byGroup = new Map();
  for (const r of rows) {
    const gid = String(r._id.group);
    if (!byGroup.has(gid)) {
      byGroup.set(gid, { recent: { present: 0, total: 0 }, prior: { present: 0, total: 0 }, absentIds: [] });
    }
    const e = byGroup.get(gid);
    e[r._id.window] = { present: r.present, total: r.total };
    if (r._id.window === "recent") e.absentIds = (r.absentIds || []).slice(0, 20);
  }

  const out = new Map();
  for (const b of buckets) {
    const agg = {
      recent: { present: 0, total: 0 },
      prior: { present: 0, total: 0 },
      absentIds: [],
    };
    for (const g of b.groups) {
      const e = byGroup.get(String(g._id));
      if (!e) continue;
      agg.recent.present += e.recent.present;
      agg.recent.total += e.recent.total;
      agg.prior.present += e.prior.present;
      agg.prior.total += e.prior.total;
      if (agg.absentIds.length < 20) {
        agg.absentIds.push(...e.absentIds.slice(0, 20 - agg.absentIds.length));
      }
    }

    const recentRate = agg.recent.total > 0 ? agg.recent.present / agg.recent.total : null;
    const priorRate = agg.prior.total > 0 ? agg.prior.present / agg.prior.total : null;
    out.set(b.key, {
      recentRate,
      priorRate,
      lessons: agg.recent.total,
      // NISBIY pasayish (absolyut punkt emas): 90% dan 80% ga tushish
      // 50% dan 40% ga tushishdan boshqa hodisa, ikkinchisi ancha jiddiy.
      drop:
        priorRate != null && recentRate != null && priorRate > 0
          ? Math.max(0, (priorRate - recentRate) / priorRate)
          : 0,
      absentIds: agg.absentIds,
    });
  }
  return out;
};

/** KURS BO'YICHA o'quvchi soni va ketish darajasi. */
export const courseEnrollment = async (buckets, now) => {
  const allGroupIds = buckets.flatMap((b) => b.groups.map((g) => g._id));
  if (!allGroupIds.length) return new Map();
  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const rows = await GroupMembership.aggregate([
    { $match: { group: { $in: allGroupIds }, isDeleted: false } },
    {
      $group: {
        _id: "$group",
        active: { $sum: { $cond: [{ $eq: ["$leftAt", null] }, 1, 0] } },
        left: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$leftReason", "removed"] },
                  { $gte: ["$leftAt", since] },
                ],
              },
              1,
              0,
            ],
          },
        },
        graduated: {
          $sum: { $cond: [{ $eq: ["$leftReason", "graduated"] }, 1, 0] },
        },
      },
    },
  ]);
  const byGroup = new Map(rows.map((r) => [String(r._id), r]));

  const out = new Map();
  for (const b of buckets) {
    let active = 0;
    let left = 0;
    let graduated = 0;
    for (const g of b.groups) {
      const e = byGroup.get(String(g._id));
      if (!e) continue;
      active += e.active;
      left += e.left;
      graduated += e.graduated;
    }
    out.set(b.key, {
      active,
      left,
      graduated,
      groups: b.groups.length,
      avgGroupSize: b.groups.length ? active / b.groups.length : 0,
      churnRate: active + left > 0 ? left / (active + left) : 0,
    });
  }
  return out;
};

/**
 * KURS DAROMADI - joriy oy kutilgan va to'langan.
 *
 * StudentPayment'da courseId yo'q, shuning uchun guruh orqali bog'lanadi.
 * Bu "qaysi kurs eng foydali" savolining daromad tomoni. XARAJAT tomoni
 * (o'qituvchi maoshi guruh bo'yicha) SalaryTransaction'da bor, lekin u
 * oy oxirida to'lanadi - shuning uchun joriy oy uchun "sof foyda"
 * hisoblash chalg'ituvchi bo'lardi va bu yerda ATAYLAB qilinmaydi.
 */
export const courseRevenue = async (buckets, now) => {
  const allGroupIds = buckets.flatMap((b) => b.groups.map((g) => g._id));
  if (!allGroupIds.length) return new Map();

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const rows = await StudentPayment.aggregate([
    {
      $match: {
        group: { $in: allGroupIds },
        year,
        month,
        writtenOff: false,
      },
    },
    {
      $group: {
        _id: "$group",
        expected: { $sum: "$expectedAmount" },
        paid: { $sum: "$paidAmount" },
      },
    },
  ]);
  const byGroup = new Map(rows.map((r) => [String(r._id), r]));

  const out = new Map();
  for (const b of buckets) {
    let expected = 0;
    let paid = 0;
    for (const g of b.groups) {
      const e = byGroup.get(String(g._id));
      if (!e) continue;
      expected += e.expected;
      paid += e.paid;
    }
    out.set(b.key, {
      expected,
      paid,
      collectionRate: expected > 0 ? paid / expected : null,
      revenuePerStudent: 0, // enrollment bilan birlashtirilgandan keyin to'ldiriladi
    });
  }
  return out;
};

/** Barcha kurs signallarini yig'adi (guruh ro'yxati tashqaridan keladi). */
export const collectCourseSignals = async (groups, now = new Date()) => {
  const buckets = await groupsByCourse(groups);
  if (!buckets.length) return { buckets: [], signals: new Map() };

  const [attendance, enrollment, revenue] = await Promise.all([
    courseAttendance(buckets, now),
    courseEnrollment(buckets, now),
    courseRevenue(buckets, now),
  ]);

  const signals = new Map();
  for (const b of buckets) {
    const enr = enrollment.get(b.key) || {
      active: 0,
      left: 0,
      graduated: 0,
      groups: 0,
      avgGroupSize: 0,
      churnRate: 0,
    };
    const rev = revenue.get(b.key) || { expected: 0, paid: 0, collectionRate: null };
    signals.set(b.key, {
      bucket: b,
      attendance: attendance.get(b.key) || {
        recentRate: null,
        priorRate: null,
        lessons: 0,
        drop: 0,
        absentIds: [],
      },
      enrollment: enr,
      revenue: {
        ...rev,
        revenuePerStudent: enr.active > 0 ? rev.expected / enr.active : 0,
      },
    });
  }
  return { buckets, signals };
};
