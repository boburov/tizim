/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASDIQ INVARIANTLARI TESTI.
 *
 * SAVOL (o'zgarmadi): "Chiqim tasdig'i umumiy tasdiqqa kengaytirilganda
 * moliya hisobotlariga tasdiqlanmagan yozuv sizib kirmaydimi?"
 *
 * Uchta himoya qulflanadi:
 *   1. kategoriya TURDAN hosila (chaqiruvchi buzib yubora olmaydi);
 *   2. chiqim so'rovi summasiz o'tmaydi (limit tekshiruvining ma'nosi);
 *   3. subyekt qulfi indeksi PARTIAL va faqat `pending` uchun (moliya
 *      so'rovlari qulfga tushib qolmasin).
 *
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * ⚠ MONGOOSE MODELI YO'Q — DEMAK `doc.validate()` HAM YO'Q.
 *
 * Eski test `new Approval({...})` yasab, `pre("validate")` hook'i
 * kategoriyani turdan hosila qilishini tekshirardi. Prisma'da model
 * qatlami yo'q, shuning uchun O'SHA UCHTA QOIDA boshqa joyga ko'chgan —
 * va test endi ularni O'SHA JOYDA tekshiradi:
 *
 *   1. kategoriya  → `constants/approvals.js: resolveCategory()` VA
 *                    `expenseApproval.service.js: createRequest()`
 *                    (u chaqiruvchining `category` sini UMUMAN O'QIMAYDI);
 *   2. summa       → `createRequest()` dagi ochiq tekshiruv;
 *   3. subyekt qulfi → PostgreSQL PARTIAL UNIQUE INDEKSI
 *                    (`20260815200910_partial_unique_indexes`).
 *
 * ⚠ BU KUCHSIZLANISH EMAS: 1 va 2 endi HAQIQIY yozish yo'lida
 * (`createRequest`) tekshiriladi — ya'ni Mongoose hook'idan ham
 * kuchliroq, chunki uni chetlab o'tadigan yo'l yo'q. 3 esa sxema
 * e'lonini emas, BAZADAGI amaldagi indeksni o'qiydi.
 *
 * Endi baza KERAK (ilgari offline edi) — shuning uchun fixture va
 * kafolatli tozalash bor.
 *
 * ISHLATISH:  npm run test:approval
 * ═══════════════════════════════════════════════════════════════════════════
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import {
  APPROVAL_KINDS,
  APPROVAL_CATEGORIES,
  KIND_CATEGORY,
  ALL_APPROVAL_KINDS,
  resolveCategory,
} from "../src/constants/approvals.js";
import * as approvalService from "../src/modules/expenseApprovals/services/expenseApproval.service.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → ${d}`);
};
const check = (name, cond, detail = "") =>
  cond ? ok(name) : bad(name, detail || "shart bajarilmadi");

const fx = createFixtures();

const run = async () => {
  const branch = await fx.branch("AP");
  const requester = await fx.user("ap-requester", { role: "director", homeBranchId: branch.id });

  /** `createRequest` ni chaqiradi va natijani/xatoni qaytaradi. */
  const create = async (extra) => {
    try {
      const doc = await approvalService.createRequest({
        branchId: branch.id,
        currentUser: { id: requester.id, _id: requester.id },
        ...extra,
      });
      if (doc?.id) fx.track("approval", doc.id);
      return { doc, err: null };
    } catch (err) {
      return { doc: null, err };
    }
  };

  console.log("\n\x1b[1mTASDIQ INVARIANTLARI\x1b[0m");

  // ── 1. Kategoriya turdan hosila ───────────────────────────────
  console.log("\n\x1b[1m1) Kategoriya turdan hosila\x1b[0m");

  {
    const { doc, err } = await create({ kind: APPROVAL_KINDS.SALARY_PAYMENT, amount: 500_000 });
    check("chiqim → financial", !err && doc?.category === APPROVAL_CATEGORIES.FINANCIAL, err?.message);
  }
  {
    const { doc, err } = await create({ kind: APPROVAL_KINDS.SALARY_TERMS });
    check(
      "maosh sharti → configuration",
      !err && doc?.category === APPROVAL_CATEGORIES.CONFIGURATION,
      err?.message,
    );
  }

  // ⚠ ENG MUHIMI: chaqiruvchi NOTO'G'RI kategoriya yuborsa ham yozuv
  // to'g'ri turkumga tushadi. Aks holda sozlama so'rovi "financial"
  // bo'lib moliya summasiga qo'shilardi.
  {
    const { doc, err } = await create({
      kind: APPROVAL_KINDS.SALARY_TERMS,
      category: APPROVAL_CATEGORIES.FINANCIAL, // ← ataylab yolg'on
    });
    check(
      "qo'lda berilgan NOTO'G'RI kategoriya e'tiborga OLINMAYDI",
      !err && doc?.category === APPROVAL_CATEGORIES.CONFIGURATION,
      err?.message || `kutildi configuration, keldi ${doc?.category}`,
    );
  }

  // Noma'lum tur — `resolveCategory` XATO berishi shart (jimgina
  // `financial` ga tushmasligi kerak).
  {
    let threw = false;
    try {
      resolveCategory("yangi_nomalum_tur");
    } catch {
      threw = true;
    }
    check("noma'lum tur rad etiladi (resolveCategory)", threw);
    const { err } = await create({ kind: "yangi_nomalum_tur", amount: 1 });
    check("noma'lum tur rad etiladi (createRequest)", err !== null, "yozuv yaratildi!");
  }

  // Har bir tur `KIND_CATEGORY` xaritasida bormi (yangi tur qo'shilsa eslatadi).
  const orphan = ALL_APPROVAL_KINDS.filter((k) => !KIND_CATEGORY[k]);
  check(
    "barcha turlar kategoriyaga biriktirilgan",
    orphan.length === 0,
    `biriktirilmagan: ${orphan.join(", ")}`,
  );

  // ── 2. Summa qoidasi ──────────────────────────────────────────
  console.log("\n\x1b[1m2) Summa qoidasi\x1b[0m");

  for (const kind of ALL_APPROVAL_KINDS.filter(
    (k) => KIND_CATEGORY[k] === APPROVAL_CATEGORIES.FINANCIAL,
  )) {
    const noAmount = await create({ kind });
    check(`${kind}: summasiz RAD etiladi`, noAmount.err !== null, "yozuv yaratildi!");
    const withAmount = await create({ kind, amount: 1 });
    check(`${kind}: summa bilan o'tadi`, withAmount.err === null, withAmount.err?.message);
  }

  for (const kind of ALL_APPROVAL_KINDS.filter(
    (k) => KIND_CATEGORY[k] === APPROVAL_CATEGORIES.CONFIGURATION,
  )) {
    // ⚠ HAR BIR SO'ROV BOSHQA `subjectKey` BILAN: partial unique indeks
    // bir xil kalitli ikkinchi `pending` so'rovni ATAYLAB to'sadi
    // (3-bo'limda aynan shu tekshiriladi).
    const { doc, err } = await create({ kind, subjectKey: `${fx.suffix}-${kind}` });
    check(`${kind}: summasiz o'tadi (takrorlanuvchi - limit ma'nosiz)`, err === null, err?.message);
    check(`${kind}: summa null bo'lib qoladi`, doc?.amount === null, `keldi ${doc?.amount}`);
  }

  // Manfiy summa — alohida qoida.
  {
    const { err } = await create({ kind: APPROVAL_KINDS.SALARY_PAYMENT, amount: -5 });
    check("manfiy summa rad etiladi", err !== null, "yozuv yaratildi!");
  }

  // ── 3. Subyekt qulfi indeksi ──────────────────────────────────
  console.log("\n\x1b[1m3) Subyekt qulfi (lost update himoyasi)\x1b[0m");

  // ⚠ SXEMA E'LONI EMAS, BAZADAGI AMALDAGI INDEKS o'qiladi — migratsiya
  // qo'llanmagan bo'lsa test buni ko'rishi kerak.
  const [idx] = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'expense_approvals'
      AND indexdef ILIKE '%subjectKey%'
      AND indexdef ILIKE '%UNIQUE%'
  `;
  check("subjectKey unique indeksi bazada mavjud", !!idx, "partial unique migratsiyasi qo'llanmagan?");
  if (idx) {
    check(
      "faqat PENDING holatga tegishli",
      /status.*=.*'pending'/i.test(idx.indexdef),
      `aks holda rad etilgan so'rov ham qulfni ushlab turardi — ${idx.indexdef}`,
    );
    check(
      "subjectKey'siz (moliya) yozuvlar indeksdan TASHQARIDA",
      /subjectKey.*IS NOT NULL/i.test(idx.indexdef),
      `aks holda ketma-ket ikki maosh to'lovi so'rovi bloklanardi — ${idx.indexdef}`,
    );
  }

  // ── 3b. Qulf AMALDA ishlaydimi (indeks e'loni yetarli emas) ────
  //
  // Indeks matnini o'qish uning HAQIQATAN qo'llanayotganini isbotlamaydi.
  // Shuning uchun bir xil `subjectKey` bilan ikkinchi `pending` so'rov
  // yuboriladi — u RAD ETILISHI shart.
  {
    const key = `${fx.suffix}-lock`;
    const first = await create({ kind: APPROVAL_KINDS.DISCOUNT_SET, subjectKey: key });
    const second = await create({ kind: APPROVAL_KINDS.DISCOUNT_SET, subjectKey: key });
    check("bir xil subjectKey bilan birinchi so'rov o'tadi", first.err === null, first.err?.message);
    check(
      "IKKINCHI pending so'rov TO'SILADI (qulf amalda ishlaydi)",
      second.err !== null,
      "ikkita pending so'rov yonma-yon yaratildi — lost update xavfi",
    );
  }

  // ── 4. Jadval nomi va eski yozuvlar standarti ──────────────────
  console.log("\n\x1b[1m4) Jadval va standart qiymat\x1b[0m");
  const [tbl] = await prisma.$queryRaw`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_name = 'expense_approvals' AND column_name = 'category'
  `;
  check("jadval nomi 'expense_approvals'", !!tbl, "jadval topilmadi");
  check(
    "eski yozuvlar uchun kategoriya standarti = financial",
    String(tbl?.column_default || "").includes("financial"),
    `keldi: ${tbl?.column_default}`,
  );
};

run()
  .catch((e) => {
    bad("TEST YIQILDI", e?.message || String(e));
    if (process.env.DEBUG) console.error(e);
  })
  .finally(async () => {
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} xato\x1b[0m`,
    );
    if (R.notes.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      for (const n of R.notes) console.log(`  • ${n}`);
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail > 0 ? 1 : 0);
  });
