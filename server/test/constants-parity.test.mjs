/**
 * KONSTANTALAR PARITETI — NestJS nusxasi MUZLATILGAN Express oracle'i
 * bilan bir xilmi.
 *
 * NEGA KERAK: `src/common/constants/permissions.ts` Express faylidan
 * AVTOMATIK ko'chirilgan. Agar kimdir bir tomonni o'zgartirsa-yu
 * ikkinchisini unutsa, ruxsat JIMGINA ishlamay qo'yadi — kalit mos
 * kelmasa `hasPermission` hech qachon `true` bermaydi va hech qanday
 * xato ham chiqmaydi. Bu test shu ajralishni darhol ushlaydi.
 *
 * ⚠ ILGARI `server_legacy/src/constants/*` JONLI import qilinardi.
 * Express stek o'chirilgach, ma'lumot HAM, funksiya chiqishlari HAM
 * (252 delegatsiya holati) `test/fixtures/express-constants.json` ga
 * MUZLATILDI. Oracle o'zgarmaydi — u ko'chirish tugagan paytdagi
 * shartnomani qayd etadi.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PAYROLL_AUDIT_ACTIONS,
  PAYROLL_AUDIT_ACTION_LABELS,
} from '../dist/modules/staff-payroll/payroll-audit.constants.js';
import {
  OWNER_ONLY_PERMISSIONS,
  BRANCH_LOCAL_PERMISSIONS,
  isOwnerOnlyPermission,
} from '../dist/common/constants/permission-scope.js';
import * as DELEGATION from '../dist/common/constants/delegation.js';
import {
  PERMISSIONS,
  PERMISSION_LABELS,
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EX = JSON.parse(readFileSync(path.join(HERE, 'fixtures/express-constants.json'), 'utf8'));
/** Oracle'da `undefined` sentinel bilan saqlangan. */
const dec = (v) => (v && typeof v === 'object' && v.__undef === true ? undefined : v);
const J = (v) => JSON.parse(JSON.stringify(v));

const R = { pass: 0, fail: 0 };
const check = (name, fn) => {
  try { fn(); R.pass += 1; console.log(`  ✅ ${name}`); }
  catch (e) { R.fail += 1; console.log(`  ❌ ${name} — ${e.message.split('\n')[0]}`); }
};

console.log('\n\x1b[1mKonstantalar pariteti (muzlatilgan Express oracle ↔ NestJS)\x1b[0m\n');

check(`PERMISSIONS aynan bir xil (${Object.keys(EX.PERMISSIONS).length} kalit)`, () =>
  assert.deepEqual({ ...PERMISSIONS }, EX.PERMISSIONS));
check('ROLES aynan bir xil', () => assert.deepEqual({ ...ROLES }, EX.ROLES));
check('ROLE_TYPES aynan bir xil', () => assert.deepEqual({ ...ROLE_TYPES }, EX.ROLE_TYPES));
check('SYSTEM_ROLE_META aynan bir xil', () => assert.deepEqual(J(SYSTEM_ROLE_META), EX.SYSTEM_ROLE_META));
check('DEFAULT_ROLE_PATH aynan bir xil', () => assert.equal(DEFAULT_ROLE_PATH, EX.DEFAULT_ROLE_PATH));

// Ruxsat kalitlari bazadagi katalog bilan ham mos kelishi kerak.
check("hech bir kalit bo'sh yoki takrorlanmagan", () => {
  const vals = Object.values(PERMISSIONS);
  assert.equal(new Set(vals).size, vals.length, 'takrorlangan kalit bor');
  assert.ok(vals.every((v) => typeof v === 'string' && v.includes('.')), 'buzuq kalit');
});

// ── FAZA 2.4: matritsa metadata ──
// `GET /api/roles/matrix` javobining ustun tartibi va nomlari AYNAN
// shulardan quriladi, ya'ni ajralish frontend jadvalini buzardi.
check(`ACTION_ORDER aynan bir xil (${EX.ACTION_ORDER.length} ta)`, () =>
  assert.deepEqual([...ACTION_ORDER], EX.ACTION_ORDER));
check(`ACTION_LABELS aynan bir xil (${Object.keys(EX.ACTION_LABELS).length} ta)`, () =>
  assert.deepEqual({ ...ACTION_LABELS }, EX.ACTION_LABELS));
check(`MODULE_META aynan bir xil (${Object.keys(EX.MODULE_META).length} ta)`, () =>
  assert.deepEqual(J(MODULE_META), EX.MODULE_META));

check('yordamchi funksiyalar bir xil javob beradi', () => {
  for (const [a, want] of Object.entries(EX.fn.getActionLabel))
    assert.equal(getActionLabel(a), dec(want), `getActionLabel(${a})`);
  for (const [a, want] of Object.entries(EX.fn.getActionOrder))
    assert.equal(getActionOrder(a), dec(want), `getActionOrder(${a})`);
  for (const [m, want] of Object.entries(EX.fn.getModuleMeta))
    assert.deepEqual(J(getModuleMeta(m)) ?? null, dec(want) ?? null, `getModuleMeta(${m})`);
  for (const [k, want] of Object.entries(EX.fn.splitPermissionKey))
    assert.deepEqual(J(splitPermissionKey(k)) ?? null, dec(want) ?? null, `split(${k})`);
});

// ── FAZA 2.5a: maosh audit lug'ati ──
// `PATCH /users/:id` `hiredAt` o'zgarganda shu kalitlardan birini yozadi.
// Kalit ajralib ketsa audit yozuvi noto'g'ri turkumga tushardi.
check(`PAYROLL_AUDIT_ACTIONS aynan bir xil (${Object.keys(EX.PAYROLL_AUDIT_ACTIONS).length} ta)`, () =>
  assert.deepEqual({ ...PAYROLL_AUDIT_ACTIONS }, EX.PAYROLL_AUDIT_ACTIONS));
check('PAYROLL_AUDIT_ACTION_LABELS aynan bir xil', () =>
  assert.deepEqual({ ...PAYROLL_AUDIT_ACTION_LABELS }, EX.PAYROLL_AUDIT_ACTION_LABELS));

// ── FAZA 3: delegatsiya matritsasi ──
// Ma'lumot qismi generatsiya qilingan, FUNKSIYALAR esa qo'lda ko'chirilgan —
// aynan shuning uchun ular tasodifiy kirish bilan solishtiriladi.
check('DELEGATABLE_KINDS aynan bir xil', () =>
  assert.deepEqual(J(DELEGATION.DELEGATABLE_KINDS), EX.DELEGATABLE_KINDS));
check('DELEGATION_MODES / standartlar bir xil', () => {
  assert.deepEqual({ ...DELEGATION.DELEGATION_MODES }, EX.DELEGATION_MODES);
  assert.equal(DELEGATION.DEFAULT_DELEGATION_MODE, EX.DEFAULT_DELEGATION_MODE);
  assert.equal(DELEGATION.FALLBACK_DELEGATION_MODE, EX.FALLBACK_DELEGATION_MODE);
});
check('validateDelegation / resolveRule bir xil javob beradi', () => {
  // Kirishlar oracle KALITLARIDAN tiklanadi — ya'ni holatlar to'plami
  // muzlatilgan paytdagi bilan AYNAN bir xil (252 ta).
  let cases = 0;
  for (const [key, want] of Object.entries(EX.delegation)) {
    const parsed = JSON.parse(key);
    if ('__empty' in parsed) {
      const input = dec(parsed.__empty);
      assert.equal(DELEGATION.validateDelegation(input), dec(want.validate), `validateDelegation(bo'sh)`);
      assert.deepEqual(
        J(DELEGATION.resolveRule(input, 'staff_hire')) ?? null,
        dec(want.resolve) ?? null,
        `resolveRule(bo'sh)`,
      );
      continue;
    }
    const kind = Object.keys(parsed)[0];
    assert.equal(DELEGATION.validateDelegation(parsed), dec(want.validate), `validateDelegation(${key})`);
    assert.deepEqual(
      J(DELEGATION.resolveRule(parsed, kind)) ?? null,
      dec(want.resolve) ?? null,
      `resolveRule(${key})`,
    );
    cases += 1;
  }
  assert.ok(cases >= 200, `juda kam holat sinaldi: ${cases}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// SEED KONSTANTALARI.
//
// ⚠ BULARNI ISH VAQTIDA HECH KIM IMPORT QILMAYDI — yagona iste'molchi
// `src/seeds/`. Aynan shu sabab ular birinchi ko'chirishda TUSHIB QOLGAN
// edi (marshrut/modul bo'yicha yurgan ko'chirish ularni ko'rmagan).
//
// Ular ajralib ketsa xato JIMGINA bo'ladi: seed yurib ketaveradi, faqat
// bazaga BOSHQA yorliq yoki BOSHQA ruxsat to'plami tushadi. Direktor
// ro'yxati bo'lsa — bu to'g'ridan-to'g'ri xavfsizlik chegarasi.
// ═══════════════════════════════════════════════════════════════════════════

check(`PERMISSION_LABELS aynan bir xil (${Object.keys(EX.PERMISSION_LABELS).length} yorliq)`, () => {
  assert.deepEqual({ ...PERMISSION_LABELS }, EX.PERMISSION_LABELS);
});

check("har bir ruxsatning yorlig'i bor (yorliqsiz kalit qolmadi)", () => {
  const missing = Object.values(PERMISSIONS).filter((k) => !PERMISSION_LABELS[k]);
  assert.deepEqual(missing, [], `yorliqsiz: ${missing.join(', ')}`);
  const orphan = Object.keys(PERMISSION_LABELS).filter(
    (k) => !Object.values(PERMISSIONS).includes(k),
  );
  assert.deepEqual(orphan, [], `ruxsatsiz yorliq: ${orphan.join(', ')}`);
});

check(`OWNER_ONLY_PERMISSIONS aynan bir xil (${EX.OWNER_ONLY_PERMISSIONS.length} kalit)`, () => {
  assert.deepEqual([...OWNER_ONLY_PERMISSIONS], EX.OWNER_ONLY_PERMISSIONS);
});

check(`BRANCH_LOCAL_PERMISSIONS aynan bir xil (${EX.BRANCH_LOCAL_PERMISSIONS.length} kalit)`, () => {
  assert.deepEqual([...BRANCH_LOCAL_PERMISSIONS], EX.BRANCH_LOCAL_PERMISSIONS);
});

check("ko'lam bo'linishi TO'LIQ: owner_only + branch_local = hammasi", () => {
  // Hisoblangan ro'yxat, qo'lda yozilmagan — shuning uchun bu invariant
  // yangi ruxsat qo'shilganda ham buzilmasligi SHART.
  const all = Object.values(PERMISSIONS);
  assert.equal(
    OWNER_ONLY_PERMISSIONS.length + BRANCH_LOCAL_PERMISSIONS.length,
    all.length,
    "bo'linish to'liq emas",
  );
  const overlap = BRANCH_LOCAL_PERMISSIONS.filter((k) => OWNER_ONLY_PERMISSIONS.includes(k));
  assert.deepEqual(overlap, [], `ikkala ro'yxatda ham bor: ${overlap.join(', ')}`);
});

check('isOwnerOnlyPermission har bir kalitda bir xil javob beradi', () => {
  for (const [key, want] of Object.entries(EX.fn.isOwnerOnlyPermission)) {
    assert.equal(isOwnerOnlyPermission(key), dec(want), `isOwnerOnlyPermission(${key})`);
  }
});

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
process.exit(R.fail ? 1 : 0);
