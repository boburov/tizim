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
import mongoose from "mongoose";

const TEST_DB = "mongodb://127.0.0.1:27017/lc_race_test";

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
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const GroupMembership = (await import("../src/models/groupMembership.model.js")).default;
  const StudentPayment = (await import("../src/models/studentPayment.model.js")).default;
  const PaymentTransaction = (await import("../src/models/paymentTransaction.model.js"))
    .default;
  const StudentDeposit = (await import("../src/models/studentDeposit.model.js")).default;

  const txnService = await import("../src/modules/finance/services/transaction.service.js");

  // Indekslar qurilishini kutamiz - unique idempotencyKey indeksi shart,
  // aks holda 4-sinov yolg'on "o'tdi" berardi.
  await PaymentTransaction.syncIndexes();

  const branch = await Branch.create({ name: "RACE-FILIAL", isMain: true });
  const student = await User.create({
    firstName: "Race", lastName: "Student", username: "racestudent",
    passwordHash: "x", role: "student", homeBranchId: branch._id, isActive: true,
  });
  const cashier = await User.create({
    firstName: "Race", lastName: "Cashier", username: "racecashier",
    passwordHash: "x", role: "director", homeBranchId: branch._id, isActive: true,
  });
  const group = await Group.create({
    branchId: branch._id, name: "RACE-GROUP", isActive: true,
  });
  await GroupMembership.create({
    group: group._id, student: student._id, joinedAt: new Date(Date.UTC(2026, 0, 1)),
  });

  const EXPECTED = 1_000_000;
  const mkPayment = async (year, month) =>
    StudentPayment.create({
      branchId: branch._id, student: student._id, group: group._id,
      year, month, baseFee: EXPECTED, expectedAmount: EXPECTED, paidAmount: 0,
    });

  // ─── 1. Bir vaqtda 20 ta to'lov (jami 2 000 000, qarz 1 000 000) ───
  head("1) 20 ta parallel to'lov - qarzdan 2 barobar ko'p");

  const payment = await mkPayment(2026, 3);
  const N = 20;
  const CHUNK = 100_000;

  const results = await Promise.allSettled(
    Array.from({ length: N }, () =>
      txnService.create(
        { paymentId: String(payment._id), amount: CHUNK, method: "cash" },
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

  const fresh = await StudentPayment.findById(payment._id).lean();
  const trxSum = await PaymentTransaction.aggregate([
    { $match: { payment: payment._id, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const sumTrx = trxSum[0]?.total || 0;

  // 1. Cap
  if (fresh.paidAmount > EXPECTED) {
    bad(
      "paidAmount expectedAmount dan oshmaydi",
      `${money(fresh.paidAmount)} > ${money(EXPECTED)} - ORTIQCHA HISOBLANDI`,
    );
  } else {
    ok("paidAmount expectedAmount dan oshmaydi", money(fresh.paidAmount));
  }

  // 2. Kesh == haqiqat
  if (fresh.paidAmount !== sumTrx) {
    bad(
      "paidAmount == tranzaksiyalar yig'indisi",
      `kesh ${money(fresh.paidAmount)} != haqiqat ${money(sumTrx)}`,
    );
  } else {
    ok("paidAmount == tranzaksiyalar yig'indisi", money(sumTrx));
  }

  // 3. Pul saqlanish qonuni: kiritilgan == planga tushgan + depozitga tushgan
  const dep = await StudentDeposit.findOne({ student: student._id }).lean();
  const depBalance = dep?.balance || 0;
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
  const KEY = "same-key-double-click-001";
  const M = 10;

  const res2 = await Promise.allSettled(
    Array.from({ length: M }, () =>
      txnService.create(
        {
          paymentId: String(payment2._id),
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

  const keyCount = await PaymentTransaction.countDocuments({
    idempotencyKey: KEY,
    isDeleted: { $ne: true },
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
  const dep2 = await StudentDeposit.findOne({ student: student._id }).lean();
  const sum2Agg = await PaymentTransaction.aggregate([
    { $match: { payment: payment2._id, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const sum2 = sum2Agg[0]?.total || 0;
  // 1-bo'limdan qolgan depozit balansini ayiramiz - faqat 2-bo'lim ta'siri.
  const depDelta = (dep2?.balance || 0) - depBalance;
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

  const fresh2 = await StudentPayment.findById(payment2._id).lean();
  fresh2.paidAmount === sum2
    ? ok("2-oy: paidAmount == tranzaksiyalar yig'indisi", money(sum2))
    : bad(
        "2-oy: paidAmount == tranzaksiyalar yig'indisi",
        `kesh ${money(fresh2.paidAmount)} != haqiqat ${money(sum2)}`,
      );

  await mongoose.connection.dropDatabase();
};

run()
  .catch((err) => {
    console.error("\n\x1b[31mTEST YIQILDI:\x1b[0m", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} muammo\x1b[0m`,
    );
    if (R.failures.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      for (const f of R.failures) console.log(`  • ${f}`);
    }
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });
