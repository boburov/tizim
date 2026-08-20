import { PrismaClient, Prisma } from "@prisma/client";
import env from "./env.js";
import logger from "./logger.js";
import ApiError from "../utils/ApiError.js";
import { validateDelegation } from "../constants/delegation.js";

// ═══════════════════════════════════════════════════════════════════════════
// Prisma klienti — eski `config/db.js` (mongoose.connect) o'rniga.
//
// NEGA BITTA GLOBAL NUSXA: har `new PrismaClient()` o'z ulanish hovuzini
// (connection pool) ochadi. Modul har safar qayta yuklansa (nodemon,
// testlar) hovuzlar to'planib, PostgreSQL `too many clients` bilan rad
// eta boshlaydi. `globalThis` da saqlash shuni oldini oladi.
// ═══════════════════════════════════════════════════════════════════════════

const globalForPrisma = globalThis;

const createClient = () =>
  new PrismaClient({
    // `passwordHash` HECH QACHON o'z-o'zidan qaytmaydi.
    //
    // Bu Mongoose'dagi `select: false` ning aynan ekvivalenti
    // (qarang: eski user.model.js). Ehtiyot chorasi ataylab shu
    // qatlamda: xesh javobga tushib qolishi uchun kimdir uni ochiq
    // so'rashi kerak bo'ladi, unutish bilan sizib chiqmaydi.
    //
    // Kerak bo'lganda (faqat login va parol tekshiruvida):
    //     prisma.user.findFirst({ omit: { passwordHash: false }, ... })
    omit: {
      user: { passwordHash: true },
    },
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" },
          ]
        : [{ emit: "event", level: "error" }],
  });

// ═══════════════════════════════════════════════════════════════════════════
// DECIMAL → SON NORMALIZATSIYASI
//
// Pul ustunlari `numeric(18,2)` (qarang schema.prisma §2) va Prisma ularni
// `Decimal` OBYEKTI qilib qaytaradi. Bu JavaScript'da o'ta xavfli:
//
//     total = a.amount + b.amount        // "700000" + "300000" = "700000300000"
//
// `+` operatori obyektni satrga keltiradi va xato HECH QANDAY ogohlantirish
// bermaydi — yig'indi shunchaki bema'ni kattalashadi. Bu butun kod bo'ylab
// 26 ta faylda, har bir hisobotda va har bir maosh hisobida bo'lishi mumkin
// edi.
//
// NEGA HAR BIR FAYLNI TUZATISH EMAS: unutilgan BITTA joy yetarli va uni
// test ushlamasligi mumkin (natija xato emas, shunchaki NOTO'G'RI son).
// Shuning uchun to'siq BITTA joyda — klient chegarasida.
//
// NIMA YUTAMIZ: bazada aniq `numeric`, ya'ni SAQLASH va SQL `SUM()` /
// `AVG()` — mutlaqo aniq (aynan shu yerda eng katta yig'indilar hisoblanadi).
// JS tomonida esa butun so'mlar bilan ishlaymiz: `double` 2^53 (≈9·10^15)
// gacha butun sonni va ular ustidagi +/− ni ANIQ bajaradi, real summalar
// esa 10^7–10^9 atrofida.
//
// KO'PAYTIRISH/BO'LISH (foiz, proratsiya, ulush) uchun esa `utils/money.js`
// — u Decimal ustida ishlaydi va yaxlitlash yo'qotishini oldini oladi.
//
// DIQQAT: `$queryRaw` BU KENGAYTMADAN O'TMAYDI (u model amali emas).
// Xom so'rov natijasidagi `numeric` ustunlar Decimal bo'lib qoladi —
// shuning uchun mavjud kod ularni allaqachon `Number(r.debit)` bilan
// o'raydi (masalan branchPnl.service.js). Yangi xom so'rovlarda ham
// shunday qilinishi SHART.
// ═══════════════════════════════════════════════════════════════════════════
// DIQQAT: `v.constructor.name === "Decimal"` TEKSHIRUVI ISHLAMAYDI.
// Prisma o'z ichidagi decimal.js ni MINIFIKATSIYA qiladi va sinf nomi
// `i` ga aylanadi. Nomga tayangan tekshiruv jimgina `false` qaytarib,
// butun normalizatsiyani o'chirib qo'yadi — natijada `a + b` satr
// biriktirishga aylanadi ("700000" + "300000" = "700000300000").
// Shuning uchun decimal.js ning O'Z statik metodi ishlatiladi.
const isDecimal = (v) =>
  v !== null &&
  typeof v === "object" &&
  (Prisma.Decimal.isDecimal(v) ||
    // Zaxira: xom SQL natijasi boshqa nusxadan kelishi mumkin.
    (typeof v.toNumber === "function" &&
      typeof v.toFixed === "function" &&
      typeof v.isNaN === "function" &&
      Array.isArray(v.d)));

const normalizeDecimals = (value) => {
  if (value === null || value === undefined) return value;
  if (isDecimal(value)) return value.toNumber();
  // Date/Buffer kabi sinf nusxalariga KIRMAYMIZ — ularni qayta qurish
  // buzadi (serialize.js dagi izohga qarang).
  if (Array.isArray(value)) return value.map(normalizeDecimals);
  if (typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = normalizeDecimals(v);
  return out;
};

const withDecimalNormalization = (client) =>
  client.$extends({
    name: "decimal-to-number",
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          return normalizeDecimals(await query(args));
        },
      },
    },
  });

/**
 * ══════════════════════════════════════════════════════════════════════
 * JURNAL O'ZGARMAS (immutable)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BU HIMOYA QAYTARILDI ──
 * Mongo davrida yozuvni tahrirlashni model darajasidagi `pre('save')`
 * qo'riqchisi to'sardi. Postgres'ga ko'chishda u YO'QOLDI: invariant
 * kodda hujjatlashtirilgan bo'lib qoldi
 * (`journal.service.js` → "Yozuv o'zgarmas"), lekin uni ushlab
 * turadigan hech narsa qolmadi.
 *
 * Bu jimgina yo'qotish edi: hech qanday test yiqilmadi, chunki
 * o'sha invariantni tekshiradigan yagona test
 * (`journalTreasury.test.js`) migratsiyadan keyin umuman ishga
 * tushmay qolgandi.
 *
 * ── NIMA TO'SILADI ──
 * `journal_entries` va `journal_lines` ustidagi HAR QANDAY yangilash.
 * Xato yozuvni tuzatishning yagona to'g'ri yo'li — STORNO
 * (`journal.reverse()`): teskari yozuv qo'shiladi va audit izida
 * xato ham, tuzatish ham ko'rinib turadi.
 *
 * ── NEGA O'CHIRISH TO'SILMAYDI ──
 * Demo/test tozalash skriptlari unga tayanadi va o'chirish KO'RINADI
 * (yozuv yo'qoladi). Xavfli holat — jimgina TAHRIR: summa o'zgaradi,
 * hisobot boshqa raqam ko'rsatadi, hech kim sezmaydi.
 *
 * ── CHEGARASI ──
 * Bu ilova qatlamidagi himoya: to'g'ridan-to'g'ri SQL yoki Prisma
 * Studio uni chetlab o'tadi. Mongo'dagi `pre('save')` ham xuddi
 * shunday edi (mongo shell uni ko'rmasdi), ya'ni bu YO'QOTILGAN
 * himoyani AYNAN tiklaydi. Bazadagi trigger kuchliroq bo'lardi,
 * lekin u migratsiya talab qiladi va tozalash yo'llarini
 * buzish xavfi bor.
 */
const IMMUTABLE_MODELS = new Set(["JournalEntry", "JournalLine"]);
const MUTATING_OPS = new Set(["update", "updateMany", "upsert"]);

const withJournalImmutability = (client) =>
  client.$extends({
    name: "journal-immutability",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (IMMUTABLE_MODELS.has(model) && MUTATING_OPS.has(operation)) {
            throw new ApiError(
              409,
              "Jurnal yozuvi o'zgarmas. Tuzatish uchun storno (reverse) ishlating",
              { code: "JOURNAL_IMMUTABLE" },
            );
          }
          return query(args);
        },
      },
    },
  });

// ═══════════════════════════════════════════════════════════════════════════
// DELEGATSIYA MATRITSASI VALIDATSIYASI — YO'QOTILGAN HOOK'NI TIKLASH.
//
// Mongo davrida `branch.model.js` da `pre("validate")` hook'i bor edi va u
// `validateDelegation()` ni chaqirardi. Uning MAQSADI servis qatlamini
// DUBLIKAT qilish emas edi — u SERVISDAN CHETLAB O'TUVCHI yo'llarni
// qoplardi: seed, migratsiya, import, qo'lda yozish.
//
// Prisma'da model qatlami yo'q, ya'ni hook ham yo'qoldi va himoya FAQAT
// `branches.service.update` da qoldi. `tests/branchDelegation.test.js`
// buni aynan shu sababdan tekshiradi ("Model pre(validate) buzuq
// matritsani saqlamaydi") va ko'chirishdan keyin o'sha tekshiruv yiqildi.
//
// NEGA BU MUHIM: buzuq matritsa `resolveRule()` da `approval` ga tushadi
// (fail-closed), ya'ni darhol xavf tug'dirmaydi — LEKIN u owner
// ko'rsatgan qoidani JIMGINA boshqa qoidaga aylantiradi. Owner "20%
// gacha o'zi bersin" deb yozgan bo'lsa-yu qiymat buzuq saqlangan bo'lsa,
// amalda HAR BIR chegirma tasdiqqa tushadi va sabab hech qayerda
// ko'rinmaydi.
//
// Naqsh `withJournalImmutability` bilan bir xil va o'sha izohda ochiq
// aytilgan: kengaytma yo'qotilgan Mongoose hook'ini AYNAN tiklaydi.
// ═══════════════════════════════════════════════════════════════════════════
const DELEGATION_WRITE_OPS = new Set([
  "create",
  "update",
  "upsert",
  "updateMany",
  "createMany",
]);

/** Yozuv argumentlaridan `delegation` bo'lgan har bir tanani yig'adi. */
const delegationPayloads = (args) => {
  const out = [];
  const push = (d) => {
    if (d && typeof d === "object" && d.delegation !== undefined && d.delegation !== null) {
      out.push(d.delegation);
    }
  };
  push(args?.data);
  push(args?.create);
  push(args?.update);
  if (Array.isArray(args?.data)) args.data.forEach(push);
  return out;
};

const withDelegationValidation = (client) =>
  client.$extends({
    name: "delegation-validation",
    query: {
      branch: {
        async $allOperations({ operation, args, query }) {
          if (DELEGATION_WRITE_OPS.has(operation)) {
            for (const delegation of delegationPayloads(args)) {
              const error = validateDelegation(delegation);
              if (error) throw new ApiError(400, error);
            }
          }
          return query(args);
        },
      },
    },
  });

const base = globalForPrisma.__prismaBase ?? createClient();

if (!globalForPrisma.__prismaBase) {
  base.$on("error", (e) => logger.error({ prisma: e }, "Prisma xatosi"));
  if (env.NODE_ENV === "development") {
    base.$on("warn", (e) => logger.warn({ prisma: e }, "Prisma ogohlantirishi"));
  }
  globalForPrisma.__prismaBase = base;
}

// Kengaytirilgan klient ham keshlanadi: `$extends` HAR CHAQIRUVDA yangi
// proxy yaratadi va uni modul darajasida qayta yaratish nodemon
// qayta yuklashlarida proxy zanjirini o'stirib borardi.
const prisma =
  globalForPrisma.__prisma ??
  withDelegationValidation(withJournalImmutability(withDecimalNormalization(base)));
if (!globalForPrisma.__prisma) globalForPrisma.__prisma = prisma;

// ─────────────────────────────────────────────────────────────────────────
// MONGO'DAN QOLGAN FARQ: TTL indekslari.
//
// MongoDB `expireAfterSeconds` bilan eskirgan hujjatni O'ZI o'chirardi.
// PostgreSQL'da bunday mexanizm yo'q. Shuning uchun quyidagi jadvallar
// endi `jobs/ttlCleanup.job.js` tomonidan tozalanadi:
//     caches         — expiresAt bo'yicha
//     refresh_tokens — expiresAt bo'yicha
//     ai_runs        — 90 kun
//     ai_usage_logs  — 400 kun
//
// Agar o'sha job o'chirilsa jadvallar CHEKSIZ o'sadi — bu jimgina
// disk to'lishiga olib keladi.
// ─────────────────────────────────────────────────────────────────────────

export const connectDB = async () => {
  await prisma.$connect();
  // Ulanish haqiqatan tirikligini tekshiramiz: $connect() hovuz yaratadi,
  // lekin birinchi so'rovgacha xatoni ko'rsatmasligi mumkin.
  await prisma.$queryRaw`SELECT 1`;
  logger.info("PostgreSQL ulandi (Prisma)");
};

export const disconnectDB = async () => {
  await prisma.$disconnect();
  logger.info("PostgreSQL uzildi");
};

export default prisma;
