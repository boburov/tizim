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
  PERMISSION_LABELS as EXPRESS_PERMISSION_LABELS,
  ACTION_ORDER as EXPRESS_ACTION_ORDER,
  ACTION_LABELS as EXPRESS_ACTION_LABELS,
  MODULE_META as EXPRESS_MODULE_META,
  splitPermissionKey as expressSplitPermissionKey,
  getActionLabel as expressGetActionLabel,
  getActionOrder as expressGetActionOrder,
  getModuleMeta as expressGetModuleMeta,
} from '../../server_legacy/src/constants/permissions.js';
import {
  ROLES as EXPRESS_ROLES,
  ROLE_TYPES as EXPRESS_ROLE_TYPES,
  SYSTEM_ROLE_META as EXPRESS_SYSTEM_ROLE_META,
  DEFAULT_ROLE_PATH as EXPRESS_DEFAULT_ROLE_PATH,
} from '../../server_legacy/src/constants/roles.js';
import {
  PAYROLL_AUDIT_ACTIONS as EXPRESS_PAYROLL_AUDIT_ACTIONS,
  PAYROLL_AUDIT_ACTION_LABELS as EXPRESS_PAYROLL_AUDIT_ACTION_LABELS,
} from '../../server_legacy/src/constants/payrollAudit.js';
import {
  PAYROLL_AUDIT_ACTIONS,
  PAYROLL_AUDIT_ACTION_LABELS,
} from '../dist/common/constants/payroll-audit.js';
import {
  OWNER_ONLY_PERMISSIONS as EXPRESS_OWNER_ONLY_PERMISSIONS,
  BRANCH_LOCAL_PERMISSIONS as EXPRESS_BRANCH_LOCAL_PERMISSIONS,
  isOwnerOnlyPermission as expressIsOwnerOnlyPermission,
} from '../../server_legacy/src/constants/permissionScope.js';
import {
  OWNER_ONLY_PERMISSIONS,
  BRANCH_LOCAL_PERMISSIONS,
  isOwnerOnlyPermission,
} from '../dist/common/constants/permission-scope.js';
import * as EXPRESS_DELEGATION from '../../server_legacy/src/constants/delegation.js';
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

// ── FAZA 3: delegatsiya matritsasi ──
// Ma'lumot qismi generatsiya qilingan, FUNKSIYALAR esa qo'lda ko'chirilgan —
// aynan shuning uchun ular tasodifiy kirish bilan solishtiriladi.
check('DELEGATABLE_KINDS aynan bir xil', () =>
  assert.deepEqual(
    JSON.parse(JSON.stringify(DELEGATION.DELEGATABLE_KINDS)),
    JSON.parse(JSON.stringify(EXPRESS_DELEGATION.DELEGATABLE_KINDS)),
  ));
check('DELEGATION_MODES / standartlar bir xil', () => {
  assert.deepEqual({ ...DELEGATION.DELEGATION_MODES }, { ...EXPRESS_DELEGATION.DELEGATION_MODES });
  assert.equal(DELEGATION.DEFAULT_DELEGATION_MODE, EXPRESS_DELEGATION.DEFAULT_DELEGATION_MODE);
  assert.equal(DELEGATION.FALLBACK_DELEGATION_MODE, EXPRESS_DELEGATION.FALLBACK_DELEGATION_MODE);
});
check('validateDelegation / resolveRule bir xil javob beradi', () => {
  const kinds = [...Object.keys(EXPRESS_DELEGATION.DELEGATABLE_KINDS), '__nope__'];
  const modes = [...EXPRESS_DELEGATION.ALL_DELEGATION_MODES, '__bad__', undefined];
  const limitSets = [
    {}, { maxAmount: 100 }, { minAmount: 100 }, { maxPercent: 50 },
    { maxPercent: 150 }, { maxAmount: -1 }, { maxAmount: 100, maxPercent: 10 },
  ];
  let cases = 0;
  for (const kind of kinds) {
    for (const mode of modes) {
      for (const limits of limitSets) {
        const input = { [kind]: { mode, ...limits } };
        assert.equal(
          DELEGATION.validateDelegation(input),
          EXPRESS_DELEGATION.validateDelegation(input),
          `validateDelegation(${kind}/${mode}/${JSON.stringify(limits)})`,
        );
        assert.deepEqual(
          DELEGATION.resolveRule(input, kind),
          EXPRESS_DELEGATION.resolveRule(input, kind),
          `resolveRule(${kind}/${mode})`,
        );
        cases += 1;
      }
    }
  }
  // Bo'sh/null kirish ham.
  for (const empty of [null, undefined, {}]) {
    assert.equal(DELEGATION.validateDelegation(empty), EXPRESS_DELEGATION.validateDelegation(empty));
    assert.deepEqual(
      DELEGATION.resolveRule(empty, 'staff_hire'),
      EXPRESS_DELEGATION.resolveRule(empty, 'staff_hire'),
    );
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

check(`PERMISSION_LABELS aynan bir xil (${Object.keys(EXPRESS_PERMISSION_LABELS).length} yorliq)`, () => {
  assert.deepEqual({ ...PERMISSION_LABELS }, { ...EXPRESS_PERMISSION_LABELS });
});

check('har bir ruxsatning yorlig\'i bor (yorliqsiz kalit qolmadi)', () => {
  const missing = Object.values(PERMISSIONS).filter((k) => !PERMISSION_LABELS[k]);
  assert.deepEqual(missing, [], `yorliqsiz: ${missing.join(', ')}`);
  const orphan = Object.keys(PERMISSION_LABELS).filter(
    (k) => !Object.values(PERMISSIONS).includes(k),
  );
  assert.deepEqual(orphan, [], `ruxsatsiz yorliq: ${orphan.join(', ')}`);
});

check(`OWNER_ONLY_PERMISSIONS aynan bir xil (${EXPRESS_OWNER_ONLY_PERMISSIONS.length} kalit)`, () => {
  assert.deepEqual([...OWNER_ONLY_PERMISSIONS], [...EXPRESS_OWNER_ONLY_PERMISSIONS]);
});

check(`BRANCH_LOCAL_PERMISSIONS aynan bir xil (${EXPRESS_BRANCH_LOCAL_PERMISSIONS.length} kalit)`, () => {
  assert.deepEqual([...BRANCH_LOCAL_PERMISSIONS], [...EXPRESS_BRANCH_LOCAL_PERMISSIONS]);
});

check('ko\'lam bo\'linishi TO\'LIQ: owner_only + branch_local = hammasi', () => {
  // Hisoblangan ro'yxat, qo'lda yozilmagan — shuning uchun bu invariant
  // yangi ruxsat qo'shilganda ham buzilmasligi SHART.
  const all = Object.values(PERMISSIONS);
  assert.equal(
    OWNER_ONLY_PERMISSIONS.length + BRANCH_LOCAL_PERMISSIONS.length,
    all.length,
    'bo\'linish to\'liq emas',
  );
  const overlap = BRANCH_LOCAL_PERMISSIONS.filter((k) => OWNER_ONLY_PERMISSIONS.includes(k));
  assert.deepEqual(overlap, [], `ikkala ro'yxatda ham bor: ${overlap.join(', ')}`);
});

check('isOwnerOnlyPermission har bir kalitda bir xil javob beradi', () => {
  for (const key of [...Object.values(PERMISSIONS), 'yoq.kalit', '']) {
    assert.equal(
      isOwnerOnlyPermission(key),
      expressIsOwnerOnlyPermission(key),
      `isOwnerOnlyPermission(${key})`,
    );
  }
});

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
process.exit(R.fail ? 1 : 0);
