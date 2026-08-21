import "dotenv/config";
import prisma, { connectDB, disconnectDB } from "../config/prisma.js";
import logger from "../config/logger.js";
import { ROLES } from "../constants/roles.js";


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

// `insertMany(..., { ordered: false })` ning o'rni.
//
// `skipDuplicates: true` Postgres'da `ON CONFLICT DO NOTHING` ga aylanadi -
// u HAR QANDAY unique indeksni, jumladan QISMAN indekslarni ham qamraydi
// (Prisma sxemada e'lon qilinmaganlarini ham). Ya'ni Mongo'dagi
// `ordered:false` xatti-harakati aynan saqlanadi: dublikat tashlab
// yuboriladi, qolgani yoziladi.
//
// DIQQAT: `createMany` yaratilgan QATORLARNI qaytarmaydi (faqat sonini).
// Yozilgan qatorning `id` si kerak bo'lsa keyin alohida o'qish kerak.
const bulkCreate = async (model, docs, chunk = 3000) => {
  let count = 0;
  for (let i = 0; i < docs.length; i += chunk) {
    const res = await prisma[model].createMany({
      data: docs.slice(i, i + chunk),
      skipDuplicates: true,
    });
    count += res.count;
  }
  return count;
};

const seed = async () => {
  await connectDB();
  const startedAt = Date.now();

  const branch = await prisma.branch.findFirst({ where: { isMain: true, isDeleted: false } });
  if (!branch) throw new Error("Filial yo'q. Avval `npm run seed:all` ishga tushiring.");

  const owner = await prisma.user.findFirst({ where: { role: ROLES.OWNER } });
  const groups = await prisma.group.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, teachers: { select: { id: true } } },
  });
  if (!groups.length) throw new Error("Guruh yo'q. Avval `npm run seed:all` ishga tushiring.");

  const memberships = await prisma.groupMembership.findMany({
    where: { isDeleted: false },
    select: { id: true, studentId: true, groupId: true, joinedAt: true, leftAt: true },
  });

  const now = new Date();
  const periods = lastMonths(now, MONTHS_BACK);

  // --- Eskisini tozalash (idempotent qayta ishga tushirish) ---
  // O'CHIRISH TARTIBI MAJBURIY: `payment_transactions.paymentId` →
  // `student_payments` tashqi kaliti RESTRICT, ya'ni bola ota'sidan OLDIN
  // ketishi shart. Mongo'da FK yo'q edi va tartib ahamiyatsiz edi -
  // shuning uchun bu ilgari `Promise.all` bilan parallel bajarilardi.
  await prisma.paymentTransaction.deleteMany({});
  await prisma.studentPayment.deleteMany({});
  await prisma.groupFee.deleteMany({});
  await prisma.grade.deleteMany({});

  // --- 1) Guruh tariflari ---
  const feeDocs = [];
  const priceByGroup = new Map();
  for (const g of groups) {
    const dir = directionOf(g.name);
    const price = PRICE_BY_DIRECTION[dir] || DEFAULT_PRICE;
    priceByGroup.set(String(g.id), price);
    for (const { year, month } of periods) {
      feeDocs.push({ groupId: g.id, year, month, amount: price, source: "auto" });
    }
  }
  await bulkCreate("groupFee", feeDocs);
  logger.info(`${feeDocs.length} ta guruh tarifi yaratildi`);

  // --- 2) O'quvchi xulq-atvor profillari (12 oy davomida O'ZGARMAYDI) ---
  const profileByStudent = new Map();
  for (const m of memberships) {
    const sid = String(m.studentId);
    if (!profileByStudent.has(sid)) profileByStudent.set(sid, pickProfile());
  }

  // --- 3) Oylik to'lovlar + tranzaksiyalar ---
  const paymentDocs = [];
  const txPlans = []; // tranzaksiya to'lov _id sini talab qiladi - keyin yoziladi

  for (const m of memberships) {
    const groupId = String(m.groupId);
    const price = priceByGroup.get(groupId);
    if (price == null) continue;
    const profile = profileByStudent.get(String(m.studentId));

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
        branchId: branch.id,
        studentId: m.studentId,
        groupId: m.groupId,
        membershipId: m.id,
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
            key: `${m.studentId}_${m.groupId}_${year}_${month}`,
            branchId: branch.id,
            studentId: m.studentId,
            groupId: m.groupId,
            year,
            month,
            amount: paidAmount,
            source: "direct",
            method: Math.random() < 0.6 ? "cash" : "card",
            paidAt,
            createdById: owner?.id || null,
          });
        } else {
          // To'lov sanasi kelajakda chiqdi - hali to'lanmagan deb yozamiz.
          doc.paidAmount = 0;
          doc.status = "unpaid";
        }
      }
    }
  }

  const paymentCount = await bulkCreate("studentPayment", paymentDocs);
  logger.info(`${paymentCount} ta oylik to'lov yozuvi yaratildi`);

  // Tranzaksiyani to'lov yozuviga bog'lash.
  //
  // `createMany` yaratilgan qatorlarni QAYTARMAYDI (Mongo'ning `insertMany`
  // idan asosiy farq), shuning uchun kalitlar alohida o'qib olinadi.
  // Jadval yuqorida to'liq tozalangan, ya'ni bu yerdagi barcha qatorlar -
  // shu yurishda yozilganlari.
  const paymentRows = await prisma.studentPayment.findMany({
    select: { id: true, studentId: true, groupId: true, year: true, month: true },
  });
  const paymentIdByKey = new Map(
    paymentRows.map((p) => [`${p.studentId}_${p.groupId}_${p.year}_${p.month}`, p.id]),
  );
  const txDocs = [];
  for (const plan of txPlans) {
    const paymentId = paymentIdByKey.get(plan.key);
    if (!paymentId) continue;
    const { key, ...rest } = plan;
    txDocs.push({ ...rest, paymentId });
  }
  await bulkCreate("paymentTransaction", txDocs);
  logger.info(`${txDocs.length} ta to'lov tranzaksiyasi yaratildi`);

  // --- 4) Baholar ---
  //
  // O'QITUVCHI REYTINGI UCHUN ENG MUHIM QISM: baho o'qituvchi sifatiga
  // BOG'LIQ bo'lishi kerak, aks holda "eng samarali o'qituvchi" detektori
  // shovqindan tasodifiy g'olib tanlaydi. Har bir o'qituvchiga yashirin
  // "sifat" koeffitsienti beriladi va o'quvchilarining bahosi shunga
  // qarab o'sadi - ya'ni bazada TOPILADIGAN haqiqat bor.
  const teacherIds = [
    ...new Set(groups.flatMap((g) => (g.teachers || []).map((t) => String(t.id)))),
  ];
  const qualityByTeacher = new Map(
    teacherIds.map((id) => [id, 0.3 + Math.random() * 0.7]), // 0.3..1.0
  );

  const membersByGroup = new Map();
  for (const m of memberships) {
    const gid = String(m.groupId);
    if (!membersByGroup.has(gid)) membersByGroup.set(gid, []);
    membersByGroup.get(gid).push(m);
  }

  const gradeDocs = [];
  for (const g of groups) {
    const gid = String(g.id);
    const members = membersByGroup.get(gid) || [];
    // Prisma `teachers` ni obyekt sifatida qaytaradi (`{ id }`), Mongo esa
    // xom ObjectId massivi berardi.
    const teacherId = (g.teachers || [])[0]?.id;
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
        // `recordedById` MAJBURIY (NOT NULL + FK). Mongo'da sxema uni
        // talab qilmasdi va `undefined` jimgina tushib qolardi; Postgres
        // bunday qatorni rad etadi, shuning uchun egasi yo'q baho
        // umuman yozilmaydi.
        const recordedById = teacherId || owner?.id;
        if (!recordedById) continue;
        gradeDocs.push({
          groupId: m.groupId,
          studentId: m.studentId,
          date,
          dateKey,
          slot: "",
          value,
          recordedById,
          recordedAt: date,
          source: "teacher",
        });
      }
    }
  }
  // dateKey takrorlanishi mumkin - `skipDuplicates` (ON CONFLICT DO NOTHING)
  // dublikatni tashlab yuboradi, qolganlari yoziladi.
  const gradeCount = await bulkCreate("grade", gradeDocs);
  logger.info(`${gradeCount} ta baho yaratildi`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `AI demo moliya tayyor (${elapsed}s): ${feeDocs.length} tarif, ${paymentCount} to'lov, ${txDocs.length} tranzaksiya, ${gradeCount} baho`,
  );
  await disconnectDB();
};

seed().catch(async (err) => {
  logger.error({ err }, "AI demo moliya seed xato");
  await disconnectDB();
  process.exit(1);
});
