import mongoose from "mongoose";
import Group, { GROUP_DAYS } from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Feedback from "../../../models/feedback.model.js";
import { buildWindows } from "./student.signal.js";

// GURUH SIGNALLARI.
//
// MUHIM CHEKLOV VA UNING YECHIMI:
// "Xona #4 to'liq ishlatilmayapti" so'ralgan edi - lekin kodbazada XONA
// (Room/Classroom) modeli YO'Q va Group'da sig'im (capacity) maydoni ham
// yo'q. Xona nomini o'ylab topib ko'rsatish - to'g'ridan-to'g'ri
// gallyutsinatsiya bo'lardi.
//
// Buning o'rniga HISOBLANADIGAN narsa berilgan: DARS VAQTI utilizatsiyasi.
// Group.schedule[] da har bir guruhning kun va vaqti bor, shuning uchun
// "shanba kunlari faqat 2 guruh bor, seshanbada 11 ta" degan xulosa
// haqiqiy ma'lumotdan chiqadi va aynan shu savolga javob beradi: qachon
// yana guruh ochish mumkin. Xona darajasidagi tahlil uchun avval Room
// modeli kerak.

const DAY_MS = 24 * 60 * 60 * 1000;
const toId = (v) => new mongoose.Types.ObjectId(String(v));

export const DAY_LABELS = Object.freeze({
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
});

const WEEKEND = ["sat", "sun"];

/** Filialdagi faol guruhlar + kurs bog'lanishi + jadval. */
export const loadGroups = async (branchId) =>
  Group.find({ branchId: toId(branchId), isDeleted: false, isActive: true })
    .select("_id name courseId schedule startDate teachers")
    .lean();

/**
 * GURUH HAJMI va oqimi: hozirgi a'zolar, oxirgi 60 kunda qo'shilgan/ketgan.
 *
 * "Guruh to'ldirilmagan" signali shundan chiqadi - lekin ABSOLYUT son
 * bilan emas (sig'im maydoni yo'q), FILIAL O'RTACHASIGA nisbatan.
 * "8 o'quvchi" o'zi kam ham, ko'p ham emas: agar filialda o'rtacha 14
 * bo'lsa - kam, o'rtacha 7 bo'lsa - normal.
 */
export const groupSizeSignal = async (groups, now) => {
  if (!groups.length) return { byGroup: new Map(), avgSize: 0, medianSize: 0 };
  const gids = groups.map((g) => g._id);
  const since = new Date(now.getTime() - 60 * DAY_MS);

  const rows = await GroupMembership.aggregate([
    { $match: { group: { $in: gids }, isDeleted: false } },
    {
      $group: {
        _id: "$group",
        active: { $sum: { $cond: [{ $eq: ["$leftAt", null] }, 1, 0] } },
        joinedRecently: {
          $sum: {
            $cond: [{ $gte: ["$joinedAt", since] }, 1, 0],
          },
        },
        // "removed" - haqiqiy ketish. "transferred"/"graduated" ketish EMAS
        // (biri ichki ko'chish, ikkinchisi muvaffaqiyat) va ularni churn
        // deb hisoblash guruhni asossiz yomon ko'rsatardi.
        leftRecently: {
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
        everJoined: { $sum: 1 },
      },
    },
  ]);

  const byGroup = new Map(
    rows.map((r) => [
      String(r._id),
      {
        active: r.active,
        joinedRecently: r.joinedRecently,
        leftRecently: r.leftRecently,
        everJoined: r.everJoined,
        netFlow: r.joinedRecently - r.leftRecently,
      },
    ]),
  );

  const sizes = groups
    .map((g) => byGroup.get(String(g._id))?.active || 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const avgSize = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
  // MEDIANA ham qaytariladi: bitta 40 kishilik guruh o'rtachani ko'taradi
  // va qolgan hamma guruhni "kam" qilib qo'yadi. Chegara mediana bo'yicha.
  const medianSize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;

  return { byGroup, avgSize, medianSize, sampleSize: sizes.length };
};

/**
 * DARS VAQTI utilizatsiyasi - hafta kunlari bo'yicha sessiya soni.
 *
 * Jadval VERSIYALANGAN (schedule[].effectiveFrom), shuning uchun BUGUN
 * amal qilayotgan versiya olinadi: effectiveFrom yo'q (legacy) yoki
 * o'tmishda. Kelajakdagi versiyani hisoblash bugungi bo'sh vaqtni
 * yolg'on ko'rsatardi.
 */
export const slotUtilization = (groups, sizeByGroup, now = new Date()) => {
  const byDay = new Map(GROUP_DAYS.map((d) => [d, { sessions: 0, students: 0, groups: [] }]));

  for (const g of groups) {
    const gid = String(g._id);
    const students = sizeByGroup.get(gid)?.active || 0;

    // Bir kunda bir nechta sessiya bo'lishi mumkin; versiyalash tufayli
    // bir xil (kun + vaqt) turli effectiveFrom bilan takrorlanadi, shuning
    // uchun (kun + vaqt) bo'yicha faqat AMALDAGI versiya olinadi.
    const activeSlots = new Map();
    for (const s of g.schedule || []) {
      if (s.effectiveFrom && new Date(s.effectiveFrom) > now) continue;
      const key = `${s.day}-${s.startTime}`;
      const prev = activeSlots.get(key);
      const prevAt = prev?.effectiveFrom ? new Date(prev.effectiveFrom).getTime() : 0;
      const curAt = s.effectiveFrom ? new Date(s.effectiveFrom).getTime() : 0;
      if (!prev || curAt >= prevAt) activeSlots.set(key, s);
    }

    for (const s of activeSlots.values()) {
      const entry = byDay.get(s.day);
      if (!entry) continue;
      entry.sessions += 1;
      entry.students += students;
      entry.groups.push({ groupId: g._id, name: g.name, startTime: s.startTime });
    }
  }

  const days = GROUP_DAYS.map((d) => ({
    day: d,
    label: DAY_LABELS[d],
    isWeekend: WEEKEND.includes(d),
    ...byDay.get(d),
  }));

  const active = days.filter((d) => d.sessions > 0);
  const busiest = days.reduce((a, b) => (b.sessions > (a?.sessions ?? -1) ? b : a), null);
  const avgSessions = active.length
    ? active.reduce((a, d) => a + d.sessions, 0) / active.length
    : 0;

  return {
    days,
    busiest,
    avgSessions,
    // Ish kuni o'rtachasidan sezilarli past kunlar - "bo'sh vaqt".
    // Butunlay bo'sh kunlar ham kiritiladi (sessions: 0).
    quiet: days
      .filter((d) => busiest && d.sessions < busiest.sessions * 0.5)
      .sort((a, b) => a.sessions - b.sessions),
    weekendSessions: days
      .filter((d) => d.isWeekend)
      .reduce((a, d) => a + d.sessions, 0),
    weekdaySessions: days
      .filter((d) => !d.isWeekend)
      .reduce((a, d) => a + d.sessions, 0),
  };
};

/**
 * SHIKOYAT oqimi - guruh bo'yicha, ikki oynada.
 *
 * HALOL NOMLASH: bu "o'quvchi qoniqishi" EMAS. Feedback - shikoyat/taklif
 * qutisi, reyting so'rovnomasi emas: 1-5 ball yo'q, javob bermaganlar
 * ham yo'q. Shuning uchun signal "qoniqish pasaydi" deb emas, "shikoyat
 * ko'paydi" deb ko'rsatiladi. Ikkinchisi - o'lchangan fakt, birinchisi -
 * o'lchanmagan xulosa. Haqiqiy qoniqish balli uchun so'rovnoma modeli kerak.
 */
export const complaintSignal = async (groups, now) => {
  if (!groups.length) return new Map();
  const windows = buildWindows(now);
  const gids = groups.map((g) => g._id);

  const rows = await Feedback.aggregate([
    {
      $match: {
        group: { $in: gids },
        createdAt: { $gte: windows.priorStart, $lt: windows.end },
      },
    },
    {
      $group: {
        _id: {
          group: "$group",
          window: {
            $cond: [{ $gte: ["$createdAt", windows.recentStart] }, "recent", "prior"],
          },
        },
        count: { $sum: 1 },
        unresolved: {
          $sum: { $cond: [{ $in: ["$status", ["new", "in_review"]] }, 1, 0] },
        },
        ids: { $push: "$_id" },
      },
    },
  ]);

  const out = new Map();
  for (const r of rows) {
    const gid = String(r._id.group);
    if (!out.has(gid)) {
      out.set(gid, { recent: 0, prior: 0, unresolved: 0, delta: 0, ids: [] });
    }
    const e = out.get(gid);
    if (r._id.window === "recent") {
      e.recent = r.count;
      e.unresolved = r.unresolved;
      e.ids = (r.ids || []).slice(0, 10);
    } else {
      e.prior = r.count;
    }
  }
  for (const e of out.values()) e.delta = e.recent - e.prior;
  return out;
};

/** Barcha guruh signallarini yig'adi. */
export const collectGroupSignals = async (branchId, now = new Date()) => {
  const groups = await loadGroups(branchId);
  if (!groups.length) {
    return { groups: [], size: { byGroup: new Map(), avgSize: 0, medianSize: 0 }, slots: null, complaints: new Map() };
  }
  const size = await groupSizeSignal(groups, now);
  const [complaints] = await Promise.all([complaintSignal(groups, now)]);
  const slots = slotUtilization(groups, size.byGroup, now);
  return { groups, size, slots, complaints };
};
