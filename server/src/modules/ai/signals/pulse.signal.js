import mongoose from "mongoose";
import Group, { GROUP_DAYS } from "../../../models/group.model.js";
import Attendance from "../../../models/attendance.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import Lead from "../../../models/lead.model.js";
import Feedback from "../../../models/feedback.model.js";
import TeacherAttendance from "../../../models/teacherAttendance.model.js";
import TeacherAbsence from "../../../models/teacherAbsence.model.js";
import Insight from "../../../models/insight.model.js";
import {
  branchMatchStage,
  branchFilter,
} from "../../../helpers/branchContext.helper.js";

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
const toId = (v) => new mongoose.Types.ObjectId(String(v));

// Toshkent vaqti bo'yicha kun boshi. Server UTC da bo'lishi mumkin,
// lekin "kecha" degan tushuncha MAHALLIY kun bo'yicha bo'lishi kerak -
// aks holda kechqurun 22:00 da kiritilgan davomat "ertaga" ga tushib
// ketardi va kunlik hisobot noto'g'ri chiqardi.
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Tashkent = UTC+5

export const localDayStart = (d) => {
  const shifted = new Date(new Date(d).getTime() + TZ_OFFSET_MS);
  const midnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnight - TZ_OFFSET_MS);
};

export const localDayKey = (d) => {
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

/**
 * Bitta oraliq bo'yicha to'liq biznes kesimi.
 *
 * Har bir raqam MANBASI bilan birga qaytariladi (tranzaksiya soni, dars
 * soni) - hisobotda "12 mln so'm" yonida "48 to'lov" turishi kerak,
 * aks holda son tekshirilmaydigan bo'lib qoladi.
 */
export const periodPulse = async ({ start, end }) => {
  const groupIds = (
    await Group.find({ ...branchFilter(), isDeleted: false }).select("_id").lean()
  ).map((g) => g._id);

  const [
    revenueRows,
    expenseRows,
    attendanceRows,
    flowRows,
    leadRows,
    feedbackRows,
    teacherHrRows,
    teacherLessonRows,
  ] = await Promise.all([
    PaymentTransaction.aggregate([
      ...branchMatchStage(),
      { $match: { paidAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: null,
          amount: { $sum: "$amount" },
          count: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ["$method", "cash"] }, "$amount", 0] } },
          card: { $sum: { $cond: [{ $eq: ["$method", "card"] }, "$amount", 0] } },
        },
      },
    ]),
    SalaryTransaction.aggregate([
      ...branchMatchStage(),
      { $match: { isDeleted: { $ne: true }, paidAt: { $gte: start, $lt: end } } },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    groupIds.length
      ? Attendance.aggregate([
          {
            $match: {
              group: { $in: groupIds },
              isDeleted: false,
              date: { $gte: start, $lt: end },
            },
          },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              lateMinutes: { $sum: "$lateMinutes" },
            },
          },
        ])
      : [],
    groupIds.length
      ? GroupMembership.aggregate([
          { $match: { group: { $in: groupIds }, isDeleted: false } },
          {
            $group: {
              _id: null,
              joined: {
                $sum: {
                  $cond: [
                    { $and: [{ $gte: ["$joinedAt", start] }, { $lt: ["$joinedAt", end] }] },
                    1,
                    0,
                  ],
                },
              },
              // "removed" - haqiqiy ketish. transferred (ichki ko'chish) va
              // graduated (muvaffaqiyat) ALOHIDA sanaladi: ularni churn
              // deb ko'rsatish hisobotni yolg'on qilardi.
              left: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$leftReason", "removed"] },
                        { $gte: ["$leftAt", start] },
                        { $lt: ["$leftAt", end] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              graduated: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$leftReason", "graduated"] },
                        { $gte: ["$leftAt", start] },
                        { $lt: ["$leftAt", end] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              transferred: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$leftReason", "transferred"] },
                        { $gte: ["$leftAt", start] },
                        { $lt: ["$leftAt", end] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
      : [],
    Lead.aggregate([
      ...branchMatchStage(),
      { $match: { createdAt: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: null,
          created: { $sum: 1 },
          enrolled: { $sum: { $cond: [{ $eq: ["$status", "enrolled"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        },
      },
    ]),
    Feedback.aggregate([
      {
        $match: {
          ...(groupIds.length ? { group: { $in: groupIds } } : {}),
          createdAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: null,
          created: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
        },
      },
    ]),
    TeacherAttendance.aggregate([
      {
        $match: {
          isDeleted: false,
          status: "absent",
          date: { $gte: start, $lt: end },
        },
      },
      { $group: { _id: null, count: { $sum: 1 }, teachers: { $addToSet: "$teacher" } } },
    ]),
    groupIds.length
      ? TeacherAbsence.aggregate([
          {
            $match: {
              group: { $in: groupIds },
              isDeleted: false,
              date: { $gte: start, $lt: end },
            },
          },
          { $group: { _id: null, count: { $sum: 1 }, teachers: { $addToSet: "$teacher" } } },
        ])
      : [],
  ]);

  const att = { present: 0, absent: 0, excused: 0, exempt: 0, lateMinutes: 0 };
  for (const r of attendanceRows) {
    att[r._id] = r.count;
    att.lateMinutes += r.lateMinutes || 0;
  }
  // MAXRAJ: faqat present + absent. excused/exempt kiritilmaydi - sababli
  // qoldirilgan dars "yomon davomat" emas va uni maxrajga qo'shish
  // kasallik mavsumida davomatni yolg'on pasaytirardi. Bu qoida
  // student.signal.js va course.signal.js bilan AYNAN BIR XIL.
  const marked = att.present + att.absent;

  const rev = revenueRows[0] || { amount: 0, count: 0, cash: 0, card: 0 };
  const exp = expenseRows[0] || { amount: 0, count: 0 };
  const flow = flowRows[0] || { joined: 0, left: 0, graduated: 0, transferred: 0 };
  const leads = leadRows[0] || { created: 0, enrolled: 0, rejected: 0 };
  const fb = feedbackRows[0] || { created: 0, resolved: 0 };
  const thr = teacherHrRows[0] || { count: 0, teachers: [] };
  const tlr = teacherLessonRows[0] || { count: 0, teachers: [] };

  return {
    window: { start, end },
    revenue: {
      collected: rev.amount,
      transactions: rev.count,
      cash: rev.cash,
      card: rev.card,
    },
    expense: { salaryPaid: exp.amount, transactions: exp.count },
    net: rev.amount - exp.amount,
    attendance: {
      ...att,
      marked,
      rate: marked > 0 ? att.present / marked : null,
    },
    students: flow,
    leads,
    complaints: fb,
    teachers: {
      hrAbsences: thr.count,
      missedLessons: tlr.count,
      affectedTeachers: new Set(
        [...(thr.teachers || []), ...(tlr.teachers || [])].map(String),
      ).size,
    },
  };
};

/**
 * BUGUN nima bo'layotgani - "hozir" kesimi.
 *
 * Bu puls emas (o'tmish kesimi emas), balki HOLAT: bugun nechta dars bor,
 * qanchasi belgilanmagan, kim javob kutmoqda. Owner ertalab aynan shu
 * ro'yxatni ko'rishi kerak.
 */
export const todaySnapshot = async (now = new Date()) => {
  const { start, end } = todayWindow(now);
  const dayKey = localDayKey(now);

  // Bugun hafta kunining kaliti ("mon", "tue", ...).
  const shifted = new Date(start.getTime() + TZ_OFFSET_MS);
  const dowIndex = (shifted.getUTCDay() + 6) % 7; // 0 = dushanba
  const todayDay = GROUP_DAYS[dowIndex];

  const groups = await Group.find({
    ...branchFilter(),
    isDeleted: false,
    isActive: true,
  })
    .select("_id name schedule startDate")
    .lean();

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
    todayGroups.push({ _id: g._id, name: g.name, slots: [...uniq.keys()].sort() });
  }

  const todayGroupIds = todayGroups.map((g) => g._id);

  const [markedRows, followUps, dueRows, patternRows] = await Promise.all([
    // Bugun davomat belgilangan guruhlar.
    todayGroupIds.length
      ? Attendance.aggregate([
          { $match: { group: { $in: todayGroupIds }, isDeleted: false, dateKey: dayKey } },
          { $group: { _id: "$group", count: { $sum: 1 } } },
        ])
      : [],
    // Bugun (yoki oldin) qayta bog'lanish vaqti kelgan lidlar.
    Lead.find({
      ...branchFilter(),
      followUpAt: { $ne: null, $lt: end },
      status: { $nin: ["enrolled", "rejected"] },
    })
      .select("firstName lastName phone status followUpAt")
      .sort({ followUpAt: 1 })
      .limit(20)
      .lean(),
    // Joriy oy to'lanmagan to'lovlar (hali muddati o'tmagan ham).
    StudentPayment.aggregate([
      ...branchMatchStage(),
      {
        $match: {
          year: now.getUTCFullYear(),
          month: now.getUTCMonth() + 1,
          writtenOff: false,
          status: { $in: ["unpaid", "partial"] },
          $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
        },
      },
      {
        $group: {
          _id: null,
          amount: { $sum: { $subtract: ["$expectedAmount", "$paidAmount"] } },
          students: { $addToSet: "$student" },
        },
      },
    ]),
    // BUGUN kelmasligi mumkin bo'lganlar: davomat naqshi insight'i
    // ochiq bo'lgan o'quvchilar, ularning "eng yomon kuni" bugunga
    // to'g'ri kelsa.
    //
    // NEGA insight'dan (qayta hisoblashdan emas): naqsh 90 kunlik
    // oynada hisoblangan va kun ichida o'zgarmaydi. Uni har ochilishda
    // qayta hisoblash - bir xil natija uchun og'ir aggregation.
    Insight.find({
      ...branchFilter(),
      kind: "attendance_anomaly",
      status: { $in: ["open", "acked"] },
    })
      .select("subjectId subjectLabel factors expectedImpact.label score")
      .lean(),
  ]);

  const markedByGroup = new Map(markedRows.map((r) => [String(r._id), r.count]));
  const unmarked = todayGroups.filter((g) => !markedByGroup.has(String(g._id)));

  // Naqsh insight'ining "naqsh kuchi" faktori qiymati - hafta kuni nomi.
  const todayName = [
    "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba",
  ][dowIndex];
  const likelyAbsent = patternRows
    .filter((i) => {
      const f = (i.factors || []).find((x) => x.key === "weekdayGap");
      return f && String(f.value).toLowerCase() === todayName;
    })
    .map((i) => ({
      studentId: i.subjectId,
      name: i.subjectLabel,
      hint: i.expectedImpact?.label || "",
      score: i.score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const due = dueRows[0] || { amount: 0, students: [] };

  return {
    dayKey,
    weekday: todayName,
    lessons: {
      groups: todayGroups.length,
      sessions: scheduledSessions,
      markedGroups: markedByGroup.size,
      unmarkedGroups: unmarked.map((g) => ({ _id: g._id, name: g.name, slots: g.slots })),
    },
    followUps: followUps.map((l) => ({
      _id: l._id,
      name: `${l.firstName} ${l.lastName || ""}`.trim(),
      phone: l.phone,
      status: l.status,
      followUpAt: l.followUpAt,
      overdue: new Date(l.followUpAt) < start,
    })),
    paymentsDue: { amount: due.amount, students: (due.students || []).length },
    likelyAbsent,
  };
};

export { DAY_MS, toId };
