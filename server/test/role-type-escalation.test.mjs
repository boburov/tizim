/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROL TIPI ORQALI IMTIYOZ OSHIRISH — YOZISH YO'LIDAGI HIMOYA.
 *
 * ── SAVOL ──
 * "Direktor o'z rolini `owner` TIPIGA ko'chirib, owner marshrutlarini
 *  ocha oladimi?"
 *
 * Ilgari — HA, va bu `owner-only-keys` tekshiruvidan BUTUNLAY chetda
 * qolardi. Sabab: `assertOwnerOnlyKeysNotGranted` faqat RUXSAT
 * KALITLARINI ko'radi, `roleType` esa ruxsat emas — u Role yozuvining
 * alohida maydoni.
 *
 * ── ZANJIR ──
 *   1. `roles.update` — FILIAL ICHIDAGI kalit (`BRANCH_LOCAL_PERMISSIONS`
 *      "hamma narsa minus istisnolar"), ya'ni har bir direktorda bor.
 *   2. `updateSchema` `roleType` uchun `z.enum(ALL_ROLE_TYPES)` ishlatadi,
 *      va `ALL_ROLE_TYPES` ichida `owner` BOR.
 *   3. `roles.service.update` uni tekshirmasdan yozardi.
 *   4. `RolesGuard` rol TIPINI owner bilan tenglashtiradi
 *      (`roles.includes(roleType)`), ya'ni barcha `@Roles(OWNER)`
 *      marshrutlari ochilardi.
 *
 * `create` da ham xuddi shu teshik bor edi (`roleType: body.roleType`).
 *
 * ⚠ O'LCHOV `system.admin_access`: u `OWNER_ONLY_PERMISSIONS` ichida,
 * ya'ni direktorga hech qachon tushmaydi, va `PERMISSION_IMPLIES` orqali
 * ham keltirib chiqarilmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { assertCanAssignRoleType } from '../dist/common/rbac/roles.helper.js';

const R = { pass: 0, fail: 0, notes: [] };
const check = (n, cond, d = 'shart bajarilmadi') => {
  if (cond) { R.pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${n}`); }
  else { R.fail += 1; R.notes.push(`${n} — ${d}`); console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`); }
};

const rejects = (perms, roleType) => {
  try { assertCanAssignRoleType(perms, roleType); return false; }
  catch { return true; }
};

// Direktorning HAQIQIY ruxsat to'plamiga yaqin namuna.
const DIRECTOR = ['roles.read', 'roles.update', 'users.update', 'finance.read', 'students.create'];
const OWNER = ['*'];

console.log('\n\x1b[1mROL TIPI — IMTIYOZ OSHIRISHDAN HIMOYA\x1b[0m\n');

console.log('\x1b[1m1) Asosiy devor — `owner` tipini faqat ega beradi\x1b[0m');
check(
  'direktor rol tipini `owner` qila OLMAYDI',
  rejects(DIRECTOR, 'owner'),
  'direktor o\'zini owner tipiga ko\'chira oladi — imtiyoz oshirish',
);
check('ega `owner` tipini bera oladi', !rejects(OWNER, 'owner'));
check(
  '`system.admin_access` bo\'lgan rol ham bera oladi (RolesGuard uni owner deb biladi)',
  !rejects(['system.admin_access'], 'owner'),
);

console.log('\n\x1b[1m2) Ruxsatsiz / bo\'sh holat — FAIL-CLOSED\x1b[0m');
check('ruxsat ro\'yxati `undefined` bo\'lsa RAD etiladi', rejects(undefined, 'owner'));
check('ruxsat ro\'yxati `null` bo\'lsa RAD etiladi', rejects(null, 'owner'));
check('bo\'sh ruxsat ro\'yxati RAD etiladi', rejects([], 'owner'));

console.log('\n\x1b[1m3) REGRESSIYA — qolgan tiplar ilgarigidek ishlaydi\x1b[0m');
for (const t of ['staff', 'teacher', 'student']) {
  check(`direktor \`${t}\` tipini bera oladi`, !rejects(DIRECTOR, t));
}
check('`roleType` berilmasa (undefined) o\'tadi', !rejects(DIRECTOR, undefined));
check('`roleType` null bo\'lsa o\'tadi', !rejects(DIRECTOR, null));
check('bo\'sh satr o\'tadi', !rejects(DIRECTOR, ''));

console.log('\n\x1b[1m4) Chegara holatlari\x1b[0m');
// Zod hozir bularni o'tkazmaydi, lekin tekshiruv unga TAYANMAYDI.
check('katta harfli `OWNER` ham RAD etiladi', rejects(DIRECTOR, 'OWNER'));
check('`owner ` (probel bilan) ham RAD etiladi', rejects(DIRECTOR, 'owner '));
check('`Owner` ham RAD etiladi', rejects(DIRECTOR, 'Owner'));

console.log(
  `\n\x1b[1mNATIJA:\x1b[0m ${R.fail ? '\x1b[31m' : '\x1b[32m'}${R.pass} o'tdi\x1b[0m, ${R.fail} yiqildi\n`,
);
if (R.fail) { for (const n of R.notes) console.log(`  • ${n}`); process.exit(1); }
