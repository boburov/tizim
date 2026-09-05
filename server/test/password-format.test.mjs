/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAROL FORMATI — IKKI YO'L BIR VAQTDA ISHLAYDIMI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NEGA KERAK: markaz egasining paroli endi `scrypt` hash sifatida
 * saqlanadi (dev panel yozadi), qolgan foydalanuvchilarniki esa
 * ochiq matnda qoladi — bu mahsulot funksiyasi ("xodim parolini
 * ko'rsatish"). Ikkalasi BIR XIL `comparePassword` orqali o'tadi.
 *
 * Bu yerda ushlanadigan xatolar:
 *   • hash formatini o'zgartirib, mavjud eganing KIRISHINI yo'qotish;
 *   • ochiq matn yo'lini buzib, BUTUN markazni tizimdan chiqarib yuborish;
 *   • `hashPassword` ni "tuzatib" hash qilib qo'yish — o'shanda
 *     `GET /users/:id/password` ekrani jimgina buzilardi.
 *
 * ⚠ FORMAT `admin_server/src/common/crypto/tenant-password.util.ts` BILAN
 * BIR XIL BO'LISHI SHART: hashni admin_server yozadi, bu server o'qiydi.
 * Shu sabab quyida format SATR sifatida ham tekshiriladi.
 */
import assert from 'node:assert/strict';
import {
  hashPassword,
  hashPasswordSecure,
  comparePassword,
  isHashed,
} from '../src/common/utils/password.ts';

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log('\n\x1b[1mPAROL FORMATI\x1b[0m');

await test("hashPassword ochiq matn qaytaradi (mahsulot funksiyasi saqlanadi)", async () => {
  assert.equal(await hashPassword('Parol123!'), 'Parol123!');
  assert.equal(isHashed(await hashPassword('Parol123!')), false);
});

await test('eski ochiq yozuv bilan kirish ishlaydi', async () => {
  assert.equal(await comparePassword('Parol123!', 'Parol123!'), true);
  assert.equal(await comparePassword('boshqa', 'Parol123!'), false);
});

await test("hashPasswordSecure `scrypt$salt$key` formatini beradi", async () => {
  const h = await hashPasswordSecure('Parol123!');
  assert.equal(isHashed(h), true);
  const parts = h.split('$');
  assert.equal(parts.length, 3, `format buzuq: ${h}`);
  assert.equal(parts[0], 'scrypt');
  // salt 16 bayt, key 64 bayt — base64 uzunligi shundan kelib chiqadi.
  assert.equal(Buffer.from(parts[1], 'base64').length, 16);
  assert.equal(Buffer.from(parts[2], 'base64').length, 64);
});

await test('hash bilan kirish ishlaydi', async () => {
  const h = await hashPasswordSecure('Parol123!');
  assert.equal(await comparePassword('Parol123!', h), true);
  assert.equal(await comparePassword('Parol123', h), false);
  assert.equal(await comparePassword('', h), false);
});

await test('har hash boshqacha (tuz tasodifiy)', async () => {
  const a = await hashPasswordSecure('bir xil');
  const b = await hashPasswordSecure('bir xil');
  assert.notEqual(a, b, 'tuz ishlatilmayapti — bir xil parol bir xil hash bergan');
  assert.equal(await comparePassword('bir xil', a), true);
  assert.equal(await comparePassword('bir xil', b), true);
});

await test('buzuq hash qiymati kirishga yo\'l qo\'ymaydi', async () => {
  // ⚠ `scrypt$!!!$!!!` — HAQIQIY topilma: base64 buzuq bo'lsa ikkala
  // tomon ham BO'SH buferga aylanib, taqqoslash TENG chiqardi va
  // buzuq hash har qanday parolni qabul qilardi.
  const broken = [
    'scrypt$',
    'scrypt$abc',
    'scrypt$$',
    'scrypt$!!!$!!!',
    'scrypt$AAAA$AAAA', // to'g'ri base64, lekin uzunlik noto'g'ri
    `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(8).toString('base64')}`,
  ];
  for (const bad of broken) {
    assert.equal(await comparePassword('nimadir', bad), false, `"${bad}" o'tkazib yubordi`);
  }
});

await test("bo'sh/null saqlangan qiymat kirishga yo'l qo'ymaydi", async () => {
  assert.equal(await comparePassword('nimadir', null), false);
  assert.equal(await comparePassword('nimadir', ''), false);
  // ⚠ Bo'sh parol + bo'sh saqlangan qiymat — bu MOS KELADI (eski
  // ochiq matn semantikasi). Hisobda parol bo'lmasa unga kirish
  // `auth.service` darajasida to'siladi, bu funksiya emas.
});

console.log(`\n\x1b[32m${passed} o'tdi\x1b[0m\n`);
