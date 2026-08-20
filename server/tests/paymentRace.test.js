/**
 * TO'LOV POYGASI (RACE CONDITION) TESTI.
 *
 * SAVOL: "kassir ikki marta bosib yuborsa yoki ikki kassir bir vaqtda
 *         bitta o'quvchiga to'lov yozsa - pul ikki marta hisoblanmaydimi?"
 *
 * Bu savolga faqat HAQIQIY parallel so'rov javob beradi. Ketma-ket test
 * poygani ko'rsatmaydi - u faqat kod to'g'ri yozilganini tekshiradi.
 *
 * Tekshiriladigan invariantlar:
 *   1. paidAmount HECH QACHON expectedAmount dan oshmaydi (cap ishlaydi)
 *   2. paidAmount == faol tranzaksiyalar yig'indisi (kesh yolg'on gapirmaydi)
 *   3. ortiqcha pul yo'qolmaydi - depozitga tushadi (pul saqlanish qonuni)
 *   4. bir xil idempotencyKey bilan N ta parallel so'rov -> BITTA yozuv
 *
 * O'Z BAZASIDA ishlaydi (lc_race_test) va oxirida o'chiradi.
 *
 * ISHLATISH:  npm run test:race
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * 1) Alohida Mongo bazasi o'rniga prefiksli fixture + kafolatli tozalash.
 *    `txnService.create` JURNAL yozuvi YARATMAYDI (`transaction.service.js`
 *    da jurnal chaqiruvi yo'q), shuning uchun yaratilgan qatorlarni
 *    o'chirish xavfsiz — `JOURNAL_IMMUTABLE` buzilmaydi.
 *
 * 2) `PaymentTransaction.syncIndexes()` — Prisma'da indeks migratsiyadan
 *    keladi, sinxronlash yo'q. O'rniga indeks BAZADA HAQIQATAN borligi
 *    tekshiriladi: aks holda 2-bo'lim ("bir xil kalit = bitta to'lov")
 *    unique cheklovsiz YOLG'ON yashil berardi.
 *
 * 3) `StudentDeposit.student` → `studentId`, `PaymentTransaction.payment`
 *    → `paymentId`.
 */
const fx = createFixtures();
/** Tozalashda kerak — `run()` ichidagi o'zgaruvchi `finally` ga ko'rinmaydi. */
let fixtureStudentId = null;

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
const money = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(n || 0));

const run = async () => {
  const txnService = await import("../src/modules/finance/services/transaction.service.js");

  // ⚠ MUSBAT NAZORAT: unique `idempotencyKey` indeksi BAZADA bormi.
  // Yo'q bo'lsa 2-bo'lim hech narsani isbotlamasdi.
  const idx = await prisma.$queryRaw`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'payment_transactions'
      AND indexdef ILIKE '%idempotencyKey%' AND indexdef ILIKE '%UNIQUE%'
  `;
  if (idx.length) ok("unique idempotencyKey indeksi bazada mavjud", idx[0].indexname);
  else bad("unique idempotencyKey indeksi YO'Q", "2-bo'lim yolg'on yashil berardi");

  const branch = await fx.branch("RACE-FILIAL");
  const student = await fx.user("racestudent", {
    firstName: "Race", lastName: "Student",
    passwordHash: "x", role: "student", homeBranchId: branch.id, isActive: true,
  });
  const cashier = await fx.user("racecashier", {
    firstName: "Race", lastName: "Cashier",
    passwordHash: "x", role: "director", homeBranchId: branch.id, isActive: true,
  });
  fixtureStudentId = student.id;
  const group = await fx.group("RACE-GROUP", branch.id, { isActive: true });
  await fx.membership(group.id, student.id, { joinedAt: new Date(Date.UTC(2026, 0, 1)) });

  const EXPECTED = 1_000_000;
  const mkPayment = async (year, month) => {
    const row = await prisma.studentPayment.create({
      data: {
        branchId: branch.id, studentId: student.id, groupId: group.id,
        year, month, baseFee: EXPECTED, expectedAmount: EXPECTED, paidAmount: 0,
      },
    });
    return fx.track("studentPayment", row.id), row;
  };

  /**
   * Servis yaratgan YON QATORLARNI reyestrga oladi.
   *
   * ⚠⚠ JURNAL YOZUVLARI HAM SHU YERDA ⚠⚠
   *
   * `txnService.create` faqat `PaymentTransaction` yozmaydi — u qo'sh
   * yozuv JURNALIGA ham post qiladi (`journal.service.post`) va kerak
   * bo'lsa filial uchun HISOB (`Account`) ochadi.
   *
   * Bu birinchi urinishda e'tibordan chetda qolgan edi va natijada
   * dev bazada 41 ta soxta jurnal yozuvi qolib ketdi; fixture guruh va
   * filiallarini `journal_entries_groupId_fkey` RESTRICT tufayli
   * umuman o'chirib bo'lmadi.
   *
   * O'chirish `JOURNAL_IMMUTABLE` ni BUZMAYDI: qo'riqchi faqat TAHRIRNI
   * to'sadi, tozalash yo'li ataylab ochiq qoldirilgan.
   */
  const trackServiceRows = async (paymentId) => {
    const rows = await prisma.paymentTransaction.findMany({
      where: { paymentId }, select: { id: true },
    });
    for (const r of rows) fx.track("paymentTransaction", r.id);

    const entries = await prisma.journalEntry.findMany({
      where: { branchId: branch.id }, select: { id: true },
    });
    for (const e of entries) fx.track("journalEntry", e.id);
    if (entries.length) {
      const lines = await prisma.journalLine.findMany({
        where: { entryId: { in: entries.map((e) => e.id) } }, select: { id: true },
      });
      for (const l of lines) fx.track("journalLine", l.id);
    }

    // Jurnal servisi filial uchun hisob varaqlarini O'ZI ochadi.
    const accounts = await prisma.account.findMany({
      where: { branchId: branch.id }, select: { id: true },
    });
    for (const a of accounts) fx.track("account", a.id);
  };
  const trackTxns = trackServiceRows;

  // ─── 1. Bir vaqtda 20 ta to'lov (jami 2 000 000, qarz 1 000 000) ───
  head("1) 20 ta parallel to'lov - qarzdan 2 barobar ko'p");

  const payment = await mkPayment(2026, 3);
  const N = 20;
  const CHUNK = 100_000;

  const results = await Promise.allSettled(
    Array.from({ length: N }, () =>
      txnService.create(
        { paymentId: String(payment.id), amount: CHUNK, method: "cash" },
        cashier,
      ),
    ),
  );

  const okRes = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const errRes = results.filter((r) => r.status === "rejected");
  console.log(
    `  \x1b[2mmuvaffaqiyatli: ${okRes.length}, xato: ${errRes.length}${
      errRes.length ? ` (${errRes[0].reason?.message})` : ""
    }\x1b[0m`,
  );

  await trackTxns(payment.id);
  const fresh = await prisma.studentPayment.findUnique({ where: { id: payment.id } });
  const trxSum = await prisma.paymentTransaction.aggregate({
    where: { paymentId: payment.id, isDeleted: false },
    _sum: { amount: true },
  });
  const sumTrx = Number(trxSum._sum.amount || 0);

  // 1. Cap
  if (Number(fresh.paidAmount) > EXPECTED) {
    bad(
      "paidAmount expectedAmount dan oshmaydi",
      `${money(fresh.paidAmount)} > ${money(EXPECTED)} - ORTIQCHA HISOBLANDI`,
    );
  } else {
    ok("paidAmount expectedAmount dan oshmaydi", money(fresh.paidAmount));
  }

  // 2. Kesh == haqiqat
  if (Number(fresh.paidAmount) !== sumTrx) {
    bad(
      "paidAmount == tranzaksiyalar yig'indisi",
      `kesh ${money(fresh.paidAmount)} != haqiqat ${money(sumTrx)}`,
    );
  } else {
    ok("paidAmount == tranzaksiyalar yig'indisi", money(sumTrx));
  }

  // 3. Pul saqlanish qonuni: kiritilgan == planga tushgan + depozitga tushgan
  const dep = await prisma.studentDeposit.findFirst({ where: { studentId: student.id } });
  if (dep) fx.track("studentDeposit", dep.id);
  const depBalance = Number(dep?.balance || 0);
  const totalIn = okRes.length * CHUNK;
  const accounted = sumTrx + depBalance;
  if (accounted !== totalIn) {
    bad(
      "pul yo'qolmaydi (kiritilgan == plan + depozit)",
      `kiritilgan ${money(totalIn)} != hisoblangan ${money(accounted)} (plan ${money(sumTrx)} + depozit ${money(depBalance)})`,
    );
  } else {
    ok(
      "pul yo'qolmaydi (kiritilgan == plan + depozit)",
      `${money(totalIn)} = ${money(sumTrx)} + ${money(depBalance)}`,
    );
  }

  // ─── 2. Bir xil idempotencyKey bilan parallel so'rovlar ───
  head("2) Bir xil idempotencyKey bilan 10 ta parallel so'rov");

  const payment2 = await mkPayment(2026, 4);
  // ⚠ KALIT HAR YURISHDA BOSHQACHA. Qattiq satr bo'lsa, oldingi
  // yurishdan qolgan yozuv tufayli 10 ta so'rovning HAMMASI
  // idempotentlik to'sig'iga urilardi va test "tizim 0 yozdi" deb
  // NOTO'G'RI yiqilardi (mantiq esa to'g'ri ishlayotgan bo'lardi).
  const KEY = `same-key-double-click-${fx.suffix}`;
  const M = 10;

  const res2 = await Promise.allSettled(
    Array.from({ length: M }, () =>
      txnService.create(
        {
          paymentId: String(payment2.id),
          amount: 200_000,
          method: "cash",
          idempotencyKey: KEY,
        },
        cashier,
      ),
    ),
  );
  const ok2 = res2.filter((r) => r.status === "fulfilled").length;
  const err2 = res2.filter((r) => r.status === "rejected");
  console.log(
    `  \x1b[2mmuvaffaqiyatli: ${ok2}, xato: ${err2.length}${
      err2.length ? ` (${err2[0].reason?.message})` : ""
    }\x1b[0m`,
  );

  await trackTxns(payment2.id);
  const keyCount = await prisma.paymentTransaction.count({
    where: { idempotencyKey: KEY, isDeleted: false },
  });
  keyCount === 1
    ? ok("kalit tashuvchi yozuv bitta", `${keyCount} ta`)
    : bad("kalit tashuvchi yozuv bitta", `${keyCount} ta yozuv yaratildi`);

  // ASOSIY INVARIANT: bir xil kalit = BITTA to'lov. Kassir 10 marta bosgani
  // bilan markazga faqat 200 000 so'm kelgan - tizim ham shuni yozishi kerak.
  //
  // DIQQAT: faqat tranzaksiya sonini sanash YETARLI EMAS. Taqsimlash bo'sh
  // chiqqan so'rov (parallel so'rov qarzni allaqachon yopgan bo'lsa) hech
  // qanday tranzaksiya YOZMAYDI - demak E11000 ga ham urilmaydi va
  // idempotentlik tekshiruvidan BUTUNLAY chetlab o'tadi. Pul jimgina
  // depozitga tushadi. Shuning uchun PUTUN pulni sanaymiz.
  const dep2 = await prisma.studentDeposit.findFirst({ where: { studentId: student.id } });
  if (dep2) fx.track("studentDeposit", dep2.id);
  const sum2Agg = await prisma.paymentTransaction.aggregate({
    where: { paymentId: payment2.id, isDeleted: false },
    _sum: { amount: true },
  });
  const sum2 = Number(sum2Agg._sum.amount || 0);
  // 1-bo'limdan qolgan depozit balansini ayiramiz - faqat 2-bo'lim ta'siri.
  const depDelta = Number(dep2?.balance || 0) - depBalance;
  const recorded2 = sum2 + depDelta;
  const INTENDED = 200_000;

  if (recorded2 !== INTENDED) {
    bad(
      "bir xil kalit = BITTA to'lov (jami pul)",
      `markazga ${money(INTENDED)} kelgan, tizim ${money(recorded2)} yozdi ` +
        `(plan ${money(sum2)} + depozit ${money(depDelta)}) - ${Math.round(recorded2 / INTENDED)}x ORTIQCHA`,
    );
  } else {
    ok("bir xil kalit = BITTA to'lov (jami pul)", money(recorded2));
  }

  const fresh2 = await prisma.studentPayment.findUnique({ where: { id: payment2.id } });
  Number(fresh2.paidAmount) === sum2
    ? ok("2-oy: paidAmount == tranzaksiyalar yig'indisi", money(sum2))
    : bad(
        "2-oy: paidAmount == tranzaksiyalar yig'indisi",
        `kesh ${money(fresh2.paidAmount)} != haqiqat ${money(sum2)}`,
      );

};

run()
  .catch((err) => {
    console.error("\n\x1b[31mTEST YIQILDI:\x1b[0m", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Depozit tranzaksiyalari servis tomonidan yaratilgan bo'lishi mumkin.
    const depTxns = await prisma.depositTransaction
      .findMany({ where: { studentId: fixtureStudentId || "" }, select: { id: true } })
      .catch(() => []);
    for (const t of depTxns) fx.track("depositTransaction", t.id);

    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix}) — moliyaviy qator qolmadi`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} muammo\x1b[0m`,
    );
    if (R.failures.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      for (const f of R.failures) console.log(`  • ${f}`);
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
