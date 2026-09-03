/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIM FAQAT O'Z FILIALINI KO'RADI — YOZISH YO'LIDAGI HIMOYA.
 *
 * ── SAVOL ──
 * "Owner panel orqali direktorga `branches.view_all` berib qo'ya oladimi?"
 *
 * Ilgari — HA. Yagona tekshiruv `assertCanGrantPermissions` edi ("o'zingda
 * yo'q narsani bera olmaysan"), u esa owner uchun har doim o'tadi
 * (`["*"]`). Kalit berilgan zahoti "filial ichi" tushunchasi yo'qolardi:
 * A filial direktori B filial xodimining parolini o'qiy olardi
 * (`migrate-director-full-access.seed.ts` dagi izoh — bu jonli bazada
 * HAQIQATAN yuz bergan).
 *
 * `OWNER_ONLY_PERMISSIONS` ro'yxati bor edi, lekin u faqat seed'da
 * ishlatilardi — ya'ni xatoni KEYIN tuzatardi, sodir bo'lishiga
 * to'smasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { assertOwnerOnlyKeysNotGranted } from '../dist/common/rbac/roles.helper.js';
import { OWNER_ONLY_PERMISSIONS } from '../dist/common/constants/permission-scope.js';
import { COIN_OWNER_ONLY_PERMISSIONS } from '../dist/common/constants/coin.js';

const R = { pass: 0, fail: 0, notes: [] };
const check = (n, cond, d = 'shart bajarilmadi') => {
  if (cond) { R.pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${n}`); }
  else { R.fail += 1; R.notes.push(`${n} — ${d}`); console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`); }
};

const ALL = [...OWNER_ONLY_PERMISSIONS, ...COIN_OWNER_ONLY_PERMISSIONS];
const rejects = (roleValue, keys) => {
  try { assertOwnerOnlyKeysNotGranted(roleValue, keys, ALL); return false; }
  catch { return true; }
};

console.log('\n\x1b[1mOWNER-ONLY KALITLAR — YOZISH HIMOYASI\x1b[0m\n');

console.log('\x1b[1m1) Filial devori — asosiy kalit\x1b[0m');
check(
  '`branches.view_all` owner-only ro\'yxatida',
  ALL.includes('branches.view_all'),
  'ro\'yxatdan chiqib ketgan — xodim barcha filialni ko\'ra boshlaydi',
);
check(
  'direktorga `branches.view_all` berib bo\'lmaydi',
  rejects('director', ['branches.view_all']),
);
check(
  'yangi custom rolga ham berib bo\'lmaydi (roleValue = null)',
  rejects(null, ['branches.view_all']),
);
check(
  '`system.admin_access` ham to\'siladi (u owner-ga tenglashtiradi)',
  rejects('director', ['system.admin_access']),
);

console.log('\n\x1b[1m2) HAR BIR owner-only kalit to\'siladi\x1b[0m');
let allBlocked = true;
for (const key of ALL) if (!rejects('director', [key])) { allBlocked = false; console.log(`      o'tib ketdi: ${key}`); }
check(`${ALL.length} ta kalitning HAMMASI to'sildi`, allBlocked);

console.log('\n\x1b[1m3) Oddiy ruxsatlar o\'tadi\x1b[0m');
check(
  'filial ichidagi kalitlar to\'silmaydi',
  !rejects('director', ['students.create', 'attendance.record', 'finance.read']),
);
check('bo\'sh ro\'yxat o\'tadi', !rejects('director', []));
check(
  'aralash ro\'yxatda faqat owner-only bo\'lsa ham RAD etiladi',
  rejects('director', ['students.create', 'branches.view_all']),
);

console.log('\n\x1b[1m4) `owner` rolining o\'zi mustasno\x1b[0m');
// `permissions.seed.ts` owner roliga BARCHA kalitni biriktiradi va uni
// har seedda qayta yozadi — blanket taqiq o'sha seedni yiqitardi.
check('owner roliga hamma kalit beriladi', !rejects('owner', ALL));

console.log(
  `\n\x1b[1mNATIJA:\x1b[0m ${R.fail ? '\x1b[31m' : '\x1b[32m'}${R.pass} o'tdi\x1b[0m, ${R.fail} yiqildi\n`,
);
if (R.fail) { for (const n of R.notes) console.log(`  • ${n}`); process.exit(1); }
