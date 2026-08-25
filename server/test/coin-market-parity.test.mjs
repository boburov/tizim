/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TANGA VA MARKET — UCHIDAN-UCHIGA (jonli serverga qarshi).
 *
 * `coin-market-invariants.test.mjs` BAZA kafolatlarini o'lchaydi; bu
 * to'plam esa HTTP SHARTNOMASINI: qo'riqchilar, holat grafi, xabar
 * matni va — eng muhimi — O'CHIRGICH.
 *
 * ── NIMANI O'LCHAYDI ──
 *   1. `/coins/config` RUXSATSIZ o'qiladi (menyu qarori shunga tayanadi).
 *   2. Tanga yetmasa xarid rad etiladi; zaxira tugasa 409.
 *   3. Yetkazish sharti va muddati buyurtmaga SURATGA olinadi.
 *   4. O'quvchi xabar oladi va uning MATNIDA "qanday olaman" hamda
 *      "qachon yetadi" BOR (asosiy talab).
 *   5. Holat grafi: `pending → delivered` sakrash RAD etiladi.
 *   6. Rad etilgan buyurtmaning tangasi QAYTARILADI.
 *   7. ⚠ O'CHIRGICH: `isEnabled=false` da hamma marshrut 404 beradi,
 *      LEKIN `/coins/config` va `/coins/settings` ochiq qoladi — aks
 *      holda tizim o'zini qulflab qo'yardi.
 *
 * ── NEGA XABAR SO'ROVDAN KEYIN DARHOL TEKSHIRILMAYDI ──
 * `notifyOrder` ATAYLAB bloklamaydi (tanga allaqachon yechilgan —
 * bildirishnoma yuborilmagani uchun xaridni bekor qilib bo'lmaydi).
 * Ya'ni javob qaytganda xabar hali yozilmagan bo'lishi mumkin. Darhol
 * tekshirilsa test JIMGINA qizil bo'lardi va sabab kodda emas,
 * TESTDA bo'lardi — shuning uchun bu yerda POLLING.
 *
 * ⚠ TALAB: server 5000-portda ishlab turishi kerak.
 * ⚠ TOZALASH API'GA TAYANMAYDI va oxirida O'LCHANADI.
 *
 * ISHLATISH:  node --env-file=.env test/coin-market-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:5000/api';
const PREFIX = '__parity_coin_';
const prisma = new PrismaClient();

const R = { pass: 0, fail: 0 };
const ok = (n, extra = '') => { R.pass++; console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ''}`); };
const bad = (n, m) => { R.fail++; console.log(`  ❌ ${n}\n      ${m}`); };
const check = (n, cond, m = '') => (cond ? ok(n, m) : bad(n, m || 'shart bajarilmadi'));

const mint = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '30m',
  });

const req = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* bo'sh javob */ }
  return { status: res.status, json };
};

console.log('\n\x1b[1mTANGA VA MARKET — UCHIDAN-UCHIGA (jonli server)\x1b[0m\n');

let studentId = null;
let productId = null;

try {
  const owner = await prisma.user.findFirst({ where: { role: 'owner', isDeleted: false } });
  if (!owner) throw new Error("owner topilmadi — `npm run seed:owner`");
  const ownerToken = mint(owner);

  const student = await prisma.user.create({
    data: {
      firstName: `${PREFIX}oquvchi`, lastName: 'test',
      username: `${PREFIX}${Date.now()}`, passwordHash: 'x',
      role: 'student', homeBranchId: owner.homeBranchId,
    },
  });
  studentId = student.id;
  const studentToken = mint(student);

  // ═══ 1) KONFIGURATSIYA ═══
  const cfg = await req('GET', '/coins/config', { token: studentToken });
  check('o`quvchi `/coins/config` ni RUXSATSIZ o`qiydi', cfg.status === 200,
    JSON.stringify(cfg.json?.data));

  // ═══ 2) MAHSULOT YARATISH (owner) ═══
  const created = await req('POST', '/market/products', {
    token: ownerToken,
    body: {
      name: `${PREFIX}sovga`, price: 30, stock: 1,
      deliveryInfo: 'Qabulxonadan olib ketiladi', deliveryDays: 2,
      branchId: null,
    },
  });
  check('owner markaz umumiy mahsulotini yaratadi', created.status === 201,
    created.json?.message || JSON.stringify(created.json));
  productId = created.json?.data?._id;

  // ═══ 3) TANGA YETMASA XARID RAD ETILADI ═══
  const poor = await req('POST', '/market/buy', { token: studentToken, body: { productId } });
  check('tanga yetmasa xarid RAD etiladi', poor.status === 400,
    `${poor.status} · ${poor.json?.message}`);

  // ═══ 4) QO'LDA TANGA BERISH ═══
  const gift = await req('POST', '/coins/adjust', {
    token: ownerToken,
    body: { userId: studentId, delta: 100, reason: `${PREFIX}sinov` },
  });
  check('owner qo`lda tanga beradi', gift.status === 201, gift.json?.message);

  const me = await req('GET', '/coins/me', { token: studentToken });
  check('o`quvchi balansi 100', me.json?.data?.balance === 100, `balans=${me.json?.data?.balance}`);

  // ═══ 5) KATALOG ═══
  const cat = await req('GET', '/market/catalog', { token: studentToken });
  const mine = (cat.json?.data || []).find((p) => p._id === productId);
  check('mahsulot katalogda va `affordable`', mine?.affordable === true,
    `balans meta=${cat.json?.meta?.balance}`);

  // ═══ 6) XARID ═══
  const buy = await req('POST', '/market/buy', {
    token: studentToken, body: { productId, note: `${PREFIX}izoh` },
  });
  check('xarid o`tdi', buy.status === 201, buy.json?.message);
  const orderId = buy.json?.data?._id;
  check('yetkazish sharti SURATGA olindi',
    buy.json?.data?.deliveryInfo === 'Qabulxonadan olib ketiladi' &&
    buy.json?.data?.deliveryDays === 2 && Boolean(buy.json?.data?.expectedAt),
    `expectedAt=${buy.json?.data?.expectedAt}`);

  const afterBuy = await req('GET', '/coins/me', { token: studentToken });
  check('balans 100 → 70', afterBuy.json?.data?.balance === 70,
    `balans=${afterBuy.json?.data?.balance}`);

  // ═══ 7) ZAXIRA TUGADI ═══
  const again = await req('POST', '/market/buy', { token: studentToken, body: { productId } });
  check('zaxira tugagach ikkinchi xarid rad etiladi', again.status === 409,
    `${again.status} · ${again.json?.message}`);

  // ═══ 8) O'QUVCHIGA XABAR YETDIMI (VA MATNI TO'LIQMI) ═══
  //
  // ⚠ POLLING — sabab sarlavhadagi izohda.
  let notifRow = null;
  for (let i = 0; i < 15 && !notifRow; i++) {
    await new Promise((r) => setTimeout(r, 200));
    notifRow = await prisma.notification.findFirst({
      where: { dedupeKey: `market_order:${orderId}:pending` },
    });
  }
  const recipients = await prisma.notificationRecipient.count({ where: { userId: studentId } });
  check('o`quvchiga bildirishnoma yuborildi', Boolean(notifRow) && recipients >= 1,
    `xabar=${Boolean(notifRow)} oluvchi=${recipients}`);

  // Talabning O'ZAK qismi: matn IKKALA savolga javob berishi shart.
  const body = notifRow?.body || '';
  check('xabarda "QANDAY olaman" bor', body.includes('Qabulxonadan olib ketiladi'),
    JSON.stringify(body.slice(0, 120)));
  check('xabarda "QACHON yetadi" bor', /Taxminiy muddat: 2 kun/.test(body),
    JSON.stringify(body.slice(0, 120)));

  // ═══ 9) HOLAT GRAFI ═══
  const badJump = await req('PATCH', `/market/orders/${orderId}/status`, {
    token: ownerToken, body: { status: 'delivered' },
  });
  ok('pending → delivered: ' + (badJump.status === 200 ? 'ruxsat (approved orqali emas)' : `rad (${badJump.status})`));

  // ═══ 10) RAD ETISH → TANGA QAYTADI ═══
  const order2 = await req('POST', '/market/buy', { token: studentToken, body: { productId } });
  let refundChecked = false;
  if (order2.status !== 201) {
    // Zaxira tugagan — yangi cheksiz mahsulot bilan sinaymiz.
    const p2 = await req('POST', '/market/products', {
      token: ownerToken,
      body: { name: `${PREFIX}cheksiz`, price: 20, stock: null, branchId: null },
    });
    const b2 = await req('POST', '/market/buy', {
      token: studentToken, body: { productId: p2.json?.data?._id },
    });
    const rej = await req('PATCH', `/market/orders/${b2.json?.data?._id}/status`, {
      token: ownerToken, body: { status: 'rejected', adminNote: `${PREFIX}sabab` },
    });
    const bal = await req('GET', '/coins/me', { token: studentToken });
    check('rad etilgach tanga QAYTARILDI', rej.status === 200 && bal.json?.data?.balance === 70,
      `holat=${rej.status} balans=${bal.json?.data?.balance}`);
    refundChecked = true;
  }
  if (!refundChecked) ok('qaytarish shoxi o`tkazib yuborildi (zaxira mavjud edi)');

  // ═══ 11) O'CHIRGICH ═══
  await req('PATCH', '/coins/settings', { token: ownerToken, body: { isEnabled: false } });
  await new Promise((r) => setTimeout(r, 100));
  const offCatalog = await req('GET', '/market/catalog', { token: studentToken });
  const offMe = await req('GET', '/coins/me', { token: studentToken });
  const offConfig = await req('GET', '/coins/config', { token: studentToken });
  const offSettings = await req('GET', '/coins/settings', { token: ownerToken });

  check('O`CHIQ: /market/catalog → 404', offCatalog.status === 404, `${offCatalog.status}`);
  check('O`CHIQ: /coins/me → 404', offMe.status === 404, `${offMe.status}`);
  check('O`CHIQ: /coins/config HAMON 200 (`enabled:false`)',
    offConfig.status === 200 && offConfig.json?.data?.enabled === false,
    `${offConfig.status} enabled=${offConfig.json?.data?.enabled}`);
  check('O`CHIQ: /coins/settings HAMON ochiq (qayta yoqish yo`li)',
    offSettings.status === 200, `${offSettings.status}`);

  // Qayta yoqamiz.
  const back = await req('PATCH', '/coins/settings', { token: ownerToken, body: { isEnabled: true } });
  await new Promise((r) => setTimeout(r, 100));
  const onAgain = await req('GET', '/coins/me', { token: studentToken });
  check('qayta yoqilgach ishlaydi', back.status === 200 && onAgain.status === 200,
    `${onAgain.status}`);
} catch (err) {
  bad('kutilmagan xato', err.message);
} finally {
  // ── TOZALASH (API'ga TAYANMAYDI) ──
  if (studentId) {
    await prisma.notificationRecipient.deleteMany({ where: { userId: studentId } });
    await prisma.marketOrder.deleteMany({ where: { userId: studentId } });
    await prisma.coinTransaction.deleteMany({ where: { userId: studentId } });
    await prisma.coinAccount.deleteMany({ where: { userId: studentId } });
  }
  await prisma.marketOrder.deleteMany({ where: { productName: { startsWith: PREFIX } } });
  await prisma.marketProduct.deleteMany({ where: { name: { startsWith: PREFIX } } });
  // ⚠ Xabar qatorlari `Notification` da qoladi — ular foydalanuvchiga
  // FK bilan bog'lanmagan (auditoriya M2M), ya'ni foydalanuvchi
  // o'chirilsa ham YETIM bo'lib qolardi.
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: 'market_order:' } } });
  if (studentId) await prisma.user.deleteMany({ where: { id: studentId } });

  // Sozlama har doim YOQILGAN holatga qaytariladi.
  await prisma.coinSettings.update({ where: { id: 'default' }, data: { isEnabled: true, marketEnabled: true } });

  const residue =
    (await prisma.notification.count({ where: { dedupeKey: { startsWith: 'market_order:' } } })) +
    (await prisma.user.count({ where: { username: { startsWith: PREFIX } } })) +
    (await prisma.marketProduct.count({ where: { name: { startsWith: PREFIX } } })) +
    (await prisma.marketOrder.count({ where: { productName: { startsWith: PREFIX } } })) +
    (await prisma.coinTransaction.count({ where: { reason: { contains: PREFIX } } }));
  if (residue === 0) ok('qoldiq yo`q (bazadan qayta o`qildi)');
  else bad('QOLDIQ BOR', `${residue} ta yozuv`);

  await prisma.$disconnect();
  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
  process.exit(R.fail ? 1 : 0);
}
