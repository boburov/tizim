import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import Course from "../models/course.model.js";
import Group from "../models/group.model.js";
import LeadOption from "../models/leadOption.model.js";

// Bir martalik migratsiya: Course katalogini yaratadi va mavjud guruhlarni
// unga bog'laydi. IDEMPOTENT - qayta ishga tushirish xavfsiz.
//
// Ikki manba:
//   1) LeadOption(kind:"direction") - owner allaqachon kiritgan yo'nalishlar.
//      Bular kanonik ro'yxat, chunki lid voronkasi shularga tayanadi.
//   2) Guruh nomidan naqsh (NAME_PATTERNS) - direction ro'yxatida yo'q,
//      lekin guruh nomida aniq ko'rinadigan kurslar uchun.
//
// Guruh KUCH BILAN biriktirilmaydi: nomi mos kelmasa courseId=null qoladi va
// hisobotda "Kursi belgilanmagan" qatoriga tushadi. Noto'g'ri avto-biriktirish
// hisobotni jimgina buzardi - belgilanmagan qolgani ko'rinib turadi va owner
// uni qo'lda tuzatadi.

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "kurs";

// Guruh nomida qidiriladigan naqshlar. Tartib MUHIM: birinchi mos kelgan
// yutadi, shuning uchun aniqroq naqsh (ielts) umumiyroqdan (english) oldin.
const NAME_PATTERNS = [
  { re: /\bielts\b/i, title: "IELTS", code: "ielts" },
  { re: /\bcefr\b/i, title: "CEFR", code: "cefr" },
  { re: /\btoefl\b/i, title: "TOEFL", code: "toefl" },
  { re: /\bsat\b/i, title: "SAT", code: "sat" },
  { re: /\bmultilevel\b/i, title: "Multilevel", code: "multilevel" },
  { re: /\b(kids|bolalar)\b/i, title: "Kids", code: "kids" },
  { re: /\b(general|umumiy)\b/i, title: "Umumiy kurs", code: "umumiy" },
];

const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  // --- 1. Lid yo'nalishlaridan kurs katalogi ---
  const directions = await LeadOption.find({ kind: "direction" }).lean();

  // code bo'yicha kesh: bir xil kursni ikki marta yaratmaslik uchun.
  const byCode = new Map();
  const existing = await Course.find({}).lean();
  for (const c of existing) byCode.set(c.code, c);

  const ensureCourse = async ({ title, code, leadDirection = null }) => {
    const hit = byCode.get(code);
    if (hit) {
      // Kurs bor, lekin lid yo'nalishi hali bog'lanmagan bo'lsa - bog'laymiz.
      if (leadDirection && !hit.leadDirection) {
        await Course.updateOne({ _id: hit._id }, { $set: { leadDirection } });
        hit.leadDirection = leadDirection;
      }
      return hit;
    }
    const doc = await Course.create({ title, code, leadDirection });
    const lean = doc.toObject();
    byCode.set(code, lean);
    return lean;
  };

  let createdFromDirections = 0;
  for (const d of directions) {
    const code = slugify(d.name);
    if (!byCode.has(code)) createdFromDirections += 1;
    await ensureCourse({ title: d.name, code, leadDirection: d._id });
  }

  // --- 2. Guruhlarni kursga bog'lash ---
  const groups = await Group.find({ isDeleted: { $ne: true } })
    .select("_id name courseId")
    .lean();

  let linked = 0;
  let alreadyLinked = 0;
  let createdFromPatterns = 0;
  const unmatched = [];

  for (const g of groups) {
    if (g.courseId) {
      alreadyLinked += 1;
      continue;
    }

    // (a) Katalogdagi kurs nomi guruh nomi ichida uchraydimi.
    // Uzun nomlar oldin tekshiriladi: "IELTS Intensive" "IELTS" dan ustun.
    const catalog = [...byCode.values()].sort(
      (a, b) => b.title.length - a.title.length,
    );
    let match = catalog.find((c) =>
      new RegExp(`\\b${c.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
        g.name,
      ),
    );

    // (b) Katalogda yo'q bo'lsa - tanilgan naqshlar.
    if (!match) {
      const pattern = NAME_PATTERNS.find((p) => p.re.test(g.name));
      if (pattern) {
        const before = byCode.has(pattern.code);
        match = await ensureCourse({ title: pattern.title, code: pattern.code });
        if (!before) createdFromPatterns += 1;
      }
    }

    if (!match) {
      unmatched.push(g.name);
      continue;
    }

    await Group.updateOne({ _id: g._id }, { $set: { courseId: match._id } });
    linked += 1;
  }

  logger.info(
    {
      directions: directions.length,
      createdFromDirections,
      createdFromPatterns,
      coursesTotal: byCode.size,
      groups: groups.length,
      linked,
      alreadyLinked,
      unmatched: unmatched.length,
    },
    "Course migratsiya",
  );

  if (unmatched.length) {
    // Ro'yxatni ko'rsatamiz - owner qo'lda biriktirishi kerak bo'lgan guruhlar.
    logger.warn(
      { sample: unmatched.slice(0, 20) },
      `${unmatched.length} ta guruh kursga biriktirilmadi - qo'lda belgilash kerak`,
    );
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`Course migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "Course migratsiya xato");
  process.exit(1);
});
