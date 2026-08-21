import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { userBranchCondition } from "../../../helpers/branchContext.helper.js";

// ═══════════════════════════════════════════════════════════════════════════
// ⚠ FILIAL KO'LAMI — SHU FAYLDA BUTUNLAY YO'Q EDI.
//
// `tests/branchLeak.test.js` Prisma'ga ko'chirilgach darhol ushladi:
// BO'M-BO'SH filial kontekstida `ongoing.cohorts[*].count` 64 / 49 / 127
// qaytardi — ya'ni BUTUN MARKAZning o'quvchilari sanalardi. `activeCount`,
// `finished`, `enrollmentTrend` va `recentEnrollments` ham xuddi shunday.
//
// SABAB: filtrlar MODUL DARAJASIDAGI KONSTANTA edi. Konstanta import
// paytida BIR MARTA hisoblanadi, filial ko'lami esa HAR SO'ROVDA
// (AsyncLocalStorage) boshqacha bo'ladi — ya'ni uni konstantaga
// qo'yib bo'lmaydi. Shuning uchun ular FUNKSIYAGA aylantirildi.
//
// Naqsh qo'shni `adminDashboard.service.js` dan olindi: `userBranchCondition()`
// `OR` qaytaradi, shuning uchun u `AND` ichiga solinadi — aks holda
// boshqa `OR` bilan to'qnashib, filtrni jimgina yo'q qilardi.
// ═══════════════════════════════════════════════════════════════════════════

/** Filial ko'lamini `AND` ichiga qo'shadi (kontekst yo'q bo'lsa — tegmaydi). */
const userScoped = (base) => {
  const cond = userBranchCondition();
  return cond ? { ...base, AND: [cond] } : base;
};

// === Sana yordamchilari (UTC) ===
// O'tgan `count` oyni [{year, month}] ko'rinishida (eng eskisidan boshlab).
const previousMonths = (count) => {
  const now = new Date();
  const arr = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    arr.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return arr;
};

const monthStart = (year, month) =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));

// O'quvchi uchun umumiy bazaviy filtr.
//
// `isDeleted` ustuni NOT NULL (default false) -> `{ $ne: true }` oddiy
// `false` ga aylanadi. `enrolledAt` esa NULLABLE, ya'ni `not: null`
// bu yerda RUXSAT ETILGAN (ro'yxatga olinmagan o'quvchi statistikaga
// kirmasligi kerak).
const BASE_STUDENT_FILTER = {
  role: ROLES.STUDENT,
  isDeleted: false,
  enrolledAt: { not: null },
};

// ⚠ QUYIDAGILAR FUNKSIYA — KONSTANTA EMAS (yuqoridagi izohga qarang).
// Filial ko'lami har so'rovda ALS'dan o'qiladi, ya'ni u import paytida
// ma'lum emas.

// Hozir o'qiyotganlar: faol + hali yakunlamagan (muddat enrolledAt → bugun).
const ongoingFilter = () =>
  userScoped({ ...BASE_STUDENT_FILTER, isActive: true, completedAt: null });

// Yakunlaganlar: yakunlash sanasi belgilangan (muddat enrolledAt → completedAt).
const finishedFilter = () =>
  userScoped({ ...BASE_STUDENT_FILTER, completedAt: { not: null } });

// Faol o'quvchilar (trend/so'nggi ro'yxat/jami soni uchun) - eski semantika.
const activeStudentFilter = () =>
  userScoped({ ...BASE_STUDENT_FILTER, isActive: true });

// Ro'yxatga olinish davomiyligiga ko'ra guruhlash chegaralari (oyda).
// [min, max) - max=null cheksiz. Tartib UI'da shu tartibda chiqadi.
const DURATION_BUCKETS = [
  { key: "0-3", label: "0-3 oy", minMonths: 0, maxMonths: 3 },
  { key: "3-6", label: "3-6 oy", minMonths: 3, maxMonths: 6 },
  { key: "6-12", label: "6-12 oy", minMonths: 6, maxMonths: 12 },
  { key: "12+", label: "1 yildan ortiq", minMonths: 12, maxMonths: null },
];

/**
 * OYLARDAGI FARQ — Mongo `$dateDiff(unit: "month")` bilan AYNAN bir xil.
 *
 * ═══════════════════════════════════════════════════════════════════
 * Mongo `$dateDiff` oy birligida KUNNI HISOBGA OLMAYDI: u kesib
 * o'tilgan oy chegaralarini sanaydi. 31-yanvar → 1-fevral = 1 oy,
 * 1-yanvar → 31-yanvar = 0 oy.
 *
 * Shuning uchun formula ham aynan shunday: (y2-y1)*12 + (m2-m1).
 * "Kun bo'yicha aniqroq" hisoblash TO'G'RIROQ tuyulishi mumkin, lekin
 * u kohortalar chegarasini siljitib, o'tgan oyning raqamini bugun
 * o'zgartirib yuborardi - hisobot esa barqaror bo'lishi kerak.
 * ═══════════════════════════════════════════════════════════════════
 */
const monthDiff = (start, end) => {
  const a = new Date(start);
  const b = new Date(end);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
};

// === Atomic helpers ===

// Oylar bo'yicha yangi ro'yxatga olishlar (enrolledAt) - trend grafigi uchun.
//
// Mongo'da bu `$group: { _id: { $year, $month } }` quvuri edi. Prisma
// `groupBy` sana QISMLARI bo'yicha guruhlay olmaydi (faqat butun ustun),
// shuning uchun `$queryRaw` — sun'iy ko'p bosqichli qurilma yasashdan
// ko'ra SQL'ning o'zi to'g'riroq.
const computeEnrollmentTrend = async (months) => {
  const periods = previousMonths(months);
  const rangeStart = monthStart(periods[0].year, periods[0].month);

  // ⚠ XOM SQL DAN VOZ KECHILDI — FILIAL KO'LAMI SABABLI.
  //
  // Ilgari bu `$queryRaw` edi (Prisma `groupBy` sana QISMLARI bo'yicha
  // guruhlay olmaydi). Lekin `userBranchCondition()` Prisma shartini
  // qaytaradi va uni SQL matniga qo'lda tarjima qilish kerak bo'lardi —
  // ya'ni ko'lam qoidasi IKKI JOYDA ikki tilda yozilardi va ular
  // muqarrar ravishda bir-biridan uzoqlashardi.
  //
  // Shuning uchun qatorlar KO'LAM BILAN o'qiladi va oy bo'yicha JS'da
  // guruhlanadi — bu faylda `computeDurationStats` allaqachon shunday
  // qiladi. Hajm chegaralangan: faqat `rangeStart` dan keyingi FAOL
  // o'quvchilar.
  const rows = await prisma.user.findMany({
    where: { ...activeStudentFilter(), enrolledAt: { gte: rangeStart } },
    select: { enrolledAt: true },
  });

  // Bo'sh oylarni 0 bilan to'ldiramiz (grafikda uzilish bo'lmasligi uchun).
  const map = new Map();
  for (const r of rows) {
    if (!r.enrolledAt) continue;
    const d = new Date(r.enrolledAt);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return periods.map((p) => ({
    year: p.year,
    month: p.month,
    count: map.get(`${p.year}-${p.month}`) || 0,
  }));
};

// Davomiylik (oyda) bo'yicha kohortalar + o'rtacha davomiylik.
//
// Mongo'da `$dateDiff` SERVERDA hisoblanardi, lekin quvur baribir HAR
// BIR o'quvchi uchun bitta qator qaytarardi (`$project`, `$group` emas).
// Ya'ni tarmoqdan o'tadigan hajm o'zgarmadi - faqat arifmetika JS'ga
// ko'chdi. `endAt = null` bo'lsa "hozir" olinadi (Mongo'dagi `$$NOW`).
const computeDurationStats = async (where, useNow) => {
  const rows = await prisma.user.findMany({
    where,
    select: { enrolledAt: true, completedAt: true },
  });

  const now = new Date();
  const counts = Object.fromEntries(DURATION_BUCKETS.map((b) => [b.key, 0]));
  let totalMonths = 0;
  for (const r of rows) {
    const end = useNow ? now : r.completedAt;
    // Ikkala sana ham bo'lishi shart - filtr buni kafolatlaydi, lekin
    // himoya sifatida qoldiramiz (0 oy deb sanaladi).
    const m = r.enrolledAt && end ? Math.max(0, monthDiff(r.enrolledAt, end)) : 0;
    totalMonths += m;
    const bucket = DURATION_BUCKETS.find(
      (b) => m >= b.minMonths && (b.maxMonths === null || m < b.maxMonths),
    );
    if (bucket) counts[bucket.key] += 1;
  }

  const total = rows.length;
  const cohorts = DURATION_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: counts[b.key],
  }));
  const avgDurationMonths = total ? Math.round((totalMonths / total) * 10) / 10 : 0;

  return { cohorts, avgDurationMonths, total };
};

// Eng so'nggi ro'yxatga olingan o'quvchilar.
const computeRecentEnrollments = async (limit) =>
  prisma.user.findMany({
    where: activeStudentFilter(),
    // `id` ATAYLAB: Prisma `select` bilan uni avtomatik qaytarmaydi,
    // klient esa qatorni `_id` bo'yicha ochadi.
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      enrolledAt: true,
    },
    orderBy: { enrolledAt: "desc" },
    take: limit,
  });

// === Asosiy: getStudentStats ===
export const getStudentStats = async ({ months = 12, recentLimit = 8 } = {}) => {
  const [activeCount, ongoing, finished, enrollmentTrend, recentRows] =
    await Promise.all([
      prisma.user.count({ where: activeStudentFilter() }),
      computeDurationStats(ongoingFilter(), true),
      computeDurationStats(finishedFilter(), false),
      computeEnrollmentTrend(months),
      computeRecentEnrollments(recentLimit),
    ]);

  return {
    activeCount,
    ongoing,
    finished,
    enrollmentTrend,
    // Javobda `_id` QOLADI - klient ro'yxati shunga tayangan.
    recentEnrollments: recentRows.map((r) => ({ ...r, _id: r.id })),
  };
};
