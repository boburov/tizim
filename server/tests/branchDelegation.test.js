/**
 * DELEGATSIYA MATRITSASI + RUXSAT KO'LAMI TESTI.
 *
 * ASOSIY QOIDA (owner qarori):
 *   Filial rahbari O'Z FILIALIDA hamma narsani qila oladi.
 *   Faqat GLOBAL va FILIALLARARO ishlar owner'da qoladi.
 *
 * SHUNING UCHUN BU TEST UCH NARSANI QULFLAYDI:
 *
 *   1. STANDART = `auto`. Matritsa kiritilmagan filialda direktor
 *      hamma sozlamani o'zi bajaradi. Agar bu buzilsa, owner yana
 *      har bir amalni tasdiqlashga qaytadi.
 *
 *   2. BUZUQ QIYMAT = `approval` (fail-closed). Bazaga qo'lda yozilgan
 *      noto'g'ri rejim CHEKSIZ huquqqa aylanmasligi kerak. Ikkala
 *      "standart" bir xil bo'lib qolsa, shu himoya yo'qoladi.
 *
 *   3. OWNER-ONLY KALITLAR direktorga TUSHMAYDI. Ular imtiyoz oshirish
 *      yo'llari: `branches.view_all` sabab A filial direktori B filial
 *      o'qituvchisining parolini o'qiy olardi.
 *
 * Va bitta aniq biznes to'sig'i:
 *   4. HECH KIM O'ZIGA maosh stavkasi belgilay olmaydi - rejimdan ham,
 *      ruxsatdan ham qat'i nazar.
 *
 * IZOLYATSIYA: o'z test bazasini yaratadi va oxirida O'CHIRADI.
 *
 * ISHLATISH:
 *   npm run test:delegation
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Alohida Mongo bazasi + `dropDatabase()` o'rniga prefiksli fixture va
 * kafolatli tozalash (`tests/helpers/prismaFixtures.js`). Xavfsizlik va
 * biznes DA'VOLARI o'zgarmadi — faqat ma'lumotga murojaat qatlami.
 *
 * Bog'lanish maydonlari qayta nomlandi: `teacher` → `teacherId`,
 * `group` → `groupId`, `student` → `studentId` va h.k.
 */
const fx = createFixtures();

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
const check = (n, cond, d = "") => (cond ? ok(n) : bad(n, d || "shart bajarilmadi"));
const grab = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

const run = async () => {
  const { PERMISSIONS } = await import("../src/constants/permissions.js");
  const {
    OWNER_ONLY_PERMISSIONS,
    BRANCH_LOCAL_PERMISSIONS,
    isOwnerOnlyPermission,
  } = await import("../src/constants/permissionScope.js");
  const {
    DELEGATION_MODES,
    DELEGATABLE_KINDS,
    DEFAULT_DELEGATION_MODE,
    FALLBACK_DELEGATION_MODE,
    validateDelegation,
    resolveRule,
  } = await import("../src/constants/delegation.js");
  const { APPROVAL_KINDS } = await import("../src/constants/approvals.js");
  const { checkConfigApproval } = await import(
    "../src/modules/expenseApprovals/services/expenseApproval.service.js"
  );
  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );
  const { assertNotSelfSalary } = await import(
    "../src/helpers/selfSalary.guard.js"
  );

  const { AUTO, THRESHOLD, APPROVAL, FORBIDDEN } = DELEGATION_MODES;
  const K = APPROVAL_KINDS;

  // Direktor: sozlama tasdiqlash huquqi YO'Q (matritsa unga qo'llanadi).
  const DIRECTOR = [PERMISSIONS.FINANCE_MANAGE, PERMISSIONS.TEACHERS_CREATE];
  // Owner-ga tenglashtirilgan: matritsadan tashqarida.
  const APPROVER = [PERMISSIONS.APPROVALS_DECIDE_CONFIG];

  const mkBranch = async (name, delegation) => fx.branch(name, { delegation });

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) RUXSAT KO'LAMI: direktor nimani oladi\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const allKeys = Object.values(PERMISSIONS);

  check(
    "Har bir ruxsat ANIQ bitta to'plamda",
    allKeys.every(
      (k) =>
        (OWNER_ONLY_PERMISSIONS.includes(k) ? 1 : 0) +
          (BRANCH_LOCAL_PERMISSIONS.includes(k) ? 1 : 0) ===
        1,
    ),
    "kalit ikkala ro'yxatda yoki hech qaysisida yo'q",
  );

  check(
    "Direktor ro'yxati kalitlarning KO'PCHILIGINI qamraydi",
    BRANCH_LOCAL_PERMISSIONS.length > allKeys.length / 2,
    `${BRANCH_LOCAL_PERMISSIONS.length}/${allKeys.length}`,
  );

  // Imtiyoz oshirish yo'llari - bulardan bittasi ham tushib qolmasin.
  for (const key of [
    PERMISSIONS.SYSTEM_ADMIN_ACCESS,
    PERMISSIONS.BRANCHES_VIEW_ALL,
    PERMISSIONS.BRANCHES_UPDATE,
    PERMISSIONS.BRANCHES_CREATE,
    PERMISSIONS.BRANCHES_DELETE,
    PERMISSIONS.APPROVALS_DECIDE_CONFIG,
    PERMISSIONS.FINANCE_APPROVE,
  ]) {
    check(
      `"${key}" direktorga BERILMAYDI`,
      isOwnerOnlyPermission(key) && !BRANCH_LOCAL_PERMISSIONS.includes(key),
      "imtiyoz oshirish yo'li ochiq qoldi",
    );
  }

  // Kundalik filial ishi - bularning hammasi bo'lishi SHART.
  for (const key of [
    PERMISSIONS.TEACHERS_CREATE,
    PERMISSIONS.STUDENTS_CREATE,
    PERMISSIONS.GROUPS_CREATE,
    PERMISSIONS.GRADES_RECORD,
    PERMISSIONS.ATTENDANCE_RECORD,
    PERMISSIONS.FINANCE_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.EXPENSES_CREATE,
    PERMISSIONS.ROLES_UPDATE,
    PERMISSIONS.BRANCHES_READ,
  ]) {
    check(`"${key}" direktorda BOR`, BRANCH_LOCAL_PERMISSIONS.includes(key));
  }

  check(
    "Global kataloglar owner'da qoladi",
    [
      PERMISSIONS.COURSES_MANAGE,
      PERMISSIONS.HOLIDAYS_MANAGE,
      PERMISSIONS.ARCHIVE_REASONS_MANAGE,
      PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE,
      PERMISSIONS.FEEDBACK_TYPES_MANAGE,
    ].every(isOwnerOnlyPermission),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) STANDART = auto (matritsasiz filial)\x1b[0m");
  // ─────────────────────────────────────────────────────────

  check("DEFAULT_DELEGATION_MODE === auto", DEFAULT_DELEGATION_MODE === AUTO);
  check(
    "FALLBACK_DELEGATION_MODE === approval (buzuq qiymat uchun)",
    FALLBACK_DELEGATION_MODE === APPROVAL,
  );
  check(
    "Ikki standart BIR XIL EMAS",
    DEFAULT_DELEGATION_MODE !== FALLBACK_DELEGATION_MODE,
    "bir xil bo'lsa fail-closed himoyasi yo'qoladi",
  );

  const plain = await mkBranch("Matritsasiz filial", undefined);

  for (const kind of Object.keys(DELEGATABLE_KINDS)) {
    const res = await checkConfigApproval({
      permissions: DIRECTOR,
      kind,
      branchId: plain.id,
      // auto rejimida o'lchov kerak emas.
    });
    check(
      `Matritsasiz: "${DELEGATABLE_KINDS[kind].label}" - direktor O'ZI bajaradi`,
      res.needsApproval === false,
      `needsApproval=${res.needsApproval}`,
    );
  }

  const approverRes = await checkConfigApproval({
    permissions: APPROVER,
    kind: K.STAFF_HIRE,
    branchId: plain.id,
  });
  check(
    "approvals.decide_config bor: matritsadan tashqarida",
    approverRes.needsApproval === false,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) OWNER HUQUQNI QAYTARIB OLADI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const restricted = await mkBranch("Cheklangan filial", {
    [K.STAFF_HIRE]: { mode: APPROVAL },
    [K.DISCOUNT_SET]: { mode: THRESHOLD, maxPercent: 20, maxAmount: 200000 },
    [K.GROUP_FEE_SET]: { mode: THRESHOLD, minAmount: 800000 },
    [K.SALARY_TERMS]: { mode: FORBIDDEN },
  });

  const hire = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.STAFF_HIRE,
    branchId: restricted.id,
  });
  check("approval: ishga olish tasdiqqa qaytdi", hire.needsApproval === true);

  const within = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.DISCOUNT_SET,
    branchId: restricted.id,
    metrics: { percent: 20 },
  });
  check("threshold: 20% o'tadi (chegaraning o'zi ruxsat)", within.needsApproval === false);

  const over = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.DISCOUNT_SET,
    branchId: restricted.id,
    metrics: { percent: 21 },
  });
  check("threshold: 21% tasdiqqa", over.needsApproval === true);

  const noMetric = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.DISCOUNT_SET,
    branchId: restricted.id,
    metrics: {},
  });
  check(
    "threshold + o'lchovsiz: tasdiqqa (fail-closed)",
    noMetric.needsApproval === true,
  );

  const priceOk = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.GROUP_FEE_SET,
    branchId: restricted.id,
    metrics: { amount: 900000 },
  });
  check("Narx poldan yuqori (900k ≥ 800k): o'tadi", priceOk.needsApproval === false);

  const priceLow = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.GROUP_FEE_SET,
    branchId: restricted.id,
    metrics: { amount: 400000 },
  });
  check(
    "Narx poldan past (400k < 800k): tasdiqqa",
    priceLow.needsApproval === true,
    "narxni tushirish barchaga chegirma berish bilan barobar",
  );

  const forbiddenErr = await grab(() =>
    checkConfigApproval({
      permissions: DIRECTOR,
      kind: K.SALARY_TERMS,
      branchId: restricted.id,
      metrics: { amount: 1000 },
    }),
  );
  check(
    "forbidden: 403 (so'rov ham yaratilmaydi)",
    forbiddenErr?.statusCode === 403,
    `xato=${forbiddenErr?.statusCode}`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) FAIL-CLOSED: buzuq qiymat auto'ga aylanmaydi\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const sneaky = await mkBranch("Chetlab o'tilgan", {
    [K.SALARY_TERMS]: { mode: APPROVAL },
  });
  // Validatsiyani BUTUNLAY chetlab o'tib noto'g'ri rejim yozamiz.
  //
  // ⚠ XOM SQL ATAYLAB — VA BU AYNAN MONGO VERSIYASINING EKVIVALENTI.
  //
  // Mongo'da bu `Branch.collection.updateOne` edi: Mongoose sxemasidan
  // PASTDAGI xom kolleksiya, ya'ni `pre("validate")` hook'i ishlamasdi.
  //
  // Prisma'da `prisma.branch.update(...)` ENDI ISHLAMAYDI — chunki
  // `config/prisma.js` dagi `delegation-validation` kengaytmasi buzuq
  // matritsani rad etadi (o'sha yo'qotilgan hook shunday tiklandi).
  // Shuning uchun bu yerda `$executeRaw` kerak: u ilova qatlamini
  // BUTUNLAY chetlab o'tadi — xuddi `mongosh`, Prisma Studio yoki eski
  // migratsiya skripti kabi.
  //
  // TEKSHIRUV MAQSADI O'ZGARMADI: bazada ALLAQACHON turgan buzuq qiymat
  // O'QISHDA `auto` ga aylanmasligi (fail-closed) isbotlanadi.
  await prisma.$executeRaw`
    UPDATE "branches"
    SET "delegation" = '{"salary_terms":{"mode":"hammasi_mumkin"}}'::jsonb
    WHERE "id" = ${sneaky.id}
  `;

  const raw = await prisma.branch.findUnique({
    where: { id: sneaky.id },
    select: { delegation: true },
  });
  check(
    "Bazada buzuq qiymat turibdi (test to'g'ri qurilgan)",
    raw?.delegation?.salary_terms?.mode === "hammasi_mumkin",
  );
  check(
    "resolveRule buzuq qiymatni `approval` ga qaytaradi",
    resolveRule(raw?.delegation, K.SALARY_TERMS).mode === APPROVAL,
    "buzuq qiymat `auto` bo'lib ketdi - cheksiz huquq",
  );

  const sneakyRes = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.SALARY_TERMS,
    branchId: sneaky.id,
    metrics: { amount: 999999999 },
  });
  check(
    "Buzuq qiymat: amal TASDIQQA tushadi",
    sneakyRes.needsApproval === true,
  );

  const unknownKind = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: "nonexistent_kind",
    branchId: plain.id,
  });
  check(
    "Noma'lum tur: tasdiqqa (fail-closed)",
    unknownKind.needsApproval === true,
  );

  const financialKind = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.SALARY_PAYMENT,
    branchId: plain.id,
  });
  check(
    "Moliyaviy tur matritsaga tushmaydi: tasdiqqa",
    financialKind.needsApproval === true,
    "u expenseApprovalThreshold bilan boshqariladi",
  );

  const noBranch = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.STAFF_HIRE,
  });
  check(
    "«Barcha filiallar» rejimi (filial aniqlanmagan): tasdiqqa",
    noBranch.needsApproval === true,
  );

  const fromCtx = await runWithBranchContext(
    {
      branchId: String(plain.id),
      allowedBranchIds: [String(plain.id)],
      canSeeAllBranches: false,
      userId: null,
    },
    () => checkConfigApproval({ permissions: DIRECTOR, kind: K.STAFF_HIRE }),
  );
  check(
    "branchId berilmasa ALS kontekstidan olinadi",
    fromCtx.needsApproval === false,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) O'ZIGA O'ZI MAOSH TAQIQI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // Prisma kalitlari — 24 belgili hex SATR (baza yozuvi kerak emas:
  // `assertNotSelfSalary` sof solishtiruv qiladi).
  const uid = "a".repeat(24);
  const other = "b".repeat(24);

  const selfErr = await grab(async () => assertNotSelfSalary({ _id: uid }, uid));
  check(
    "O'ziga stavka qo'yish: 403",
    selfErr?.statusCode === 403,
    `xato=${selfErr?.statusCode}`,
  );

  const selfErrStr = await grab(async () =>
    assertNotSelfSalary({ _id: uid }, String(uid)),
  );
  check("String ID bilan ham tutiladi", selfErrStr?.statusCode === 403);

  const selfErrDoc = await grab(async () =>
    assertNotSelfSalary({ _id: uid }, { _id: uid }),
  );
  check("Populate qilingan hujjat bilan ham tutiladi", selfErrDoc?.statusCode === 403);

  const otherOk = await grab(async () => assertNotSelfSalary({ _id: uid }, other));
  check("Boshqaga stavka qo'yish: ruxsat", otherOk === null);

  const seedOk = await grab(async () => assertNotSelfSalary(null, uid));
  check(
    "Kontekstsiz (seed/job): tekshirilmaydi",
    seedOk === null,
    "job'lar to'xtab qolardi",
  );

  // Taqiq maosh REJIMIGA bog'liq EMAS: matritsada `auto` bo'lsa ham
  // amal qiladi (u boshqa qatlamda - servis ichida).
  check(
    "salary_terms uchun `auto` endi RUXSAT ETILGAN",
    DELEGATABLE_KINDS[K.SALARY_TERMS].modes.includes(AUTO),
    "o'ziga o'zi taqiqi aniq to'siq bilan yopilgan, toifani bloklash bilan emas",
  );
  check(
    "teacher_compensation_set uchun ham `auto` ruxsat",
    DELEGATABLE_KINDS[K.TEACHER_COMPENSATION_SET].modes.includes(AUTO),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m6) VALIDATSIYA\x1b[0m");
  // ─────────────────────────────────────────────────────────

  check(
    "Delegatsiya qilinmaydigan tur RAD ETILADI",
    validateDelegation({ [K.SALARY_PAYMENT]: { mode: AUTO } }) !== null,
  );
  check(
    "threshold + chegarasiz RAD ETILADI",
    validateDelegation({ [K.DISCOUNT_SET]: { mode: THRESHOLD } }) !== null,
    "chegarasiz threshold cheksiz auto bilan barobar",
  );
  check(
    "Turga tegishsiz chegara RAD ETILADI (staff_hire + maxAmount)",
    validateDelegation({ [K.STAFF_HIRE]: { mode: AUTO, maxAmount: 100 } }) !== null,
  );
  check(
    "group_fee_set + maxAmount RAD ETILADI (yo'nalish teskari)",
    validateDelegation({
      [K.GROUP_FEE_SET]: { mode: THRESHOLD, maxAmount: 500000 },
    }) !== null,
  );
  check(
    "maxPercent > 100 RAD ETILADI",
    validateDelegation({
      [K.DISCOUNT_SET]: { mode: THRESHOLD, maxPercent: 150 },
    }) !== null,
  );
  check(
    "Noma'lum rejim RAD ETILADI",
    validateDelegation({ [K.STAFF_HIRE]: { mode: "yes_please" } }) !== null,
  );
  check(
    "To'g'ri matritsa QABUL QILINADI",
    validateDelegation({
      [K.STAFF_HIRE]: { mode: AUTO },
      [K.SALARY_TERMS]: { mode: THRESHOLD, maxAmount: 50000 },
      [K.GROUP_FEE_SET]: { mode: THRESHOLD, minAmount: 800000 },
    }) === null,
  );

  // ⚠ ILGARI BU MONGOOSE `pre("validate")` HOOK'I EDI.
  //
  // Prisma'da model qatlami yo'q, shuning uchun himoya `config/prisma.js`
  // dagi `delegation-validation` KENGAYTMASIGA ko'chirildi — u ham
  // SERVISDAN CHETLAB O'TUVCHI yo'llarni (seed, import, migratsiya)
  // qoplaydi, xuddi eski hook kabi.
  //
  // Ko'chirishdan keyin bu tekshiruv YIQILGAN edi: himoya faqat
  // `branches.service.update` da qolgan, ya'ni to'g'ridan-to'g'ri
  // yozuvlar buzuq matritsani saqlab qo'ya olardi.
  const modelErr = await grab(() =>
    mkBranch("Buzuq matritsa", { [K.DISCOUNT_SET]: { mode: THRESHOLD } }),
  );
  check(
    "Prisma kengaytmasi buzuq matritsani saqlamaydi",
    modelErr !== null,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m7) O'LCHOV XARITASI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const {
    discountMetrics,
    groupFeeMetrics,
    salaryTermsMetrics,
    compensationMetrics,
  } = await import("../src/helpers/configMetrics.helper.js");

  check(
    "discountMetrics: percent -> foizga",
    discountMetrics({ type: "percent", value: 15 }).percent === 15 &&
      discountMetrics({ type: "percent", value: 15 }).amount === undefined,
  );
  check(
    "discountMetrics: fixed -> so'mga",
    discountMetrics({ type: "fixed", value: 50000 }).amount === 50000,
  );
  check(
    "discountMetrics: value yo'q -> bo'sh (fail-closed)",
    Object.keys(discountMetrics({ type: "percent" })).length === 0,
  );
  check(
    "groupFeeMetrics: amount -> so'mga",
    groupFeeMetrics({ amount: 750000 }).amount === 750000,
  );
  check(
    "salaryTermsMetrics: mixed ikkala qismni qaytaradi",
    salaryTermsMetrics({ salaryType: "mixed", fixedAmount: 1000, percentRate: 10 })
      .amount === 1000 &&
      salaryTermsMetrics({ salaryType: "mixed", fixedAmount: 1000, percentRate: 10 })
        .percent === 10,
  );
  check(
    "compensationMetrics: variableType=percent -> foizga",
    compensationMetrics({ variableType: "percent", variableRate: 30 }).percent === 30,
  );
  check(
    "compensationMetrics: per_lesson_hour -> so'mga",
    compensationMetrics({ variableType: "per_lesson_hour", variableRate: 30000 })
      .amount === 30000,
  );
  check(
    "compensationMetrics: base va rate dan KATTASI",
    compensationMetrics({
      baseAmount: 2000000,
      variableType: "per_group",
      variableRate: 500000,
    }).amount === 2000000,
  );

  const mixedBranch = await mkBranch("Aralash maosh", {
    [K.SALARY_TERMS]: { mode: THRESHOLD, maxAmount: 1000000, maxPercent: 10 },
  });
  const mixedBad = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.SALARY_TERMS,
    branchId: mixedBranch.id,
    metrics: { amount: 500000, percent: 25 },
  });
  check(
    "Aralash: so'm chegarada, foiz oshgan -> tasdiqqa",
    mixedBad.needsApproval === true,
  );
  const mixedOk = await checkConfigApproval({
    permissions: DIRECTOR,
    kind: K.SALARY_TERMS,
    branchId: mixedBranch.id,
    metrics: { amount: 500000, percent: 8 },
  });
  check("Aralash: ikkalasi chegarada -> o'tadi", mixedOk.needsApproval === false);

  // ── Yakun ──

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.fail) {
    console.log("\nYiqilganlar:");
    R.notes.forEach((n) => console.log(`  • ${n}`));
    process.exit(1);
  }
};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
        `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
    );
    if (R.fail) R.notes?.forEach?.((n) => console.log(`  • ${n}`));
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
