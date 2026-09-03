/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ISH MAKONI QARORI — `/owner` va `/org` o'rtasidagi devor.
 *
 * ── SAVOL ──
 * "Filialli tarifdagi ega HAR DOIM `/org` ga tushadimi, filialsizda esa
 *  HAR DOIM `/owner` ga? Va bu ikki qoida bir-birini yeb, cheksiz
 *  yo'naltirish halqasini yasamaydimi?"
 *
 * Halqa aynan shu yerda tug'iladi: ikki qo'riqchi bir-biriga qarama-qarshi
 * javob bersa, brauzer `/owner` ↔ `/org` orasida abadiy sakraydi va
 * WebKit'da bu `SecurityError` bilan tugaydi. Qoida sof funksiya bo'lgani
 * uchun buni bazasiz, brauzersiz tekshirish mumkin.
 *
 * ⚠ IMPORT `src/` DAN, `dist/` DAN EMAS. Node 24 tiplarni o'zi olib
 * tashlaydi, `dist/` esa eskirgan bo'lishi mumkin — o'shanda test eski
 * qoidani tekshirib, yashil bo'lib turaverardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import {
  WORKSPACES,
  hasOrgAuthority,
  resolveWorkspace,
} from '../src/common/workspaces/workspace-resolve.ts';

const R = { pass: 0, fail: 0, notes: [] };
const check = (n, cond, d = 'shart bajarilmadi') => {
  if (cond) { R.pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${n}`); }
  else { R.fail += 1; R.notes.push(`${n} — ${d}`); console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`); }
};

const ORG_PERMS = ['branches.view_all', 'system.admin_access'];
const ws = (roleType, permissions, branchesEnabled) =>
  resolveWorkspace({ roleType, permissions, branchesEnabled });

console.log('\n\x1b[1mISH MAKONI QARORI\x1b[0m\n');

// ── 1. EGA ────────────────────────────────────────────────────────────────
console.log('\x1b[1m1) Ega — tarifga qarab ajraladi\x1b[0m');

check(
  'filialli tarifda ega SUPER_ADMIN makonida',
  ws('owner', ['*'], true).workspace === WORKSPACES.SUPER_ADMIN,
);
check('filialli tarifda eganing uyi /org', ws('owner', ['*'], true).home === '/org');
check(
  'filialsiz tarifda ega ADMIN makonida',
  ws('owner', ['*'], false).workspace === WORKSPACES.ADMIN,
);
check(
  'filialsiz tarifda eganing uyi /owner/dashboard',
  ws('owner', ['*'], false).home === '/owner/dashboard',
);

// ── 2. HALQA ──────────────────────────────────────────────────────────────
console.log('\n\x1b[1m2) Yo\'naltirish halqasi yo\'q\x1b[0m');

// Qo'riqchilar mantig'ining nusxasi. Ular AYNAN shu shartlar bilan
// yozilgan (`SuperAdminGuard`, `AdminPanelGuard`).
const superAdminGuardAllows = (roleType, branchesEnabled) =>
  branchesEnabled && roleType === 'owner';
const adminPanelGuardAllows = (roleType, branchesEnabled) =>
  roleType !== 'student' && roleType !== 'teacher' &&
  !(branchesEnabled && roleType === 'owner');

for (const branchesEnabled of [true, false]) {
  for (const roleType of ['owner', 'staff', 'teacher', 'student']) {
    const { home } = ws(roleType, ORG_PERMS, branchesEnabled);
    // Uy sahifasi — odam O'SHA yerda qolishi kerak bo'lgan joy. Agar uni
    // qo'riqlaydigan qo'riqchi qaytarsa, halqa boshlanadi.
    const stays =
      home === '/org'
        ? superAdminGuardAllows(roleType, branchesEnabled)
        : home === '/owner/dashboard'
          ? adminPanelGuardAllows(roleType, branchesEnabled)
          : true; // /work, /me — bu qo'riqchilar ostida emas
    check(
      `${roleType} (filiallar ${branchesEnabled ? 'yoqiq' : "o'chiq"}) uyida QOLADI: ${home}`,
      stays,
      'qo\'riqchi uyning o\'zidan quvib chiqaradi — halqa',
    );
  }
}

// ── 3. EGADAN BOSHQA HECH KIM /org ga tushmaydi ───────────────────────────
console.log('\n\x1b[1m3) /org — faqat eganing makoni\x1b[0m');

check(
  'tashkilot vakolatli xodim (buxgalter/direktor) ADMIN makonida',
  ws('staff', ORG_PERMS, true).workspace === WORKSPACES.ADMIN,
  'org vakolati /org ni ochib yubordi',
);
check(
  'faqat admin_dashboard.read bo\'lgan xodim ham ADMIN makonida',
  ws('staff', ['admin_dashboard.read'], true).workspace === WORKSPACES.ADMIN,
);
check(
  'ruxsatsiz xodim STAFF makonida',
  ws('staff', [], true).workspace === WORKSPACES.STAFF,
);
check(
  'o\'qituvchi — qancha ruxsat bo\'lsa ham STAFF',
  ws('teacher', ['*'], true).workspace === WORKSPACES.STAFF,
);
check(
  'o\'quvchi — STUDENT',
  ws('student', [], true).workspace === WORKSPACES.STUDENT,
);

// ── 4. hasOrgAuthority — ikkala kalit ham shart ───────────────────────────
console.log('\n\x1b[1m4) Tashkilot vakolati — ikkala kalit shart\x1b[0m');

check('ikkala kalit bor', hasOrgAuthority(ORG_PERMS));
check('faqat view_all — yetmaydi', !hasOrgAuthority(['branches.view_all']));
check('faqat admin_access — yetmaydi', !hasOrgAuthority(['system.admin_access']));
check('ega bypass ("*") — yetadi', hasOrgAuthority(['*']));

// ── 5. Noma'lum rol ──────────────────────────────────────────────────────
console.log('\n\x1b[1m5) Noma\'lum kirish — YOPIQ tomonga yiqiladi\x1b[0m');

check(
  'roleType null — STAFF (eng kam huquqli ish makoni)',
  ws(null, [], true).workspace === WORKSPACES.STAFF,
);
check(
  'yangi custom rol nomi — ruxsatiga qarab hal qilinadi, nomiga emas',
  ws('buxgalter', ['admin_dashboard.read'], true).workspace === WORKSPACES.ADMIN,
);

console.log(
  `\n\x1b[1mNATIJA:\x1b[0m ${R.fail ? '\x1b[31m' : '\x1b[32m'}${R.pass} o'tdi\x1b[0m, ${R.fail} yiqildi\n`,
);
if (R.fail) {
  for (const n of R.notes) console.log(`  • ${n}`);
  process.exit(1);
}
