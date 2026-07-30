import Lead from "../../../models/lead.model.js";
import LeadOption from "../../../models/leadOption.model.js";
import Course from "../../../models/course.model.js";
import { branchMatchStage, branchFilter } from "../../../helpers/branchContext.helper.js";
import { LEAD_PIPELINE } from "../../../constants/leadStatus.js";

// LID SIGNALLARI. Lead'da branchId BOR, shuning uchun oddiy branchMatchStage().
//
// CHEKLOV (halol yozilgan): kodbazada QO'NG'IROQ JURNALI yo'q - Lead.notes
// erkin matn, LeadActivity modeli mavjud emas. Shuning uchun "eng yaxshi
// qo'ng'iroq vaqti" HISOBLANMAYDI. Uni ko'rsatish - taxminni fakt qilib
// ko'rsatish bo'lardi. Buning o'rniga hisoblanadigan narsa berilgan:
// qaysi lid sovib qolgan (followUpAt o'tgan / statusi qotib qolgan) va
// qaysi lid issiq (sinov darsiga kelgan, lekin hali yozilmagan).

const DAY_MS = 24 * 60 * 60 * 1000;

// Sinovga kelgan, lekin yozilmagan lid - eng qimmatli holat. U markazni
// KO'RGAN va qaytmagan: qaror nuqtasida turgan odam.
const HOT_STATUSES = ["trial_attended", "trial"];
// Voronkada turgan (yopilmagan) statuslar.
const OPEN_STATUSES = LEAD_PIPELINE.filter((s) => s !== "enrolled").concat("recontacted");

/**
 * KONVERSIYA - hafta bo'yicha: yaratilgan lidlarning nechtasi yozildi.
 *
 * KOGORT bo'yicha hisoblanadi (yaratilgan sanasi), "shu haftada
 * yozilganlar" bo'yicha EMAS. Sabab: shu haftada yozilganlarning ko'pi
 * o'tgan oy kelgan lidlar bo'lishi mumkin, va u son marketing samarasini
 * emas, sotuvchining eski bazani ishlatishini o'lchaydi. Kogort esa
 * "shu hafta kelgan lidlarning taqdiri" - marketing kanali sifati.
 *
 * DIQQAT: eng oxirgi kogortlar hali "pishmagan" (lid yozilishga 1-3 hafta
 * kerak bo'ladi), shuning uchun oxirgi 2 hafta taqqoslashdan CHIQARILADI -
 * aks holda konversiya har doim "pasayayotgan" ko'rinadi.
 */
export const conversionByWeek = async (weeks, now) => {
  const since = new Date(now.getTime() - weeks * 7 * DAY_MS);
  const rows = await Lead.aggregate([
    ...branchMatchStage(),
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        // ISO hafta (dushanbadan boshlanadi) - $dateTrunc EMAS: u MongoDB 5.0
        // talab qiladi, $isoWeek esa 3.6 dan beri bor va kodbazaning qolgan
        // qismi ham eski operatorlar bilan yozilgan. Vaqt zonasi ataylab
        // berilgan: UTC da hisoblansa yakshanba kechqurun kelgan lid keyingi
        // haftaga tushib ketardi.
        _id: {
          year: { $isoWeekYear: { date: "$createdAt", timezone: "Asia/Tashkent" } },
          week: { $isoWeek: { date: "$createdAt", timezone: "Asia/Tashkent" } },
        },
        total: { $sum: 1 },
        enrolled: { $sum: { $cond: [{ $eq: ["$status", "enrolled"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        // Kogortni vaqt bo'yicha saralash va "pishganmi" tekshirish uchun.
        firstAt: { $min: "$createdAt" },
      },
    },
    { $sort: { "_id.year": 1, "_id.week": 1 } },
  ]);

  return rows.map((r) => ({
    weekKey: `${r._id.year}-W${String(r._id.week).padStart(2, "0")}`,
    weekStart: r.firstAt,
    total: r.total,
    enrolled: r.enrolled,
    rejected: r.rejected,
    rate: r.total > 0 ? r.enrolled / r.total : 0,
  }));
};

/**
 * Konversiyani ikki oynada taqqoslaydi: pishgan kogortlar ichida.
 * "Ripening" oynasi - 14 kun: undan yangi lidlar hali qaror qilmagan.
 */
export const conversionTrend = (weekly, now, ripenDays = 14) => {
  const cutoff = new Date(now.getTime() - ripenDays * DAY_MS);
  const ripe = weekly.filter((w) => new Date(w.weekStart) < cutoff);
  if (ripe.length < 4) {
    return { recentRate: null, priorRate: null, drop: 0, sample: ripe.length };
  }

  const half = Math.floor(ripe.length / 2);
  const prior = ripe.slice(0, half);
  const recent = ripe.slice(half);

  const rate = (arr) => {
    const total = arr.reduce((a, w) => a + w.total, 0);
    const enrolled = arr.reduce((a, w) => a + w.enrolled, 0);
    return total > 0 ? enrolled / total : null;
  };

  const recentRate = rate(recent);
  const priorRate = rate(prior);
  const drop =
    priorRate != null && recentRate != null && priorRate > 0
      ? Math.max(0, (priorRate - recentRate) / priorRate)
      : 0;

  return {
    recentRate,
    priorRate,
    drop,
    sample: ripe.length,
    recentLeads: recent.reduce((a, w) => a + w.total, 0),
    priorLeads: prior.reduce((a, w) => a + w.total, 0),
  };
};

/**
 * ISSIQ LIDLAR - sinovga kelgan yoki sinovga yozilgan, hali o'quvchi emas.
 * Har biri uchun "qancha kun kutib turgani" hisoblanadi: 3 kundan keyin
 * bunday lid sovuydi, shuning uchun kun soni prioritetni belgilaydi.
 */
export const hotLeads = async (now, limit = 25) => {
  const rows = await Lead.find({
    ...branchFilter(),
    status: { $in: HOT_STATUSES },
  })
    .select("firstName lastName phone status direction trialDate followUpAt statusHistory updatedAt")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  return rows.map((l) => {
    // Oxirgi status o'zgarishi - "qancha vaqtdan beri shu holatda".
    const last = l.statusHistory?.length
      ? l.statusHistory[l.statusHistory.length - 1].at
      : l.updatedAt;
    const waitingDays = Math.max(
      0,
      Math.floor((now.getTime() - new Date(last).getTime()) / DAY_MS),
    );
    return {
      _id: l._id,
      name: `${l.firstName} ${l.lastName || ""}`.trim(),
      phone: l.phone,
      status: l.status,
      direction: l.direction,
      trialDate: l.trialDate,
      followUpAt: l.followUpAt,
      waitingDays,
      // Sinov darsiga KELGAN lid - eng issiq. Faqat yozilgan (trial) esa
      // hali markazni ko'rmagan.
      attended: l.status === "trial_attended",
    };
  });
};

/**
 * SOVIB QOLGAN LIDLAR - voronkada turgan, lekin harakat yo'q.
 *
 * Ikki mezon: (a) followUpAt vaqti o'tgan, (b) status N kundan beri
 * o'zgarmagan. Ikkinchisi muhimroq - followUpAt ko'p lidda umuman
 * to'ldirilmaydi va faqat unga tayanish ko'pchilik lidni ko'rmaslikka
 * olib kelardi.
 */
export const staleLeads = async (now, staleDays = 10, limit = 25) => {
  const cutoff = new Date(now.getTime() - staleDays * DAY_MS);
  const rows = await Lead.find({
    ...branchFilter(),
    status: { $in: OPEN_STATUSES },
    updatedAt: { $lt: cutoff },
  })
    .select("firstName lastName phone status direction followUpAt statusHistory updatedAt createdAt")
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean();

  return rows.map((l) => ({
    _id: l._id,
    name: `${l.firstName} ${l.lastName || ""}`.trim(),
    phone: l.phone,
    status: l.status,
    direction: l.direction,
    idleDays: Math.max(
      0,
      Math.floor((now.getTime() - new Date(l.updatedAt).getTime()) / DAY_MS),
    ),
    followUpOverdue: Boolean(l.followUpAt && new Date(l.followUpAt) < now),
  }));
};

/**
 * YO'NALISH bo'yicha talab - "yana bitta IELTS guruhi ochilsinmi?" savolining
 * lid tomoni.
 *
 * Course.leadDirection orqali kursga bog'lanadi. Bog'lanmagan yo'nalishlar
 * ham qaytariladi (courseId: null) - ular jimgina yo'qolmasligi kerak,
 * aks holda talab kam ko'rinadi.
 */
export const demandByDirection = async (now, days = 30) => {
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = await Lead.aggregate([
    ...branchMatchStage(),
    { $match: { createdAt: { $gte: since }, direction: { $ne: null } } },
    {
      $group: {
        _id: "$direction",
        total: { $sum: 1 },
        enrolled: { $sum: { $cond: [{ $eq: ["$status", "enrolled"] }, 1, 0] } },
        open: {
          $sum: { $cond: [{ $in: ["$status", OPEN_STATUSES] }, 1, 0] },
        },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]);
  if (!rows.length) return [];

  const [options, courses] = await Promise.all([
    LeadOption.find({ _id: { $in: rows.map((r) => r._id) } })
      .select("_id name")
      .lean(),
    Course.find({ leadDirection: { $in: rows.map((r) => r._id) } })
      .select("_id title code leadDirection")
      .lean(),
  ]);

  // LeadOption maydoni `name` (title EMAS) - modelga qarang.
  const titleById = new Map(options.map((o) => [String(o._id), o.name]));
  const courseByDirection = new Map(courses.map((c) => [String(c.leadDirection), c]));

  return rows.map((r) => {
    const course = courseByDirection.get(String(r._id)) || null;
    return {
      directionId: r._id,
      directionTitle: titleById.get(String(r._id)) || "Nomsiz yo'nalish",
      course,
      total: r.total,
      enrolled: r.enrolled,
      open: r.open,
      rejected: r.rejected,
      conversionRate: r.total > 0 ? r.enrolled / r.total : 0,
    };
  });
};

/** Manba (source) samaradorligi - marketing tavsiyasi uchun. */
export const sourcePerformance = async (now, days = 90) => {
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = await Lead.aggregate([
    ...branchMatchStage(),
    { $match: { createdAt: { $gte: since }, source: { $ne: null } } },
    {
      $group: {
        _id: "$source",
        total: { $sum: 1 },
        enrolled: { $sum: { $cond: [{ $eq: ["$status", "enrolled"] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]);
  if (!rows.length) return [];

  const options = await LeadOption.find({ _id: { $in: rows.map((r) => r._id) } })
    .select("_id name")
    .lean();
  const titleById = new Map(options.map((o) => [String(o._id), o.name]));

  return rows.map((r) => ({
    sourceId: r._id,
    title: titleById.get(String(r._id)) || "Nomsiz manba",
    total: r.total,
    enrolled: r.enrolled,
    rate: r.total > 0 ? r.enrolled / r.total : 0,
  }));
};

/** Barcha lid signallarini yig'adi. */
export const collectLeadSignals = async (now = new Date()) => {
  const [weekly, hot, stale, demand, sources] = await Promise.all([
    conversionByWeek(12, now),
    hotLeads(now),
    staleLeads(now),
    demandByDirection(now),
    sourcePerformance(now),
  ]);
  return {
    weekly,
    trend: conversionTrend(weekly, now),
    hot,
    stale,
    demand,
    sources,
  };
};
