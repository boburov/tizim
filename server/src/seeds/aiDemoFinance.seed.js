import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import { ROLES } from "../constants/roles.js";

import Branch from "../models/branch.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import GroupFee from "../models/groupFee.model.js";
import StudentPayment from "../models/studentPayment.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import Grade from "../models/grade.model.js";

// AI DEMO MOLIYA + BAHO SEED.
//
// NEGA ALOHIDA SEED: fakeData.seed.js davomat va guruhni yaratadi, lekin
// TO'LOV va BAHO yaratmaydi. AI markazining ikkita asosiy reytingi
// ("eng ko'p to'lovni kechiktirganlar", "o'qituvchilar reytingi") aynan
// shu ikki ma'lumotga tayanadi - ularsiz sahifa nol ko'rsatadi.
//
// ENG MUHIM QAROR: to'lovlar TASODIFIY emas, XULQ-ATVOR PROFILI bo'yicha
// yaratiladi. Har bir o'quvchiga bitta doimiy profil beriladi va u 12 oy
// davomida SAQLANADI:
//
//   disciplined (55%) - deyarli doim o'z vaqtida
//   occasional  (25%) - ba'zan kechikadi
//   chronic     (14%) - muntazam kechikadi  ← reytingning yuqori qismi
//   defaulter   (6%)  - to'lamay qarz yig'adi
//
// Tasodifiy taqsimotda har bir o'quvchining kechikish nisbati ~50% ga
// yaqinlashardi va reyting MA'NOSIZ bo'lardi: birinchi va oxirgi o'rin
// orasida farq qolmasdi. Profil esa haqiqiy markazdagidek uzun dumli
// taqsimot beradi - reyting shundagina biror narsa ko'rsatadi.
//
// ISHLATISH:  npm run seed:ai-demo
// TALAB: avval `npm run seed:all` (guruh, o'quvchi, davomat).

const MONTHS_BACK = 12;
const DAY_MS = 86400000;

// Yo'nalish bo'yicha oylik narx (so'm) - hammasi bir xil narxda bo'lsa
// "qaysi guruh ko'proq daromad keltiradi" tahlili ma'nosiz bo'lardi.
const PRICE_BY_DIRECTION = {
  Matematika: 450_000,
  "Ingliz tili": 600_000,
  "Rus tili": 400_000,
  Informatika: 750_000,
  Fizika: 500_000,
  Kimyo: 480_000,
};
const DEFAULT_PRICE = 500_000;

const PROFILES = [
  // lateChance - shu oy kechikish ehtimoli
  // lateRange  - kechikkanda necha kun (davr oxiridan keyin)
  // skipChance - umuman to'lamaslik ehtimoli (qarz bo'lib qoladi)
  { key: "disciplined", share: 0.55, lateChance: 0.08, lateRange: [6, 12], skipChance: 0.01 },
  { key: "occasional", share: 0.25, lateChance: 0.35, lateRange: [7, 25], skipChance: 0.04 },
  { key: "chronic", share: 0.14, lateChance: 0.8, lateRange: [12, 55], skipChance: 0.12 },
  { key: "defaulter", share: 0.06, lateChance: 0.9, lateRange: [30, 90], skipChance: 0.45 },
];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Ulushlar bo'yicha profil tanlaydi. */
const pickProfile = () => {
  let r = Math.random();
  for (const p of PROFILES) {
    if (r < p.share) return p;
    r -= p.share;
  }
  return PROFILES[0];
};

/** Guruh nomidan yo'nalishni ajratadi ("Ingliz tili A-3" → "Ingliz tili"). */
const directionOf = (groupName) => {
  const match = Object.keys(PRICE_BY_DIRECTION).find((d) => groupName.startsWith(d));
  return match || null;
};

/** Oxirgi N oyning (year, month) juftliklari, eng eskisidan boshlab. */
const lastMonths = (now, count) => {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return out;
};

const bulkInsert = async (Model, docs, chunk = 3000) => {
  const out = [];
  for (let i = 0; i < docs.length; i += chunk) {
    const part = await Model.insertMany(docs.slice(i, i + chunk), { ordered: false });
    out.push(...part);
  }
  return out;
};

const seed = async () => {
  await connectDB();
  const startedAt = Date.now();

  const branch = await Branch.findOne({ isMain: true, isDeleted: false });
  if (!branch) throw new Error("Filial yo'q. Avval `npm run seed:all` ishga tushiring.");

  const owner = await User.findOne({ role: ROLES.OWNER });
  const groups = await Group.find({ isDeleted: { $ne: true } })
    .select({ name: 1, teachers: 1 })
    .lean();
  if (!groups.length) throw new Error("Guruh yo'q. Avval `npm run seed:all` ishga tushiring.");

  const memberships = await GroupMembership.find({ isDeleted: { $ne: true } })
    .select({ student: 1, group: 1, joinedAt: 1, leftAt: 1 })
    .lean();

  const now = new Date();
  const periods = lastMonths(now, MONTHS_BACK);

  // --- Eskisini tozalash (idempotent qayta ishga tushirish) ---
  await Promise.all([
    GroupFee.deleteMany({}),
    StudentPayment.deleteMany({}),
    PaymentTransaction.deleteMany({}),
    Grade.deleteMany({}),
  ]);

  // --- 1) Guruh tariflari ---
  const feeDocs = [];
  const priceByGroup = new Map();
  for (const g of groups) {
    const dir = directionOf(g.name);
    const price = PRICE_BY_DIRECTION[dir] || DEFAULT_PRICE;
    priceByGroup.set(String(g._id), price);
    for (const { year, month } of periods) {
      feeDocs.push({ group: g._id, year, month, amount: price, source: "auto" });
    }
  }
  await bulkInsert(GroupFee, feeDocs);
  logger.info(`${feeDocs.length} ta guruh tarifi yaratildi`);

  // --- 2) O'quvchi xulq-atvor profillari (12 oy davomida O'ZGARMAYDI) ---
  const profileByStudent = new Map();
  for (const m of memberships) {
    const sid = String(m.student);
    if (!profileByStudent.has(sid)) profileByStudent.set(sid, pickProfile());
  }

  // --- 3) Oylik to'lovlar + tranzaksiyalar ---
  const paymentDocs = [];
  const txPlans = []; // tranzaksiya to'lov _id sini talab qiladi - keyin yoziladi

  for (const m of memberships) {
    const groupId = String(m.group);
    const price = priceByGroup.get(groupId);
    if (price == null) continue;
    const profile = profileByStudent.get(String(m.student));

    for (const { year, month } of periods) {
      // A'zolik shu oyda amal qilganmi (qo'shilgandan keyin, ketishdan oldin).
      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      if (m.joinedAt && new Date(m.joinedAt) > monthEnd) continue;
      if (m.leftAt && new Date(m.leftAt) < monthStart) continue;

      // Kelajakdagi oy uchun to'lov yozilmaydi.
      if (monthStart > now) continue;

      const skipped = Math.random() < profile.skipChance;
      const late = !skipped && Math.random() < profile.lateChance;
      // Qisman to'lov: kechikkanlarning bir qismi to'liq emas, yarim to'laydi.
      const partial = !skipped && late && Math.random() < 0.25;

      const paidAmount = skipped ? 0 : partial ? Math.round(price * 0.5) : price;
      const status = paidAmount === 0 ? "unpaid" : paidAmount < price ? "partial" : "paid";

      const doc = {
        branchId: branch._id,
        student: m.student,
        group: m.group,
        membership: m._id,
        year,
        month,
        baseFee: price,
        prorationFactor: 1,
        discountApplied: 0,
        expectedAmount: price,
        paidAmount,
        status,
        writtenOff: false,
      };
      paymentDocs.push(doc);

      if (paidAmount > 0) {
        // To'lov sanasi: davr OXIRIDAN hisoblanadi (paymentDisciplineSignal
        // aynan shunday o'lchaydi: lateDays = paidAt − oyning oxirgi kuni,
        // 5 kunlik imtiyoz bilan).
        const periodEnd = new Date(Date.UTC(year, month, 0));
        const offsetDays = late
          ? randInt(profile.lateRange[0], profile.lateRange[1])
          : randInt(-12, 4); // o'z vaqtida: oy oxiridan oldin yoki imtiyoz ichida
        const paidAt = new Date(periodEnd.getTime() + offsetDays * DAY_MS);
        // Kelajakka to'lov yozilmasin.
        if (paidAt <= now) {
          txPlans.push({
            key: `${m.student}_${m.group}_${year}_${month}`,
            branchId: branch._id,
            student: m.student,
            group: m.group,
            year,
            month,
            amount: paidAmount,
            source: "direct",
            method: Math.random() < 0.6 ? "cash" : "card",
            paidAt,
            createdBy: owner?._id || null,
          });
        } else {
          // To'lov sanasi kelajakda chiqdi - hali to'lanmagan deb yozamiz.
          doc.paidAmount = 0;
          doc.status = "unpaid";
        }
      }
    }
  }

  const payments = await bulkInsert(StudentPayment, paymentDocs);
  logger.info(`${payments.length} ta oylik to'lov yozuvi yaratildi`);

  // Tranzaksiyani to'lov yozuviga bog'lash.
  const paymentIdByKey = new Map(
    payments.map((p) => [`${p.student}_${p.group}_${p.year}_${p.month}`, p._id]),
  );
  const txDocs = [];
  for (const plan of txPlans) {
    const paymentId = paymentIdByKey.get(plan.key);
    if (!paymentId) continue;
    const { key, ...rest } = plan;
    txDocs.push({ ...rest, payment: paymentId });
  }
  await bulkInsert(PaymentTransaction, txDocs);
  logger.info(`${txDocs.length} ta to'lov tranzaksiyasi yaratildi`);

  // --- 4) Baholar ---
  //
  // O'QITUVCHI REYTINGI UCHUN ENG MUHIM QISM: baho o'qituvchi sifatiga
  // BOG'LIQ bo'lishi kerak, aks holda "eng samarali o'qituvchi" detektori
  // shovqindan tasodifiy g'olib tanlaydi. Har bir o'qituvchiga yashirin
  // "sifat" koeffitsienti beriladi va o'quvchilarining bahosi shunga
  // qarab o'sadi - ya'ni bazada TOPILADIGAN haqiqat bor.
  const teacherIds = [...new Set(groups.flatMap((g) => (g.teachers || []).map(String)))];
  const qualityByTeacher = new Map(
    teacherIds.map((id) => [id, 0.3 + Math.random() * 0.7]), // 0.3..1.0
  );

  const membersByGroup = new Map();
  for (const m of memberships) {
    const gid = String(m.group);
    if (!membersByGroup.has(gid)) membersByGroup.set(gid, []);
    membersByGroup.get(gid).push(m);
  }

  const gradeDocs = [];
  for (const g of groups) {
    const gid = String(g._id);
    const members = membersByGroup.get(gid) || [];
    const teacherId = (g.teachers || [])[0];
    const quality = qualityByTeacher.get(String(teacherId)) ?? 0.5;

    for (const m of members) {
      // Har o'quvchiga oxirgi 12 hafta ichida ~10 ta baho.
      const count = randInt(8, 14);
      // Boshlang'ich daraja tasodifiy, O'SISH esa o'qituvchi sifatiga bog'liq.
      const start = 2.6 + Math.random() * 1.2;
      const growth = (quality - 0.5) * 1.4; // -0.28 .. +0.7 ball
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) : 1;
        const noise = (Math.random() - 0.5) * 0.8;
        const value = Math.min(5, Math.max(1, Math.round(start + growth * t + noise)));
        const daysAgo = Math.round((1 - t) * 84);
        const date = new Date(now.getTime() - daysAgo * DAY_MS);
        const dateKey = date.toISOString().slice(0, 10);
        gradeDocs.push({
          group: m.group,
          student: m.student,
          date,
          dateKey,
          slot: "",
          value,
          recordedBy: teacherId || owner?._id,
          recordedAt: date,
          source: "teacher",
        });
      }
    }
  }
  // dateKey takrorlanishi mumkin (unique indeks bo'lsa) - ordered:false bilan
  // dublikatlar tashlab yuboriladi, qolganlari yoziladi.
  let gradeCount = 0;
  for (let i = 0; i < gradeDocs.length; i += 3000) {
    try {
      const part = await Grade.insertMany(gradeDocs.slice(i, i + 3000), {
        ordered: false,
      });
      gradeCount += part.length;
    } catch (err) {
      gradeCount += err?.insertedDocs?.length || 0;
    }
  }
  logger.info(`${gradeCount} ta baho yaratildi`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `AI demo moliya tayyor (${elapsed}s): ${feeDocs.length} tarif, ${payments.length} to'lov, ${txDocs.length} tranzaksiya, ${gradeCount} baho`,
  );
  await disconnectDB();
};

seed().catch(async (err) => {
  logger.error({ err }, "AI demo moliya seed xato");
  await disconnectDB();
  process.exit(1);
});
