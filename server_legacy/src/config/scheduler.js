// pg-boss v12 ESM moduli va NOMLI eksport beradi (`default` yo'q) -
// `import PgBoss from "pg-boss"` ishlamaydi.
import { PgBoss } from "pg-boss";
import env from "./env.js";
import logger from "./logger.js";

// ═══════════════════════════════════════════════════════════════════════════
// REJALASHTIRUVCHI (scheduler) — eski Agenda o'rniga pg-boss.
//
// NEGA ALMASHTIRILDI: Agenda FAQAT MongoDB bilan ishlaydi (u ishlarni
// `agendaJobs` kolleksiyasida saqlaydi). Mongo olib tashlangach, Agenda
// bilan qolishning yagona yo'li — faqat joblar uchun alohida Mongo
// serverini tirik qoldirish bo'lardi. Bu esa migratsiyaning maqsadiga zid.
//
// pg-boss xuddi shu ishni PostgreSQL'da bajaradi va ishlarni o'sha
// tranzaksion bazada saqlaydi.
//
// ─────────────────────────────────────────────────────────────────────────
// BU MODUL AGENDA API'SINI AYNAN TAKRORLAYDI.
//
// Sabab: 23 ta job fayli va 3 ta servis `agenda.define(...)`,
// `agenda.now(...)`, `agenda.schedule(...)` ni chaqiradi. Agar API
// o'zgarsa, o'sha 26 fayl ham qayta yozilishi kerak edi — ya'ni bitta
// migratsiyada ikkita katta o'zgarish aralashib ketardi.
//
// Shuning uchun bu yerda ATAYLAB moslashtiruvchi qatlam (adapter) bor:
//   - handler'ga `job.attrs.data` shaklida ma'lumot beriladi (Agenda kabi),
//     garchi pg-boss `job.data` bersa ham;
//   - `define()` darhol ishga tushirmaydi, faqat ro'yxatga oladi —
//     `start()` chaqirilgandagina navbatlar yaratilib, worker'lar ulanadi.
// ═══════════════════════════════════════════════════════════════════════════

const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  // pg-boss o'z jadvallarini alohida sxemada saqlaydi — Prisma
  // migratsiyalari bilan to'qnashmasligi uchun.
  schema: "pgboss",
});

boss.on("error", (err) => logger.error({ err }, "pg-boss xatosi"));

// define() bilan ro'yxatga olingan ishlar. start() gacha kutib turadi.
const registry = new Map();

let started = false;

/**
 * Agenda: agenda.define(name, [options], handler)
 *
 * options ixtiyoriy — Agenda'da `{ concurrency, lockLifetime }` bo'lgan.
 * Ular pg-boss atamalariga o'giriladi:
 *   concurrency  → localConcurrency (bir vaqtda nechta ish bajariladi)
 *   lockLifetime → expireInSeconds  (ish "osilib qolgan" deb sanaladigan vaqt)
 */
export const define = (name, optionsOrHandler, maybeHandler) => {
  const handler =
    typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;
  const options = typeof optionsOrHandler === "function" ? {} : optionsOrHandler || {};

  if (typeof handler !== "function") {
    throw new Error(`Job uchun handler berilmadi: ${name}`);
  }

  registry.set(name, { handler, options });
};

// pg-boss handler'ga Job[] massivini beradi; Agenda esa bitta job va
// `job.attrs.data` kutadi. Shu farqni yopamiz.
const adaptHandler = (name, handler) => async (jobs) => {
  for (const job of jobs) {
    try {
      await handler({ attrs: { data: job.data ?? {}, name, _id: job.id } });
    } catch (err) {
      logger.error({ err, job: name }, "Job bajarilmadi");
      // Qayta urinish pg-boss tomonidan (retryLimit) hal qilinadi.
      throw err;
    }
  }
};

export const start = async () => {
  if (started) return;
  await boss.start();

  for (const [name, { handler, options }] of registry) {
    // pg-boss v10+ da navbat OLDIN yaratilishi shart.
    await boss.createQueue(name, {
      retryLimit: options.retryLimit ?? 3,
      retryDelay: options.retryDelay ?? 60,
      expireInSeconds: options.lockLifetime
        ? Math.ceil(options.lockLifetime / 1000)
        : 15 * 60,
    });

    await boss.work(
      name,
      {
        localConcurrency: options.concurrency ?? 1,
        batchSize: 1,
      },
      adaptHandler(name, handler),
    );
  }

  started = true;
  logger.info({ jobs: registry.size }, "Rejalashtiruvchi ishga tushdi (pg-boss)");
};

export const stop = async () => {
  if (!started) return;
  await boss.stop({ graceful: true });
  started = false;
  logger.info("Rejalashtiruvchi to'xtatildi");
};

/**
 * Agenda: agenda.every(cron, name, data, { timezone })
 * Takrorlanuvchi (cron) ish.
 */
export const every = async (cron, name, data = null, options = {}) => {
  // Eski jadvalni tozalaymiz: cron ifodasi o'zgarganda ikkita reja
  // yonma-yon qolib ketmasligi uchun (idempotent qayta ishga tushirish).
  await boss.unschedule(name).catch(() => null);
  await boss.schedule(name, cron, data, {
    tz: options.timezone || "UTC",
  });
};

/** Agenda: agenda.now(name, data) — darhol bajarish. */
export const now = async (name, data = null) => boss.send(name, data);

/** Agenda: agenda.schedule(when, name, data) — belgilangan vaqtda. */
export const schedule = async (when, name, data = null) =>
  boss.sendAfter(name, data, null, when instanceof Date ? when : new Date(when));

/** Agenda: agenda.cancel({ name }) — rejani bekor qilish. */
export const cancel = async (query = {}) => {
  const name = typeof query === "string" ? query : query.name;
  if (!name) return;
  await boss.unschedule(name).catch(() => null);
};

// Agenda bilan bir xil "default export" shakli — jobs/index.js va
// servislar `scheduler.define(...)` ko'rinishida ishlatadi.
const scheduler = { define, start, stop, every, now, schedule, cancel };

export default scheduler;
