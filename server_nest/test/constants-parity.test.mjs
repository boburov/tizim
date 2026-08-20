/**
 * KONSTANTALAR PARITETI — NestJS nusxasi Express manbasi bilan bir xilmi.
 *
 * NEGA KERAK: `src/common/constants/permissions.ts` Express faylidan
 * AVTOMATIK ko'chirilgan. Agar kimdir bir tomonni o'zgartirsa-yu
 * ikkinchisini unutsa, ruxsat JIMGINA ishlamay qo'yadi — kalit mos
 * kelmasa `hasPermission` hech qachon `true` bermaydi va hech qanday
 * xato ham chiqmaydi. Bu test shu ajralishni darhol ushlaydi.
 */
import assert from 'node:assert/strict';
import { PERMISSIONS as EXPRESS_PERMISSIONS } from '../../server/src/constants/permissions.js';
import {
  ROLES as EXPRESS_ROLES,
  ROLE_TYPES as EXPRESS_ROLE_TYPES,
  SYSTEM_ROLE_META as EXPRESS_SYSTEM_ROLE_META,
  DEFAULT_ROLE_PATH as EXPRESS_DEFAULT_ROLE_PATH,
} from '../../server/src/constants/roles.js';
import {
  PERMISSIONS,
  ROLES,
  ROLE_TYPES,
  SYSTEM_ROLE_META,
  DEFAULT_ROLE_PATH,
} from '../dist/common/constants/permissions.js';

const R = { pass: 0, fail: 0 };
const check = (name, fn) => {
  try { fn(); R.pass += 1; console.log(`  ✅ ${name}`); }
  catch (e) { R.fail += 1; console.log(`  ❌ ${name} — ${e.message.split('\n')[0]}`); }
};

console.log('\n\x1b[1mKonstantalar pariteti (Express ↔ NestJS)\x1b[0m\n');

check(`PERMISSIONS aynan bir xil (${Object.keys(EXPRESS_PERMISSIONS).length} kalit)`, () =>
  assert.deepEqual(PERMISSIONS, { ...EXPRESS_PERMISSIONS }));
check('ROLES aynan bir xil', () => assert.deepEqual(ROLES, { ...EXPRESS_ROLES }));
check('ROLE_TYPES aynan bir xil', () => assert.deepEqual(ROLE_TYPES, { ...EXPRESS_ROLE_TYPES }));
check('SYSTEM_ROLE_META aynan bir xil', () =>
  assert.deepEqual(SYSTEM_ROLE_META, JSON.parse(JSON.stringify(EXPRESS_SYSTEM_ROLE_META))));
check('DEFAULT_ROLE_PATH aynan bir xil', () =>
  assert.equal(DEFAULT_ROLE_PATH, EXPRESS_DEFAULT_ROLE_PATH));

// Ruxsat kalitlari bazadagi katalog bilan ham mos kelishi kerak.
check('hech bir kalit bo\'sh yoki takrorlanmagan', () => {
  const vals = Object.values(PERMISSIONS);
  assert.equal(new Set(vals).size, vals.length, 'takrorlangan kalit bor');
  assert.ok(vals.every((v) => typeof v === 'string' && v.includes('.')), 'buzuq kalit');
});

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
process.exit(R.fail ? 1 : 0);
