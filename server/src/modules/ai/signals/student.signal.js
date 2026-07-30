import mongoose from "mongoose";
import Attendance from "../../../models/attendance.model.js";
import Grade from "../../../models/grade.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentFreeze from "../../../models/studentFreeze.model.js";
import {
  branchMatchStage,
  branchGroupMatchStage,
} from "../../../helpers/branchContext.helper.js";

// SIGNALS QATLAMI - sof MongoDB aggregation. LLM yo'q, qaror yo'q.
// Vazifasi: xom hujjatlardan tipli RAQAMLI feature'lar chiqarish.
//
// Uchta qat'iy qoida:
//  1. Har bir aggregate branch* helper bilan BOSHLANADI. Attendance/Grade/
//     GroupMembership'da branchId YO'Q - ular guruh orqali bog'lanadi,
//     shuning uchun branchGroupMatchStage(). StudentPayment'da branchId BOR.
//  2. Hammasi OMMAVIY (bulk): tungi job 500 o'quvchini bitta so'rov bilan
//     hisoblaydi, o'quvchi boshiga so'rov qilmaydi (N+1 o'ldiradi).
//  3. Har bir signal namunaviy hujjat ID'larini qaytaradi - "Ishingni
//     ko'rsat" havolasi shularsiz qurilmaydi.

const DAY_MS = 24 * 60 * 60 * 1000;

// Taqqoslash oynasi: oxirgi 4 hafta vs oldingi 4 hafta.
// NEGA 28 kun: o'quv jadvali haftalik takrorlanadi, shuning uchun oyning
// kun soni emas, hafta karrasi olinadi - aks holda 28/31 kunlik oylar
// turli sondagi darsni qamrab, "pasayish" soxta chiqardi.
export const WINDOW_DAYS = 28;

const utcMidnight = (d) => {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
};

export const buildWindows = (now = new Date()) => {
  const end = utcMidnight(now);
  const recentStart = new Date(end.getTime() - WINDOW_DAYS * DAY_MS);
  const priorStart = new Date(end.getTime() - 2 * WINDOW_DAYS * DAY_MS);
  return { priorStart, recentStart, end };
};

const toId = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * DAVOMAT signali - ikki oyna bo'yicha ishtirok darajasi.
 *
 * excused/exempt maxrajga KIRMAYDI: sababli qoldirilgan dars "yomon signal"
 * emas (kasallik, ruxsat berilgan). Ularni yomon deb hisoblash kasal
 * bo'lgan o'quvchini xavfli deb belgilardi - bu noto'g'ri va owner
 * ishonchini yo'qotadi.
 *
 * @returns {Promise<Map<string, {recentRate, priorRate, drop, lessons, lateMinutes, absentIds}>>}
 */
export const attendanceSignal = async (studentIds, windows) => {
  const { priorStart, recentStart, end } = windows;
  const branchStage = await branchGroupMatchStage();

  const rows = await Attendance.aggregate([
    ...branchStage,
    {
      $match: {
        isDeleted: false,
        student: { $in: studentIds.map(toId) },
        date: { $gte: priorStart, $lt: end },
        status: { $in: ["present", "absent"] },
      },
    },
    {
      $group: {
        _id: {
          student: "$student",
          window: {
            $cond: [{ $gte: ["$date", recentStart] }, "recent", "prior"],
          },
        },
        present: {
          $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
        },
        total: { $sum: 1 },
        lateMinutes: { $sum: "$lateMinutes" },
        // Faqat SO'NGGI oynadagi qoldirishlar havola uchun kerak.
        absentIds: {
          $push: {
            $cond: [{ $eq: ["$status", "absent"] }, "$_id", "$$REMOVE"],
          },
        },
      },
    },
  ]);

  const out = new Map();
  for (const r of rows) {
    const sid = String(r._id.student);
    const cur = out.get(sid) || {
      recentRate: null,
      priorRate: null,
      drop: 0,
      lessons: 0,
      lateMinutes: 0,
      absentIds: [],
    };
    const rate = r.total > 0 ? r.present / r.total : null;
    if (r._id.window === "recent") {
      cur.recentRate = rate;
      cur.lessons = r.total;
      cur.lateMinutes = r.lateMinutes || 0;
      cur.absentIds = (r.absentIds || []).slice(0, 20);
    } else {
      cur.priorRate = rate;
    }
    out.set(sid, cur);
  }

  // Nisbiy pasayish. priorRate yo'q (yangi o'quvchi) → pasayish hisoblanmaydi;
  // uning o'rniga dataDensity ishonchni pasaytiradi. Yangi o'quvchini
  // "davomati tushdi" deb belgilash - klassik soxta signal.
  for (const v of out.values()) {
    if (v.priorRate != null && v.recentRate != null && v.priorRate > 0) {
      v.drop = Math.max(0, (v.priorRate - v.recentRate) / v.priorRate);
    }
  }
  return out;
};

/**
 * KETMA-KET qoldirish - eng so'nggi darslardan boshlab uzluksiz "absent" soni.
 * Davomat foizidan ALOHIDA signal: 80% davomat bilan ham oxirgi 4 darsni
 * ketma-ket qoldirgan o'quvchi ketish arafasida bo'lishi mumkin.
 */
export const absenceStreakSignal = async (studentIds, windows) => {
  const branchStage = await branchGroupMatchStage();
  const since = new Date(windows.end.getTime() - 90 * DAY_MS);

  const rows = await Attendance.aggregate([
    ...branchStage,
    {
      $match: {
        isDeleted: false,
        student: { $in: studentIds.map(toId) },
        date: { $gte: since },
        status: { $in: ["present", "absent"] },
      },
    },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: "$student",
        recent: { $push: { status: "$status", id: "$_id" } },
      },
    },
    { $project: { recent: { $slice: ["$recent", 20] } } },
  ]);

  const out = new Map();
  for (const r of rows) {
    let streak = 0;
    const ids = [];
    for (const rec of r.recent) {
      if (rec.status !== "absent") break;
      streak += 1;
      ids.push(rec.id);
    }
    out.set(String(r._id), { streak, ids });
  }
  return out;
};

/**
 * BAHO trendi - ikki oyna o'rtachasi farqi (1-5 shkalada).
 *
 * NEGA chiziqli regressiya EMAS: qiyalik owner uchun tushunarsiz
 * ("-0.03/kun" hech narsa anglatmaydi), oyna o'rtachasi esa to'g'ridan-
 * to'g'ri gapiriladi: "o'rtacha baho 4.2 dan 3.4 ga tushdi". Tushuntirib
 * bo'lmaydigan signal - ishlatib bo'lmaydigan signal.
 */
export const gradeSignal = async (studentIds, windows) => {
  const { priorStart, recentStart, end } = windows;
  const branchStage = await branchGroupMatchStage();

  const rows = await Grade.aggregate([
    ...branchStage,
    {
      $match: {
        isDeleted: false,
        student: { $in: studentIds.map(toId) },
        date: { $gte: priorStart, $lt: end },
      },
    },
    {
      $group: {
        _id: {
          student: "$student",
          window: {
            $cond: [{ $gte: ["$date", recentStart] }, "recent", "prior"],
          },
        },
        avg: { $avg: "$value" },
        count: { $sum: 1 },
        ids: { $push: "$_id" },
      },
    },
  ]);

  const out = new Map();
  for (const r of rows) {
    const sid = String(r._id.student);
    const cur = out.get(sid) || {
      recentAvg: null,
      priorAvg: null,
      delta: 0,
      improvement: 0,
      count: 0,
      ids: [],
    };
    if (r._id.window === "recent") {
      cur.recentAvg = r.avg;
      cur.count = r.count;
      cur.ids = (r.ids || []).slice(0, 20);
    } else {
      cur.priorAvg = r.avg;
    }
    out.set(sid, cur);
  }

  for (const v of out.values()) {
    if (v.priorAvg != null && v.recentAvg != null) {
      v.delta = Math.max(0, v.priorAvg - v.recentAvg);
      // O'SISH - pasayishning teskarisi, ALOHIDA maydon.
      // Nega bitta ishorali (signed) son emas: churn scoring faqat
      // pasayishni "yomon" deb o'qiydi, "eng tez o'sayotgan o'quvchilar"
      // esa faqat o'sishni. Bitta maydonni ikki joyda teskari talqin
      // qilish - klassik ishora xatosi manbai.
      v.improvement = Math.max(0, v.recentAvg - v.priorAvg);
    }
  }
  return out;
};

/**
 * HAFTA KUNI naqshi - "aynan dushanbalarni qoldiradi" signali.
 *
 * NEGA umumiy davomat foizi YETARLI EMAS: 80% davomatli o'quvchi
 * "yaxshi" ko'rinadi, lekin qoldirgan 20% i bitta kunga to'plangan bo'lsa
 * bu TIZIMLI muammo (ish/transport/boshqa to'garak), tasodifiy kasallik
 * emas. Tizimli muammoni hal qilish mumkin - jadvalni o'zgartirib.
 * Tasodifiylikni esa yo'q.
 *
 * Shu signal "ertaga kim kelmasligi mumkin" ro'yxatini ham beradi:
 * o'quvchining eng yomon kuni ertangi kunga to'g'ri kelsa.
 *
 * @returns {Promise<Map<string, {worstDay, worstRate, overallRate, gap, absences, sampleIds}>>}
 */
export const weekdayPatternSignal = async (studentIds, windows) => {
  const branchStage = await branchGroupMatchStage();
  // 90 kun: har hafta kuni uchun kamida 8-12 kuzatuv beradi. Qisqaroq
  // oyna naqshni tasodifdan ajratolmaydi.
  const since = new Date(windows.end.getTime() - 90 * DAY_MS);

  const rows = await Attendance.aggregate([
    ...branchStage,
    {
      $match: {
        isDeleted: false,
        student: { $in: studentIds.map(toId) },
        date: { $gte: since, $lt: windows.end },
        status: { $in: ["present", "absent"] },
      },
    },
    {
      $group: {
        // $dayOfWeek: 1=yakshanba ... 7=shanba (Mongo konvensiyasi).
        // TZ ataylab berilgan: UTC da hisoblanса Toshkent kechqurun
        // darslari oldingi kunga tushib, naqsh siljib ketardi.
        _id: {
          student: "$student",
          dow: { $dayOfWeek: { date: "$date", timezone: "Asia/Tashkent" } },
        },
        total: { $sum: 1 },
        absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
        absentIds: {
          $push: { $cond: [{ $eq: ["$status", "absent"] }, "$_id", "$$REMOVE"] },
        },
      },
    },
  ]);

  const byStudent = new Map();
  for (const r of rows) {
    const sid = String(r._id.student);
    if (!byStudent.has(sid)) byStudent.set(sid, { days: [], total: 0, absent: 0 });
    const entry = byStudent.get(sid);
    entry.days.push({
      dow: r._id.dow,
      total: r.total,
      absent: r.absent,
      rate: r.total > 0 ? r.absent / r.total : 0,
      ids: (r.absentIds || []).slice(0, 10),
    });
    entry.total += r.total;
    entry.absent += r.absent;
  }

  const out = new Map();
  for (const [sid, entry] of byStudent) {
    const overallRate = entry.total > 0 ? entry.absent / entry.total : 0;
    // Kamida 4 kuzatuv: 1 tadan 1 ta qoldirish "100% qoldiradi" degan
    // yolg'on naqsh yasardi.
    const eligible = entry.days.filter((d) => d.total >= 4);
    let worst = null;
    for (const d of eligible) {
      if (!worst || d.rate > worst.rate) worst = d;
    }
    out.set(sid, {
      worstDay: worst?.dow ?? null,
      worstRate: worst?.rate ?? 0,
      worstTotal: worst?.total ?? 0,
      worstAbsences: worst?.absent ?? 0,
      overallRate,
      // Naqsh KUCHI: shu kun boshqa kunlardan qanchalik yomonroq.
      // Aynan shu son "tizimli" va "tasodifiy" ni ajratadi.
      gap: worst ? Math.max(0, worst.rate - overallRate) : 0,
      sampleIds: worst?.ids || [],
    });
  }
  return out;
};

/**
 * QARZ signali - FAOL qarz (hisobdan chiqarilgani emas).
 *
 * writtenOff=true yozuvlar ATAYLAB chiqarib tashlanadi: bu qarz allaqachon
 * yo'qotish deb tan olingan va uni qayta "xavf" sifatida ko'rsatish
 * o'quvchini abadiy qora ro'yxatda ushlab turardi.
 */
export const debtSignal = async (studentIds, now) => {
  const branchStage = branchMatchStage();
  const rows = await StudentPayment.aggregate([
    ...branchStage,
    {
      $match: {
        student: { $in: studentIds.map(toId) },
        writtenOff: false,
        status: { $in: ["unpaid", "partial"] },
        $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
      },
    },
    {
      $group: {
        _id: "$student",
        debtAmount: { $sum: { $subtract: ["$expectedAmount", "$paidAmount"] } },
        periods: { $sum: 1 },
        // Eng eski to'lanmagan davr - qarz kunlarini shundan hisoblaymiz.
        oldestYear: { $min: "$year" },
        ids: { $push: "$_id" },
      },
    },
  ]);

  // Eng eski davr oyini alohida olamiz: $min faqat yilni to'g'ri beradi,
  // (yil, oy) juftligini min qilish uchun alohida bosqich kerak bo'lardi -
  // buning o'rniga yil bo'yicha filtrlab, oyni JS da topamiz.
  const byStudent = new Map();
  for (const r of rows) {
    byStudent.set(String(r._id), {
      debtAmount: r.debtAmount,
      periods: r.periods,
      oldestYear: r.oldestYear,
      ids: (r.ids || []).slice(0, 20),
      debtDays: 0,
    });
  }

  if (byStudent.size) {
    const oldest = await StudentPayment.aggregate([
      ...branchStage,
      {
        $match: {
          student: { $in: [...byStudent.keys()].map(toId) },
          writtenOff: false,
          status: { $in: ["unpaid", "partial"] },
        },
      },
      { $sort: { year: 1, month: 1 } },
      {
        $group: {
          _id: "$student",
          year: { $first: "$year" },
          month: { $first: "$month" },
        },
      },
    ]);
    for (const o of oldest) {
      const entry = byStudent.get(String(o._id));
      if (!entry) continue;
      // Davr oxiri = shu oyning oxirgi kuni. Qarz shundan keyin boshlanadi.
      const periodEnd = new Date(Date.UTC(o.year, o.month, 0));
      entry.debtDays = Math.max(
        0,
        Math.floor((now.getTime() - periodEnd.getTime()) / DAY_MS),
      );
    }
  }
  return byStudent;
};

/**
 * GURUH effekti - o'quvchi guruhidagi umumiy ketish darajasi.
 * "Yomon guruh" signali: agar guruhdan 30% ketgan bo'lsa, qolganlar ham
 * xavf ostida (o'qituvchi, jadval yoki muhit muammosi).
 */
export const groupChurnSignal = async (windows) => {
  const branchStage = await branchGroupMatchStage();
  const since = new Date(windows.end.getTime() - 90 * DAY_MS);

  const rows = await GroupMembership.aggregate([
    ...branchStage,
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: "$group",
        total: { $sum: 1 },
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
      },
    },
  ]);

  const out = new Map();
  for (const r of rows) {
    out.set(String(r._id), {
      rate: r.total > 0 ? r.left / r.total : 0,
      left: r.left,
      total: r.total,
    });
  }
  return out;
};

/**
 * TO'LOV INTIZOMI tarixi - HAQIQIY kechikish, taxmin emas.
 *
 * PaymentTransaction.paidAt saqlanadi, shuning uchun har bir davr uchun
 * "qachon to'landi" ma'lum. Kechikish = oxirgi to'lov sanasi − davr oxiri.
 *
 * NEGA StudentPayment.status YETARLI EMAS: u JOYIDA yangilanadi, shuning
 * uchun to'langandan keyin "kechikkanmi" degan ma'lumot yo'qoladi. Faqat
 * tranzaksiya sanasi tarixni saqlaydi.
 */
export const paymentDisciplineSignal = async (studentIds, now) => {
  const PaymentTransaction = mongoose.models.PaymentTransaction;
  if (!PaymentTransaction) return new Map();

  // Oxirgi 12 oy - undan uzoq tarix bugungi xulq-atvorni aks ettirmaydi.
  const since = new Date(now.getTime() - 365 * DAY_MS);

  const rows = await PaymentTransaction.aggregate([
    ...branchMatchStage(),
    {
      $match: {
        student: { $in: studentIds.map(toId) },
        paidAt: { $gte: since },
      },
    },
    // Har bir (o'quvchi, davr) uchun OXIRGI to'lov sanasi - davr shu sanada
    // yopilgan hisoblanadi.
    {
      $group: {
        _id: { student: "$student", year: "$year", month: "$month" },
        lastPaidAt: { $max: "$paidAt" },
        total: { $sum: "$amount" },
      },
    },
  ]);

  const byStudent = new Map();
  for (const r of rows) {
    const sid = String(r._id.student);
    if (!byStudent.has(sid)) {
      byStudent.set(sid, { periods: 0, lateCount: 0, totalLateDays: 0 });
    }
    const entry = byStudent.get(sid);
    // Davr oxiri = shu oyning oxirgi kuni.
    const periodEnd = new Date(Date.UTC(r._id.year, r._id.month, 0));
    const lateDays = Math.floor((r.lastPaidAt - periodEnd) / DAY_MS);
    entry.periods += 1;
    // 5 kunlik imtiyoz: oy oxirida to'lash normal amaliyot, bu kechikish emas.
    if (lateDays > 5) {
      entry.lateCount += 1;
      entry.totalLateDays += lateDays;
    }
  }

  for (const v of byStudent.values()) {
    v.lateRatio = v.periods > 0 ? v.lateCount / v.periods : 0;
    v.avgLateDays = v.lateCount > 0 ? v.totalLateDays / v.lateCount : 0;
  }
  return byStudent;
};

/** MUZLATISH tarixi - ilgari muzlatgan o'quvchi qayta ketishga moyilroq. */
export const freezeSignal = async (studentIds) => {
  const rows = await StudentFreeze.aggregate([
    { $match: { student: { $in: studentIds.map(toId) }, isDeleted: false } },
    { $group: { _id: "$student", count: { $sum: 1 }, ids: { $push: "$_id" } } },
  ]);
  const out = new Map();
  for (const r of rows) {
    out.set(String(r._id), { count: r.count, ids: (r.ids || []).slice(0, 10) });
  }
  return out;
};

/**
 * Barcha o'quvchi signallarini bir marta yig'adi.
 *
 * @param {Array<{_id, firstName, lastName, groupIds, enrolledAt}>} students
 * @returns {Promise<Map<string, object>>} studentId -> signals
 */
export const collectStudentSignals = async (students, now = new Date()) => {
  const windows = buildWindows(now);
  const ids = students.map((s) => String(s._id));
  if (!ids.length) return new Map();

  // Parallel: signallar bir-biriga bog'liq emas.
  const [attendance, streak, grades, debt, groupChurn, freeze, discipline, weekday] =
    await Promise.all([
      attendanceSignal(ids, windows),
      absenceStreakSignal(ids, windows),
      gradeSignal(ids, windows),
      debtSignal(ids, now),
      groupChurnSignal(windows),
      freezeSignal(ids),
      paymentDisciplineSignal(ids, now),
      weekdayPatternSignal(ids, windows),
    ]);

  const out = new Map();
  for (const s of students) {
    const sid = String(s._id);
    const att = attendance.get(sid) || {
      recentRate: null,
      priorRate: null,
      drop: 0,
      lessons: 0,
      lateMinutes: 0,
      absentIds: [],
    };

    // O'quvchi guruhlarining eng yomon churn ko'rsatkichi.
    let worstGroup = { rate: 0, left: 0, total: 0, groupId: null };
    for (const gid of s.groupIds || []) {
      const g = groupChurn.get(String(gid));
      if (g && g.rate > worstGroup.rate) worstGroup = { ...g, groupId: gid };
    }

    const enrolledDays = s.enrolledAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(s.enrolledAt).getTime()) / DAY_MS))
      : null;

    out.set(sid, {
      windows,
      enrolledDays,
      attendance: att,
      streak: streak.get(sid) || { streak: 0, ids: [] },
      grades: grades.get(sid) || {
        recentAvg: null,
        priorAvg: null,
        delta: 0,
        improvement: 0,
        count: 0,
        ids: [],
      },
      weekday: weekday.get(sid) || {
        worstDay: null,
        worstRate: 0,
        worstTotal: 0,
        worstAbsences: 0,
        overallRate: 0,
        gap: 0,
        sampleIds: [],
      },
      debt: debt.get(sid) || { debtAmount: 0, periods: 0, debtDays: 0, ids: [] },
      groupChurn: worstGroup,
      freeze: freeze.get(sid) || { count: 0, ids: [] },
      discipline: discipline.get(sid) || {
        periods: 0,
        lateCount: 0,
        totalLateDays: 0,
        lateRatio: 0,
        avgLateDays: 0,
      },
    });
  }
  return out;
};
