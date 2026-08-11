/**
 * "LID KIRITILDI" KPI TRIGGERI TESTI (lead_created).
 *
 * SAVOL: "sotuvchiga har kiritilgan lid uchun pul to'lansa, uni firibdan
 *         nima to'xtatadi va halol ishi qayerda to'lanmay qoladi?"
 *
 * Bu triggerda mukofot forma to'ldirgani uchun to'lanadi - yozish esa tekin.
 * Qolgan triggerlarda soxta ma'lumot pulga aylanishi uchun kimdir davomat
 * belgilashi yoki to'lov kiritishi kerak edi; bu yerda yo'q. Shuning uchun
 * ikki darvoza (minStatus, dedupeDays) MANTIG'I aynan shu testda qulflanadi.
 *
 * BAZA KERAK EMAS: `Lead.find` vaqtincha almashtiriladi va trigger sof
 * funksiya sifatida tekshiriladi.
 *
 * ISHLATISH:  npm run test:lead-kpi
 */
import mongoose from "mongoose";
import Lead from "../src/models/lead.model.js";
import { getTrigger } from "../src/modules/staffPayroll/services/kpiTriggers.js";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.failures.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const eq = (name, actual, expected) =>
  actual === expected
    ? ok(name, `= ${actual}`)
    : bad(name, `kutilgan ${expected}, olindi ${actual}`);

const oid = (hex) => new mongoose.Types.ObjectId(hex.padStart(24, "0"));
const D = (s) => new Date(`${s}T00:00:00.000Z`);

const SELLER = oid("a1");
const OTHER_SELLER = oid("a2");

// Bitta lid yozuvi. `history` berilmasa - yaratilish yozuvi (leads.service
// har lidga aynan shunday boshlang'ich tarix yozadi).
let seq = 0;
const lead = ({
  id,
  phone,
  status = "new",
  history,
  createdAt,
  createdBy = SELLER,
}) => {
  seq += 1;
  return {
    _id: id ? oid(id) : oid(`f${seq}`),
    firstName: `Lid${seq}`,
    lastName: "",
    phone,
    status,
    statusHistory: (history || [status]).map((s) => ({ status: s })),
    createdAt,
    createdBy,
  };
};

// ─── Lead.find STUB'i ────────────────────────────────────────────────────
// Trigger ikki xil so'rov yuboradi: (1) shu xodimning oy ichidagi lidlari,
// (2) takroriy raqamlarni topish uchun telefon bo'yicha. Stub ikkalasini
// filtr shakliga qarab ajratadi.
const realFind = Lead.find.bind(Lead);
const useDataset = (rows) => {
  Lead.find = (filter = {}) => ({
    lean: async () => {
      if (filter.createdBy) {
        return rows.filter(
          (r) =>
            String(r.createdBy) === String(filter.createdBy) &&
            r.createdAt >= filter.createdAt.$gte &&
            r.createdAt < filter.createdAt.$lt,
        );
      }
      const phones = filter.phone?.$in || [];
      return rows.filter(
        (r) => phones.includes(r.phone) && r.createdAt < filter.createdAt.$lt,
      );
    },
  });
};

const trigger = getTrigger("lead_created");

// Yanvar 2026 uchun hisoblaymiz.
const run = (conditions = {}) =>
  trigger.evaluate({ employeeId: SELLER, year: 2026, month: 1, conditions });

const main = async () => {
  if (!trigger) {
    bad("trigger ro'yxatda", "lead_created topilmadi");
    return;
  }

  // ── 1) ASOSIY HOL ─────────────────────────────────────────────────────
  head("1. Asosiy hisob");
  useDataset([
    lead({ phone: "998901112233", createdAt: D("2026-01-05") }),
    lead({ phone: "998901112244", createdAt: D("2026-01-06") }),
    // Boshqa oy - kirmasligi kerak.
    lead({ phone: "998901112255", createdAt: D("2025-12-30") }),
    // Boshqa xodim - kirmasligi kerak.
    lead({
      phone: "998901112266",
      createdAt: D("2026-01-07"),
      createdBy: OTHER_SELLER,
    }),
  ]);
  eq("faqat shu xodimning shu oydagi lidlari", (await run()).length, 2);

  // ── 2) SIFAT DARVOZASI (minStatus) ────────────────────────────────────
  head("2. minStatus - 'new' da qolgan lid pul emas");
  useDataset([
    lead({ phone: "998901110001", createdAt: D("2026-01-05") }), // new
    lead({
      phone: "998901110002",
      status: "info_given",
      history: ["new", "info_given"],
      createdAt: D("2026-01-06"),
    }),
  ]);
  eq("shartsiz - ikkalasi ham", (await run()).length, 2);
  eq(
    "minStatus=info_given - faqat bittasi",
    (await run({ minStatus: "info_given" })).length,
    1,
  );

  head("3. minStatus - tarix bo'yicha, joriy status bo'yicha emas");
  useDataset([
    // Ma'lumot berilgan, keyin rad etilgan: ish BAJARILGAN, pul to'lanadi.
    lead({
      phone: "998901110003",
      status: "rejected",
      history: ["new", "info_given", "rejected"],
      createdAt: D("2026-01-05"),
    }),
    // Kiritildi va DARHOL rad etildi - eng oson firib yo'li. To'lanmaydi.
    lead({
      phone: "998901110004",
      status: "rejected",
      history: ["new", "rejected"],
      createdAt: D("2026-01-06"),
    }),
  ]);
  eq(
    "rad etilgan, lekin info_given bo'lgani to'lanadi",
    (await run({ minStatus: "info_given" })).length,
    1,
  );

  // ── 3) TAKRORIY RAQAM ─────────────────────────────────────────────────
  head("4. dedupeDays - bir raqam bir marta");
  useDataset([
    lead({ id: "b1", phone: "998901110005", createdAt: D("2026-01-05") }),
    lead({ id: "b2", phone: "998901110005", createdAt: D("2026-01-06") }),
    lead({ id: "b3", phone: "998901110005", createdAt: D("2026-01-07") }),
  ]);
  eq("uch marta kiritilgan raqam - bitta mukofot", (await run()).length, 1);
  eq(
    "dedupeDays=0 - tekshiruv o'chirilgan",
    (await run({ dedupeDays: 0 })).length,
    3,
  );

  head("5. dedupeDays - oraliqdan tashqarisi QONUNIY");
  // Kuzda ingliz tili, bahorda matematika: bitta raqam, ikki haqiqiy lid.
  useDataset([
    lead({ phone: "998901110006", createdAt: D("2025-09-01") }),
    lead({ phone: "998901110006", createdAt: D("2026-01-10") }),
  ]);
  eq("90 kundan keyingi qayta murojaat to'lanadi", (await run()).length, 1);
  eq(
    "dedupeDays=365 bo'lsa - to'lanmaydi",
    (await run({ dedupeDays: 365 })).length,
    0,
  );

  head("6. dedupe BARCHA yaratuvchilar bo'ylab");
  // Ikki sotuvchi bitta raqamni kiritsa, ikkalasi ham pul olmasligi kerak -
  // faqat birinchisi oladi.
  useDataset([
    lead({
      phone: "998901110007",
      createdAt: D("2026-01-05"),
      createdBy: OTHER_SELLER,
    }),
    lead({ phone: "998901110007", createdAt: D("2026-01-06") }),
  ]);
  eq("boshqa sotuvchi oldin kiritgan - to'lanmaydi", (await run()).length, 0);

  head("7. Bir xil sanadagi ikki yozuv - barqaror tanlov");
  useDataset([
    lead({ id: "c2", phone: "998901110008", createdAt: D("2026-01-05") }),
    lead({ id: "c1", phone: "998901110008", createdAt: D("2026-01-05") }),
  ]);
  const tie1 = await run();
  const tie2 = await run();
  eq("faqat bittasi to'lanadi", tie1.length, 1);
  eq(
    "qayta hisoblashda AYNAN o'sha qator",
    String(tie1[0]?.sourceId) === String(tie2[0]?.sourceId),
    true,
  );
  eq("kichik _id yutadi", String(tie1[0]?.sourceId), String(oid("c1")));

  // ── 4) QATOR SHAKLI ───────────────────────────────────────────────────
  head("8. Qaytgan qator shakli (payroll item uchun)");
  useDataset([
    lead({
      id: "d1",
      phone: "998901110009",
      status: "info_given",
      createdAt: D("2026-01-05"),
    }),
  ]);
  const [row] = await run();
  eq("sourceType", row?.sourceType, "lead");
  eq("sourceId lid _id si", String(row?.sourceId), String(oid("d1")));
  eq("quantity", row?.quantity, 1);
  // `base` faqat percent mukofoti uchun kerak - bu triggerda summa yo'q.
  eq("base = 0", row?.base, 0);
  eq("meta.phone dalil sifatida saqlanadi", row?.meta?.phone, "998901110009");
};

main()
  .catch((err) => bad("test yiqildi", err?.message || String(err)))
  .finally(() => {
    Lead.find = realFind;
    console.log(
      `\n${R.fail ? "\x1b[31m" : "\x1b[32m"}${R.pass} o'tdi, ${R.fail} yiqildi\x1b[0m`,
    );
    if (R.fail) {
      R.failures.forEach((f) => console.log(`  - ${f}`));
      process.exit(1);
    }
  });
