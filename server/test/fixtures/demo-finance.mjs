/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NAMOYISH UCHUN MOLIYAVIY MA'LUMOT — bosh ekran grafigini "tirik" qilish.
 *
 * ── NEGA KERAK BO'LDI ──
 * Bazada uchta filial bor, lekin jurnal yozuvlari FAQAT bittasida
 * (`DEMO Markaz`) va ular oxirgi ikki oyga tegishli. Natijada bosh
 * ekrandagi grafik ikkita tekis nol chizig'i va bitta keskin sakrashdan
 * iborat edi — u ishlaydi, lekin hech narsa ko'rsatmaydi.
 *
 * ⚠ BU SEED EMAS, FIKSTURA. `src/seeds/` ishlab chiqarish bazasini
 * tayyorlaydi; bu esa NAMOYISH ma'lumoti va u ishlab chiqarishda
 * TURMASLIGI kerak. Shuning uchun `test/fixtures/` da va `--clean`
 * bilan to'liq qaytariladi (`qa-users.mjs` bilan bir naqsh).
 *
 * ── QANDAY QAYTARILADI ──
 * Har bir yozuv TEGLANGAN:
 *   journal_entries.postingKey  →  "demo_fin:..."
 *   users.username              →  "__demo_fin_..."
 *   groups.name / accounts.name →  "__demo_fin_..."
 * `--clean` aynan shu teglar bo'yicha o'chiradi va HECH NARSANI
 * boshqa yozuvlardan taxmin qilmaydi.
 *
 * ── QO'SH YOZUV QOIDASI BUZILMAYDI ──
 * Har bir yozuvda AYNAN ikkita qator: biri debet, biri kredit, teng
 * summada. `test/db-invariants.test.mjs` buni tekshiradi va bu
 * fikstura undan o'tishi SHART — aks holda u soxta ma'lumot emas,
 * BUZUQ ma'lumot bo'lardi va hisobotlarni yolg'on qilardi.
 *
 * ── SONLAR TASODIFIY EMAS, TAKRORLANADIGAN ──
 * `mulberry32` — urug'langan generator. Ikki marta yurgizilsa AYNI
 * raqamlar chiqadi, ya'ni skrinshot ham, testlar ham barqaror qoladi.
 *
 * ISHLATISH:
 *   node --env-file=.env test/fixtures/demo-finance.mjs          # tozalab, qayta yaratadi
 *   node --env-file=.env test/fixtures/demo-finance.mjs --clean  # faqat o'chiradi
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error("❌ Bu fikstura ishlab chiqarishda ishga tushmaydi.");
  process.exit(1);
}

const prisma = new PrismaClient();
const TAG = 'demo_fin';
const POSTING = `${TAG}:`;
const NAME = `__${TAG}_`;
const CLEAN_ONLY = process.argv.includes('--clean');

/** Urug'langan PRNG — takrorlanadigan natija uchun. */
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * MAVSUMIYLIK — o'quv markazining haqiqiy yili.
 *
 * Sentabr — qabul cho'qqisi, dekabr-yanvar biroz pasayadi, iyun-avgust
 * eng past (ta'til). Tekis o'sish chizig'i "generatsiya qilingan"
 * ko'rinardi; mavsum esa grafikka ma'no beradi.
 * Indeks: 0 = yanvar.
 */
const SEASON = [0.86, 0.9, 0.95, 0.98, 0.92, 0.62, 0.48, 0.7, 1.28, 1.15, 1.05, 0.95];

/**
 * FILIAL PROFILLARI — chiziqlar BIR-BIRINI KESIB O'TSIN.
 *
 * Uchta bir xil shakldagi chiziq ustma-ust tushib, grafikni
 * o'qib bo'lmaydigan qiladi. Shuning uchun har biriga boshqa
 * hikoya berilgan: barqaror yetakchi, mavsumga o'ta sezgir, va
 * kichik lekin tez o'sayotgan.
 */
const PROFILES = {
  'Asosiy filial':   { base: 26_000_000, growth: 1.012, season: 0.7, expense: 0.28, salary: 0.22, students: 300, seed: 11 },
  // ⚠ `DEMO Markaz` NISBATLARI PAST VA MAVSUMIYLIGI YUMSHOQ — SABABI BOR.
  //
  // Bazadagi MAVJUD chiqimlarning deyarli hammasi shu filialda
  // (iyul-avgustda ~19 mln), unga mos daromad esa yo'q. Boshqa
  // filiallar bilan bir xil nisbat berilsa uning marjasi yozda
  // −70% ga tushib ketardi va grafik "filial qulab tushdi" deb
  // ko'rsatardi — holbuki bu shunchaki eski demo yozuvlar.
  //
  // Shuning uchun bu yerda fikstura kamroq xarajat va barqarorroq
  // daromad beradi: mavjud chiqim bilan qo'shilganda natija
  // qolgan filiallar bilan bir qatorga tushadi.
  'DEMO Markaz':     { base: 24_000_000, growth: 1.028, season: 0.6, expense: 0.18, salary: 0.15, students: 180, seed: 23 },
  'DEMO Yunusobod':  { base: 6_000_000,  growth: 1.115, season: 1.0, expense: 0.32, salary: 0.23, students: 90, seed: 37 },
};

/**
 * ⚠ MIQYOS TASODIFIY TANLANMAGAN — U MAVJUD BYUDJET BILAN BOG'LIQ.
 *
 * Birinchi urinishda oylik daromad ~150 mln qilib qo'yilgandi va
 * natijada bosh ekran "Jami byudjetdan +440% oshdi" degan qizil
 * ogohlantirish bilan to'ldi. Ogohlantirish TO'G'RI edi — bazadagi
 * byudjet rejasi 30 mln, xarajat esa 162 mln chiqdi. Lekin namoyish
 * ma'lumoti tizimni buzuq ko'rsatmasligi kerak.
 *
 * ── NISBATLAR MAVJUD MA'LUMOTNI HISOBGA OLADI ──
 * Bazada ALLAQACHON ~19 mln chiqim bor, lekin unga mos daromad
 * deyarli yo'q. Ya'ni joriy oyda ~12 mln lik "teshik" bor va uni
 * namoyish ma'lumoti QOPLASHI kerak — aks holda foyda marjasi
 * manfiy chiqib, bosh ekran "biznes zarar ko'ryapti" deb turardi.
 *
 * Shuning uchun chiqim nisbatlari (0.28–0.32) va maosh (0.22–0.23)
 * ATAYLAB past: mavjud xarajat bilan qo'shilganda jami ≈ 40 mln
 * bo'ladi va marja ~15% ga chiqadi.
 *
 * ⚠ Mavjud ma'lumot o'zgarsa (yoki bu fikstura toza bazada
 * yurgizilsa) nisbatlarni qayta ko'rish kerak — ular MUTLAQ
 * to'g'ri sonlar emas, mavjud fonga moslangan.
 */

/**
 * ⚠ O'QUVCHI SONI MAVJUD MA'LUMOTGA MOSLANGAN.
 *
 * Bazada `Asosiy filial` da 1262 ta HAQIQIY to'lov rejasi bor va ular
 * JORIY OYGA to'plangan. Demo o'quvchilar kam bo'lsa grafik o'n bir
 * oy tekis turib, oxirgi oyda to'qqiz baravar sakrardi — bu o'sish
 * emas, nosozlikka o'xshaydi.
 *
 * Shuning uchun demo soni shunday tanlangan: bazaviy chiziq mavjud
 * sakrashga yaqin bo'lsin va u "o'sish" bo'lib o'qilsin.
 */
const MONTHS = 12;
const round = (n) => Math.round(n / 1000) * 1000;

// ═══════════════════════════════════════════════════════════════════════
// TOZALASH — teg bo'yicha, taxminsiz.
//
// ⚠ TARTIB MUHIM: to'lov → a'zolik → guruh → jurnal qatori → jurnal
// yozuvi → hisob → foydalanuvchi. Teskari tartibda FK cheklovlari
// xato beradi va u YUTILSA qoldiq to'planardi.
// ═══════════════════════════════════════════════════════════════════════
const clean = async () => {
  const entries = await prisma.journalEntry.findMany({
    where: { postingKey: { startsWith: POSTING } },
    select: { id: true },
  });
  const entryIds = entries.map((e) => e.id);

  const groups = await prisma.group.findMany({
    where: { name: { startsWith: NAME } }, select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);

  const users = await prisma.user.findMany({
    where: { username: { startsWith: NAME } }, select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (groupIds.length) {
    await prisma.studentPayment.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: groupIds } } });
  }
  if (userIds.length) {
    await prisma.studentPayment.deleteMany({ where: { studentId: { in: userIds } } });
  }
  if (groupIds.length) await prisma.group.deleteMany({ where: { id: { in: groupIds } } });

  if (entryIds.length) {
    await prisma.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
    await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
  }
  await prisma.account.deleteMany({ where: { name: { startsWith: NAME } } });
  if (userIds.length) {
    await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  return { entries: entryIds.length, groups: groupIds.length, users: userIds.length };
};

/** Hisob — bor bo'lsa o'shanisi, yo'q bo'lsa TEGLANGAN yangisi. */
const ensureAccount = async (branchId, kind) => {
  const found = await prisma.account.findFirst({ where: { branchId, kind, counterpartyBranchId: null } });
  if (found) return found;
  return prisma.account.create({
    data: { branchId, kind, name: `${NAME}${kind}`, isActive: true },
  });
};

const main = async () => {
  const removed = await clean();
  console.log(`tozalandi: ${removed.entries} yozuv · ${removed.groups} guruh · ${removed.users} foydalanuvchi`);
  if (CLEAN_ONLY) return;

  const branches = await prisma.branch.findMany({
    where: { isDeleted: false }, select: { id: true, name: true },
  });
  if (!branches.length) throw new Error('filial topilmadi');

  const now = new Date();
  // Oyning 1-kunidan boshlab 12 oy — oxirgisi JORIY oy.
  const months = [];
  for (let i = MONTHS - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }

  let entryCount = 0;
  let planCount = 0;

  for (const branch of branches) {
    const profile = PROFILES[branch.name] || {
      base: 30_000_000, growth: 1.02, season: 1, expense: 0.6, salary: 0.27, students: 40,
      seed: branch.id.charCodeAt(0),
    };
    const rand = mulberry32(profile.seed);

    const cash = await ensureAccount(branch.id, 'cash');
    const revenueAcc = await ensureAccount(branch.id, 'revenue');
    const expenseAcc = await ensureAccount(branch.id, 'expense');

    // ── O'QUVCHILAR VA GURUH (qarzdorlik/o'quvchi ko'rsatkichlari uchun) ──
    const group = await prisma.group.create({
      data: {
        branchId: branch.id,
        name: `${NAME}${branch.name}`,
        isActive: true,
        startDate: new Date(Date.UTC(months[0].year, months[0].month - 1, 1)),
      },
      select: { id: true },
    });

    const students = [];
    for (let i = 0; i < profile.students; i += 1) {
      students.push(
        await prisma.user.create({
          data: {
            firstName: `${NAME}oquvchi`,
            lastName: `${i + 1}`,
            username: `${NAME}${branch.id.slice(-6)}_${i}`,
            passwordHash: 'x',
            role: 'student',
            homeBranchId: branch.id,
            isActive: true,
          },
          select: { id: true },
        }),
      );
    }

    for (const [i, m] of months.entries()) {
      const seasonal = 1 + (SEASON[m.month - 1] - 1) * profile.season;
      const noise = 0.92 + rand() * 0.16;
      const revenue = round(profile.base * seasonal * profile.growth ** i * noise);
      const expense = round(revenue * profile.expense * (0.9 + rand() * 0.2));
      const salary = round(revenue * profile.salary * (0.95 + rand() * 0.1));

      // Yozuv oyning 15-kuniga qo'yiladi — oy chegaralarida
      // vaqt zonasi tufayli qo'shni oyga tushib ketmasligi uchun.
      const date = new Date(Date.UTC(m.year, m.month - 1, 15, 12, 0, 0));
      const base = { branchId: branch.id, date, periodYear: m.year, periodMonth: m.month, isInternal: false };

      /** Bitta muvozanatli yozuv: debet bir hisobda, kredit boshqasida. */
      const post = async (kind, amount, debitAcc, creditAcc, memo) => {
        if (amount <= 0) return;
        await prisma.journalEntry.create({
          data: {
            ...base,
            kind,
            memo: `${NAME}${memo}`,
            postingKey: `${POSTING}${branch.id}:${m.year}-${m.month}:${kind}`,
            totalDebit: amount,
            totalCredit: amount,
            lines: {
              create: [
                { accountId: debitAcc.id, accountKind: debitAcc.kind, debit: amount, credit: 0 },
                { accountId: creditAcc.id, accountKind: creditAcc.kind, debit: 0, credit: amount },
              ],
            },
          },
        });
        entryCount += 1;
      };

      // Daromad: pul kassaga kiradi (debet), daromad hisobi kreditlanadi.
      await post('payment', revenue, cash, revenueAcc, 'daromad');
      // Chiqim va maosh: xarajat debetlanadi, kassadan chiqadi (kredit).
      await post('expense', expense, expenseAcc, cash, 'chiqim');
      await post('salary', salary, expenseAcc, cash, 'maosh');

      // ── TO'LOV REJALARI ──
      // Oyiga o'quvchilarning bir qismi to'liq to'laydi, bir qismi
      // qisman — qarzdorlik shundan chiqadi.
      /**
       * ⚠ HAR OY BIR XIL SONDA EMAS — MARKAZ O'SIB BORADI.
       *
       * Birinchi urinishda har oyga BUTUN ro'yxat yozilardi va
       * "O'quvchilar" grafigi uchta ideal to'g'ri chiziq bo'lib
       * chiqardi — bunday narsa haqiqiy markazda bo'lmaydi va u
       * darhol "generatsiya qilingan" deb o'qiladi.
       *
       * Endi faol o'quvchilar soni yil davomida ~55% dan 100% gacha
       * o'sadi va mavsumga ham qarab tebranadi (sentabrda qabul,
       * yozda pasayish) — daromad chizig'i bilan bir xil mantiq.
       */
      const seasonalShare = 0.55 + 0.45 * ((i + 1) / MONTHS);
      const active = Math.max(
        5,
        Math.round(profile.students * seasonalShare * (0.9 + (SEASON[m.month - 1] - 1) * 0.35)),
      );
      const cohort = students.slice(0, active);

      const fee = round(revenue / Math.max(1, cohort.length));
      const plans = cohort.map((s, si) => {
        const roll = rand();
        const paid = roll > 0.82 ? round(fee * (0.2 + rand() * 0.5)) : fee;
        return {
          branchId: branch.id,
          studentId: s.id,
          groupId: group.id,
          year: m.year,
          month: m.month,
          baseFee: fee,
          expectedAmount: fee,
          paidAmount: paid,
          status: paid >= fee ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
          // Har o'quvchi har oy bir xil yo'l tutmasin.
          prorationFactor: si % 17 === 0 ? 0.5 : 1,
        };
      });
      await prisma.studentPayment.createMany({ data: plans, skipDuplicates: true });
      planCount += plans.length;
    }

    console.log(`  ${branch.name.padEnd(18)} ${profile.students} o'quvchi · ${MONTHS} oy`);
  }

  console.log(`\nyaratildi: ${entryCount} jurnal yozuvi · ${planCount} to'lov rejasi`);
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
