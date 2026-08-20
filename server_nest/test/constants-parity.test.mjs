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
import {
  PERMISSIONS as EXPRESS_PERMISSIONS,
  ACTION_ORDER as EXPRESS_ACTION_ORDER,
  ACTION_LABELS as EXPRESS_ACTION_LABELS,
  MODULE_META as EXPRESS_MODULE_META,
  splitPermissionKey as expressSplitPermissionKey,
  getActionLabel as expressGetActionLabel,
  getActionOrder as expressGetActionOrder,
  getModuleMeta as expressGetModuleMeta,
} from '../../server/src/constants/permissions.js';
import {
  ROLES as EXPRESS_ROLES,
  ROLE_TYPES as EXPRESS_ROLE_TYPES,
  SYSTEM_ROLE_META as EXPRESS_SYSTEM_ROLE_META,
  DEFAULT_ROLE_PATH as EXPRESS_DEFAULT_ROLE_PATH,
} from '../../server/src/constants/roles.js';
import {
  PAYROLL_AUDIT_ACTIONS as EXPRESS_PAYROLL_AUDIT_ACTIONS,
  PAYROLL_AUDIT_ACTION_LABELS as EXPRESS_PAYROLL_AUDIT_ACTION_LABELS,
} from '../../server/src/constants/payrollAudit.js';
import {
  PAYROLL_AUDIT_ACTIONS,
  PAYROLL_AUDIT_ACTION_LABELS,
} from '../dist/common/constants/payroll-audit.js';
import {
  PERMISSIONS,
  ROLES,
  ROLE_TYPES,
  SYSTEM_ROLE_META,
  DEFAULT_ROLE_PATH,
  ACTION_ORDER,
  ACTION_LABELS,
  MODULE_META,
  splitPermissionKey,
  getActionLabel,
  getActionOrder,
  getModuleMeta,
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

// ── FAZA 2.4: matritsa metadata ──
// `GET /api/roles/matrix` javobining ustun tartibi va nomlari AYNAN
// shulardan quriladi, ya'ni ajralish frontend jadvalini buzardi.
check(`ACTION_ORDER aynan bir xil (${EXPRESS_ACTION_ORDER.length} ta)`, () =>
  assert.deepEqual(ACTION_ORDER, [...EXPRESS_ACTION_ORDER]));
check(`ACTION_LABELS aynan bir xil (${Object.keys(EXPRESS_ACTION_LABELS).length} ta)`, () =>
  assert.deepEqual({ ...ACTION_LABELS }, { ...EXPRESS_ACTION_LABELS }));
check(`MODULE_META aynan bir xil (${Object.keys(EXPRESS_MODULE_META).length} ta)`, () =>
  assert.deepEqual(JSON.parse(JSON.stringify(MODULE_META)), JSON.parse(JSON.stringify(EXPRESS_MODULE_META))));

check('yordamchi funksiyalar bir xil javob beradi', () => {
  const probes = [
    ...EXPRESS_ACTION_ORDER,
    'nomavjud_action',
    '',
  ];
  for (const a of probes) {
    assert.equal(getActionLabel(a), expressGetActionLabel(a), `getActionLabel(${a})`);
    assert.equal(getActionOrder(a), expressGetActionOrder(a), `getActionOrder(${a})`);
  }
  for (const m of [...Object.keys(EXPRESS_MODULE_META), 'nomavjud_modul']) {
    assert.deepEqual(getModuleMeta(m), expressGetModuleMeta(m), `getModuleMeta(${m})`);
  }
  for (const k of [...Object.values(EXPRESS_PERMISSIONS), 'nuqtasiz']) {
    assert.deepEqual(splitPermissionKey(k), expressSplitPermissionKey(k), `split(${k})`);
  }
});

// ── FAZA 2.5a: maosh audit lug'ati ──
// `PATCH /users/:id` `hiredAt` o'zgarganda shu kalitlardan birini yozadi.
// Kalit ajralib ketsa audit yozuvi noto'g'ri turkumga tushardi.
check(`PAYROLL_AUDIT_ACTIONS aynan bir xil (${Object.keys(EXPRESS_PAYROLL_AUDIT_ACTIONS).length} ta)`, () =>
  assert.deepEqual({ ...PAYROLL_AUDIT_ACTIONS }, { ...EXPRESS_PAYROLL_AUDIT_ACTIONS }));
check('PAYROLL_AUDIT_ACTION_LABELS aynan bir xil', () =>
  assert.deepEqual({ ...PAYROLL_AUDIT_ACTION_LABELS }, { ...EXPRESS_PAYROLL_AUDIT_ACTION_LABELS }));

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
process.exit(R.fail ? 1 : 0);
