/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TANGA VA MARKET — BAZA DARAJASIDAGI INVARIANTLAR.
 *
 * ── NEGA HTTP EMAS, TO'G'RIDAN BAZA ──
 *
 * Bu yerda tekshirilayotgan narsalar KOD emas, BAZA kafolatlari:
 * qisman unique indeks, CHECK cheklovi va shartli UPDATE ning qatorni
 * qulflashi. Ular HTTP orqali tekshirilsa, natija servis mantig'iga
 * ham bog'liq bo'lardi — ya'ni yashil test "indeks bor" degani EMAS,
 * "servis hozircha to'g'ri yozilgan" degani bo'lardi. Indeks tushib
 * qolsa (migratsiya qo'lda ko'chirilganda odatiy hol) test baribir
 * yashil qolardi va himoya JIMGINA yo'qolardi.
 *
 * ── NIMANI O'LCHAYDI ──
 *   1. IDEMPOTENTLIK  — bitta manba (`sourceKey`) IKKI marta to'lamaydi.
 *   2. MANFIY BALANS  — shartli UPDATE mablag' yetmasa 0 qator tegadi.
 *   3. NOL HARAKAT    — `delta = 0` yozuvi bazada rad etiladi.
 *   4. ZAXIRA POYGASI — oxirgi mahsulotni ikki kishi olsa BITTASI o'tadi.
 *   5. QAYTARISH      — `refundedAt` egallash ikki marta qaytarishni to'sadi.
 *
 * ⚠ TOZALASH O'LCHANADI. "Tozaladim" degan da'vo yetarli emas: yutilgan
 * FK xatosi tufayli yashil test qoldiq to'plashi mumkin. Shuning uchun
 * oxirida bazadan QAYTA o'qib, qoldiq YO'Qligi tasdiqlanadi.
 *
 * ISHLATISH:  node --env-file=.env test/coin-market-invariants.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** `fixture-residue.test.mjs` shu prefiksni qidiradi. */
const PREFIX = '__parity_coin_';

const R = { pass: 0, fail: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const check = async (name, fn) => {
  try { await fn(); ok(name); } catch (e) { bad(name, e.message.split('\n')[0]); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\n\x1b[1mTANGA VA MARKET — BAZA INVARIANTLARI\x1b[0m\n');

let userId = null;
let productId = null;

try {
  // ── FIXTURE ──
  const user = await prisma.user.create({
    data: {
      firstName: `${PREFIX}test`,
      lastName: 'user',
      username: `${PREFIX}${Date.now()}`,
      passwordHash: 'x',
      role: 'student',
    },
  });
  userId = user.id;

  const product = await prisma.marketProduct.create({
    data: { name: `${PREFIX}mahsulot`, price: 50, stock: 1 },
  });
  productId = product.id;

  await prisma.coinAccount.create({ data: { userId, balance: 100, totalEarned: 100 } });

  // ═══ 1. IDEMPOTENTLIK ═══
  await check("bitta `sourceKey` IKKI marta to'lamaydi", async () => {
    const key = `${PREFIX}attendance:1`;
    await prisma.coinTransaction.create({
      data: { userId, delta: 5, balanceAfter: 105, kind: 'attendance', sourceKey: key },
    });
    let blocked = false;
    try {
      await prisma.coinTransaction.create({
        data: { userId, delta: 5, balanceAfter: 110, kind: 'attendance', sourceKey: key },
      });
    } catch (e) {
      blocked = e?.code === 'P2002';
    }
    assert(blocked, "ikkinchi yozuv O'TIB KETDI — qisman unique indeks yo'q");
  });

  await check("`sourceKey` YO'Q yozuvlar bir-birini to'smaydi", async () => {
    // Qo'lda berilgan tanga takrorlanishi MUMKIN (har hafta sovg'a).
    // NULL != NULL bo'lgani uchun indeks ularga tegmasligi kerak.
    await prisma.coinTransaction.create({
      data: { userId, delta: 1, balanceAfter: 106, kind: 'manual', reason: `${PREFIX}a` },
    });
    await prisma.coinTransaction.create({
      data: { userId, delta: 1, balanceAfter: 107, kind: 'manual', reason: `${PREFIX}b` },
    });
    ok; // yiqilmasa yetarli
  });

  // ═══ 2. MANFIY BALANS ═══
  await check("mablag' yetmasa shartli UPDATE 0 qator tegadi", async () => {
    const res = await prisma.coinAccount.updateMany({
      where: { userId, balance: { gte: 999999 } },
      data: { balance: { decrement: 999999 } },
    });
    assert(res.count === 0, `${res.count} qator o'zgardi — balans minusga tushardi`);
    const after = await prisma.coinAccount.findUnique({ where: { userId } });
    assert(after.balance === 100, `balans o'zgarib ketdi: ${after.balance}`);
  });

  await check('CHECK cheklovi manfiy balansni BAZADA to`sadi', async () => {
    let blocked = false;
    try {
      // Shartsiz — ya'ni kod xatosini taqlid qiladi.
      await prisma.coinAccount.update({
        where: { userId },
        data: { balance: { decrement: 100000 } },
      });
    } catch {
      blocked = true;
    }
    assert(blocked, 'manfiy balans YOZILDI — CHECK cheklovi yo`q');
  });

  // ═══ 3. NOL HARAKAT ═══
  await check('`delta = 0` yozuvi rad etiladi', async () => {
    let blocked = false;
    try {
      await prisma.coinTransaction.create({
        data: { userId, delta: 0, balanceAfter: 100, kind: 'manual' },
      });
    } catch {
      blocked = true;
    }
    assert(blocked, "nol harakat YOZILDI — tarixda ma'nosiz qator paydo bo'lardi");
  });

  // ═══ 4. ZAXIRA POYGASI ═══
  await check('oxirgi mahsulotni faqat BITTA xarid oladi', async () => {
    const first = await prisma.marketProduct.updateMany({
      where: { id: productId, stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    const second = await prisma.marketProduct.updateMany({
      where: { id: productId, stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    assert(first.count === 1, 'birinchi xarid o`tmadi');
    assert(second.count === 0, 'ikkinchi xarid ham o`tdi — zaxira minusga tushardi');
  });

  await check('cheksiz zaxira (`stock = null`) kamaymaydi', async () => {
    const unlimited = await prisma.marketProduct.create({
      data: { name: `${PREFIX}cheksiz`, price: 1, stock: null },
    });
    // `gte: 1` NULL qatorga MOS KELMAYDI — cheksiz mahsulot bu yo'ldan
    // umuman o'tmasligi kerak (servis uni alohida shoxda hal qiladi).
    const res = await prisma.marketProduct.updateMany({
      where: { id: unlimited.id, stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    await prisma.marketProduct.delete({ where: { id: unlimited.id } });
    assert(res.count === 0, 'cheksiz zaxira kamaydi — `null` son deb o`qildi');
  });

  // ═══ 5. QAYTARISH ═══
  await check("`refundedAt` egallash IKKI marta qaytarishni to'sadi", async () => {
    const order = await prisma.marketOrder.create({
      data: {
        userId, productId,
        productName: `${PREFIX}mahsulot`,
        priceCoins: 50,
        status: 'pending',
      },
    });
    const first = await prisma.marketOrder.updateMany({
      where: { id: order.id, refundedAt: null },
      data: { refundedAt: new Date() },
    });
    const second = await prisma.marketOrder.updateMany({
      where: { id: order.id, refundedAt: null },
      data: { refundedAt: new Date() },
    });
    assert(first.count === 1, 'birinchi qaytarish egallanmadi');
    assert(second.count === 0, 'ikkinchi qaytarish ham o`tdi — tanga IKKI marta qaytarilardi');
  });

  await check("holat egallash: `pending` dan bir marta chiqiladi", async () => {
    const order = await prisma.marketOrder.create({
      data: {
        userId, productId,
        productName: `${PREFIX}mahsulot2`,
        priceCoins: 10,
        status: 'pending',
      },
    });
    const a = await prisma.marketOrder.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'approved' },
    });
    const b = await prisma.marketOrder.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'rejected' },
    });
    assert(a.count === 1 && b.count === 0,
      `ikki administrator bir vaqtda o'tkazdi (a=${a.count}, b=${b.count})`);
  });
} finally {
  // ═══════════════════════════════════════════════════════════════════
  // TOZALASH — VA UNI O'LCHASH
  //
  // ⚠ TARTIB MUHIM: buyurtma → tranzaksiya → hamyon → mahsulot →
  // foydalanuvchi. `market_orders.productId` da `ON DELETE RESTRICT`
  // bor, ya'ni mahsulotni oldin o'chirishga urinish FK xatosi berardi.
  // ═══════════════════════════════════════════════════════════════════
  if (userId) {
    await prisma.marketOrder.deleteMany({ where: { userId } });
    await prisma.coinTransaction.deleteMany({ where: { userId } });
    await prisma.coinAccount.deleteMany({ where: { userId } });
  }
  if (productId) {
    await prisma.marketProduct.deleteMany({ where: { id: productId } });
  }
  await prisma.marketProduct.deleteMany({ where: { name: { startsWith: PREFIX } } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });

  // Da'vo emas, O'LCHOV: bazadan QAYTA o'qiymiz.
  const residue =
    (await prisma.user.count({ where: { username: { startsWith: PREFIX } } })) +
    (await prisma.marketProduct.count({ where: { name: { startsWith: PREFIX } } })) +
    (await prisma.marketOrder.count({ where: { productName: { startsWith: PREFIX } } })) +
    (await prisma.coinTransaction.count({ where: { reason: { startsWith: PREFIX } } }));

  if (residue === 0) ok('sinov obyektlari qolmadi (bazadan qayta o`qildi)');
  else bad('QOLDIQ BOR', `${residue} ta yozuv o'chirilmadi — prefiks: ${PREFIX}`);

  await prisma.$disconnect();
  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
  process.exit(R.fail ? 1 : 0);
}
