/**
 * EGALIK TASHQI KALITLARI — `RESTRICT` XATTI-HARAKATI.
 *
 * Migratsiya: `20260820120000_restrict_journal_and_salary_ownership_fks`.
 *
 * NIMA TEKSHIRILADI: tarixi bor yozuvga ega odam yoki guruhni o'chirishga
 * urinish XATO BERISHI va tarix O'ZGARMASDAN QOLISHI kerak.
 *
 *   journal_entries.studentId / .teacherId / .staffId / .groupId  → RESTRICT
 *   teacher_salaries.groupId                                       → RESTRICT
 *
 * NEGA BU MUHIM: ilgari beshhalasi ham `SET NULL` edi. O'chirish
 * MUVAFFAQIYATLI o'tardi va yozuvning EGASI jimgina null bo'lardi -
 * summalar joyida qolgani uchun na muvozanat tekshiruvi, na `reconcile()`
 * buni topardi. Bu `config/prisma.js` dagi o'zgarmaslik kengaytmasini ham
 * chetlab o'tardi: kengaytma `update` ni to'sadi, FK esa qatorni BAZA
 * ICHIDA o'zgartiradi.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * XAVFSIZLIK: BU TEST BAZAGA HECH NARSA QOLDIRMAYDI.
 *
 * Hamma narsa BITTA tranzaksiya ichida bajariladi va oxirida ATAYLAB
 * `Rollback` tashlanadi. Fixture'lar ham, ular ustidagi urinishlar ham
 * qaytariladi - test tugagach jadvallar AYNAN avvalgi holatida qoladi
 * (test o'zi ham buni tekshiradi).
 *
 * Muvaffaqiyatsiz DELETE tranzaksiyani Postgres'da "aborted" holatiga
 * soladi, shuning uchun har urinish SAVEPOINT bilan o'raladi - shunda
 * keyingi so'rovlar ishlayveradi. Cheklovlar HECH QAYERDA chetlab
 * o'tilmaydi (`session_replication_role` va shunga o'xshashlar YO'Q).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ISHLATISH:  npm run test:fk-restrict
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";

const R = { pass: 0, fail: 0 };
const ok = (n, extra = "") => { R.pass += 1; console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ""}`); };
const bad = (n, extra = "") => { R.fail += 1; console.log(`  ❌ ${n}${extra ? ` — ${extra}` : ""}`); };

class Rollback extends Error {}

/** Postgres FK buzilishi (23503 / Prisma P2003) ekanini aniqlaydi. */
const isFkViolation = (err) => {
  const s = `${err?.code || ""} ${err?.message || ""} ${err?.meta?.code || ""}`;
  return /P2003|23503|foreign key constraint|Foreign key constraint/i.test(s);
};

/**
 * O'chirishga urinadi va natijani qaytaradi. SAVEPOINT bilan o'ralgan,
 * shuning uchun xatodan keyin tranzaksiya ishlashda davom etadi.
 */
const attemptDelete = async (tx, label, fn) => {
  const sp = `sp_${Math.abs(label.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 100000}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${sp}`);
  try {
    await fn();
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`);
    return { blocked: false, err: null };
  } catch (err) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`);
    return { blocked: true, err };
  }
};

const run = async () => {
  console.log("\n\x1b[1mEGALIK FK'LARI — RESTRICT xatti-harakati\x1b[0m\n");

  // Test BOSHIDAGI holat - oxirida shu bilan solishtiriladi.
  const before = {
    entries: await prisma.journalEntry.count(),
    lines: await prisma.journalLine.count(),
    salaries: await prisma.teacherSalary.count(),
    users: await prisma.user.count(),
    groups: await prisma.group.count(),
  };

  try {
    await prisma.$transaction(async (tx) => {
      // ─── Fixture'lar ───────────────────────────────────────────────
      const branch =
        (await tx.branch.findFirst({ where: { isDeleted: false } })) ||
        (await tx.branch.create({ data: { name: "FK test filiali", code: "FKT" } }));

      const tag = `fkrestrict_${Date.now().toString(36)}`;
      const mkUser = (role) =>
        tx.user.create({
          data: {
            firstName: "FK", lastName: role, username: `${tag}_${role}`,
            passwordHash: "x", role, homeBranchId: branch.id,
          },
        });
      const student = await mkUser("student");
      const teacher = await mkUser("teacher");
      const staff = await mkUser("reception");
      const group = await tx.group.create({
        data: { name: `FK test guruh ${tag}`, branchId: branch.id },
      });

      // Jurnal yozuvi: to'rtala egalik ustuni ham to'ldiriladi.
      const entry = await tx.journalEntry.create({
        data: {
          branchId: branch.id, date: new Date(), kind: "payment",
          memo: "FK restrict test", totalDebit: 1000, totalCredit: 1000,
          studentId: student.id, teacherId: teacher.id,
          staffId: staff.id, groupId: group.id,
        },
      });
      // Maosh tarixi: `kind='group'` → `groupId` MAJBURIY (CHECK).
      const salary = await tx.teacherSalary.create({
        data: {
          branchId: branch.id, teacherId: teacher.id, groupId: group.id,
          kind: "group", year: 2026, month: 8,
          expectedAmount: 500000, paidAmount: 0,
        },
      });
      console.log("  fixture: 1 jurnal yozuvi + 1 maosh qatori yaratildi (tranzaksiya ichida)\n");

      // ─── 1. JURNAL: o'quvchi / o'qituvchi / xodim / guruh ──────────
      console.log("\x1b[1m  Jurnal egasi o'chirilmasin\x1b[0m");
      for (const [label, fn] of [
        ["o'quvchini o'chirish bloklanadi", () => tx.user.delete({ where: { id: student.id } })],
        ["o'qituvchini o'chirish bloklanadi", () => tx.user.delete({ where: { id: teacher.id } })],
        ["xodimni o'chirish bloklanadi", () => tx.user.delete({ where: { id: staff.id } })],
      ]) {
        const r = await attemptDelete(tx, label, fn);
        if (r.blocked && isFkViolation(r.err)) ok(label, "FK cheklovi (23503)");
        else if (r.blocked) bad(label, `bloklandi, lekin FK emas: ${r.err?.message?.slice(0, 90)}`);
        else bad(label, "O'CHIRILDI — RESTRICT ishlamadi");
      }

      // ─── 2. GURUH: jurnal VA maosh ikkalasi ham to'sadi ────────────
      console.log("\n\x1b[1m  Guruh o'chirilmasin (jurnal + maosh tarixi)\x1b[0m");
      {
        const label = "guruhni o'chirish bloklanadi";
        const r = await attemptDelete(tx, label, () => tx.group.delete({ where: { id: group.id } }));
        if (r.blocked && isFkViolation(r.err)) ok(label, "FK cheklovi (23503)");
        else if (r.blocked) bad(label, `bloklandi, lekin FK emas: ${r.err?.message?.slice(0, 90)}`);
        else bad(label, "O'CHIRILDI — RESTRICT ishlamadi");
      }
      {
        // Jurnalni olib tashlab, FAQAT maosh to'sishini ko'rsatamiz.
        // (Jurnal yozuvi o'chirilishi mumkin - to'silgani TAHRIR.)
        const label = "maosh tarixi YOLG'IZ o'zi ham guruhni to'sadi";
        await tx.$executeRawUnsafe(`SAVEPOINT sp_only_salary`);
        await tx.journalEntry.delete({ where: { id: entry.id } });
        const r = await attemptDelete(tx, label, () => tx.group.delete({ where: { id: group.id } }));
        if (r.blocked && isFkViolation(r.err)) ok(label, "FK cheklovi (23503)");
        else if (r.blocked) bad(label, `bloklandi, lekin FK emas: ${r.err?.message?.slice(0, 90)}`);
        else bad(label, "O'CHIRILDI — RESTRICT ishlamadi");
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT sp_only_salary`);
      }

      // ─── 3. TARIX O'ZGARMAGANINI TEKSHIRAMIZ ──────────────────────
      console.log("\n\x1b[1m  Urinishlardan keyin tarix o'zgarmagan\x1b[0m");
      const e2 = await tx.journalEntry.findUnique({ where: { id: entry.id } });
      const sameEntry =
        e2 &&
        e2.studentId === student.id && e2.teacherId === teacher.id &&
        e2.staffId === staff.id && e2.groupId === group.id &&
        Number(e2.totalDebit) === 1000 && Number(e2.totalCredit) === 1000;
      sameEntry
        ? ok("jurnal yozuvi butun: egalik ustunlari va summalar joyida")
        : bad("jurnal yozuvi o'zgargan", JSON.stringify({
            studentId: e2?.studentId, teacherId: e2?.teacherId,
            staffId: e2?.staffId, groupId: e2?.groupId }));

      const s2 = await tx.teacherSalary.findUnique({ where: { id: salary.id } });
      const sameSalary =
        s2 && s2.groupId === group.id && s2.teacherId === teacher.id &&
        s2.kind === "group" && Number(s2.expectedAmount) === 500000;
      sameSalary
        ? ok("maosh qatori butun: groupId, teacherId, kind, summa joyida")
        : bad("maosh qatori o'zgargan", JSON.stringify({ groupId: s2?.groupId, kind: s2?.kind }));

      // ─── 3b. GURUHNI FAQAT JURNAL ham to'sadimi ───────────────────
      // Yuqorida maosh ham, jurnal ham bor edi — maosh birinchi to'sdi.
      // Bu yerda maosh olib tashlanadi, ya'ni to'siq FAQAT jurnaldan
      // kelishi kerak.
      console.log("\n\x1b[1m  Guruhni jurnal YOLG'IZ o'zi ham to'sadi\x1b[0m");
      {
        const label = "jurnal yolg'iz o'zi guruhni to'sadi";
        await tx.$executeRawUnsafe(`SAVEPOINT sp_only_journal`);
        await tx.teacherSalary.delete({ where: { id: salary.id } });
        const r = await attemptDelete(tx, label, () => tx.group.delete({ where: { id: group.id } }));
        if (r.blocked && /journal_entries_groupId_fkey/.test(r.err?.message || "")) {
          ok(label, "journal_entries_groupId_fkey");
        } else if (r.blocked && isFkViolation(r.err)) {
          bad(label, `boshqa FK to'sdi: ${r.err?.message?.slice(0, 90)}`);
        } else bad(label, "O'CHIRILDI — RESTRICT ishlamadi");
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT sp_only_journal`);
      }

      // ─── 4. O'ZGARMASLIK KENGAYTMASI HAMON ISHLAYAPTIMI ───────────
      console.log("\n\x1b[1m  Jurnal o'zgarmasligi (kengaytma) saqlangan\x1b[0m");
      const r = await attemptDelete(tx, "immutability", () =>
        tx.journalEntry.update({ where: { id: entry.id }, data: { memo: "tamper" } }));
      r.blocked && /JOURNAL_IMMUTABLE|o'zgarmas/i.test(r.err?.message || "")
        ? ok("jurnal yozuvini tahrirlash hamon to'siladi")
        : bad("jurnal o'zgarmasligi buzilgan", r.err?.message?.slice(0, 90) || "tahrir o'tib ketdi");

      // Hamma narsani qaytaramiz — bazada iz qolmasin.
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }

  // ─── 5. TEST BAZAGA IZ QOLDIRMAGANINI TEKSHIRAMIZ ────────────────
  console.log("\n\x1b[1m  Test o'zidan keyin iz qoldirmagan\x1b[0m");
  const after = {
    entries: await prisma.journalEntry.count(),
    lines: await prisma.journalLine.count(),
    salaries: await prisma.teacherSalary.count(),
    users: await prisma.user.count(),
    groups: await prisma.group.count(),
  };
  const same = Object.keys(before).every((k) => before[k] === after[k]);
  same
    ? ok("barcha jadval sanoqlari avvalgidek", JSON.stringify(after))
    : bad("baza o'zgarib qolgan", `oldin ${JSON.stringify(before)} → keyin ${JSON.stringify(after)}`);

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
  await prisma.$disconnect();
  process.exit(R.fail ? 1 : 0);
};

run().catch(async (err) => {
  console.error("Test xatosi:", err);
  await prisma.$disconnect().catch(() => null);
  process.exit(1);
});
