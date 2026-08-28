/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL CHEGARASI — HISOBLASH QOIDASI (Developer Admin tomoni).
 *
 * ── SAVOL ──
 * "Mijoz 5 ta filialli tarifda turib, +1 paket sotib oldi. Panelda 6
 *  ko'rinadimi, tenant server ham 6 ni majburlaydimi va shu ikki raqam
 *  bir-biridan ajralib ketmasligiga ishonchim komilmi?"
 *
 * Chegara TO'RT manbadan yig'iladi (qo'lda qo'yilgan qiymat, tarif, tizim
 * standarti, sotib olingan paketlar) va ustiga "yakka markaz" rejimi
 * tushadi. Bu — pul bilan bog'liq qoida: bitta noto'g'ri ustunlik tartibi
 * yo mijozni to'lagan filialidan mahrum qiladi, yo bizni bepul filial
 * tarqatishga majbur qiladi.
 *
 * BAZA HAM, HTTP HAM KERAK EMAS — sof funksiya tekshiriladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import {
  DEFAULT_BRANCH_LIMIT,
  SINGLE_CENTER_BRANCH_LIMIT,
  UNLIMITED,
  branchUsage,
  resolveBranchLimit,
} from '../dist/branch-config/branch-config.constants.js';

const R = { pass: 0, fail: 0, notes: [] };
const check = (n, cond, d = 'shart bajarilmadi') => {
  if (cond) { R.pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${n}`); }
  else { R.fail += 1; R.notes.push(`${n} — ${d}`); console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`); }
};

const on = (extra = {}) => resolveBranchLimit({ branchesEnabled: true, ...extra });

console.log('\n\x1b[1mFILIAL CHEGARASI — HISOBLASH QOIDASI\x1b[0m');

// ── 1) Standart ──
console.log('\n\x1b[1m1) Standart holat\x1b[0m');

check(
  `tarifsiz va sozlamasiz loyiha standartni oladi (${DEFAULT_BRANCH_LIMIT})`,
  on().limit === DEFAULT_BRANCH_LIMIT,
  `olindi: ${on().limit}`,
);
check(
  'manbasi "default" deb belgilanadi',
  on().source === 'default',
  `olindi: ${on().source}`,
);
check(
  "standart 5 — yangi loyiha aynan shundan boshlaydi",
  DEFAULT_BRANCH_LIMIT === 5,
  `DEFAULT_BRANCH_LIMIT=${DEFAULT_BRANCH_LIMIT} (.env dagi DEFAULT_BRANCH_LIMIT o'zgartirilganmi?)`,
);

// ── 2) Ustunlik tartibi ──
console.log('\n\x1b[1m2) Ustunlik tartibi\x1b[0m');

check(
  'tarif standartdan ustun',
  on({ planLimit: 15 }).limit === 15,
);
check(
  'qo\'lda qo\'yilgan qiymat tarifdan ustun',
  on({ planLimit: 15, override: 3 }).limit === 3,
  'aks holda Developer Admin chegarani pasaytira olmasdi',
);
check(
  'manbasi "override" deb belgilanadi',
  on({ planLimit: 15, override: 3 }).source === 'override',
);
check(
  'override olib tashlansa (null) tarifga qaytadi',
  on({ planLimit: 15, override: null }).limit === 15,
  "null = 'meros' — bu TenantSetting bilan bir xil qoida",
);
check(
  "buzuq override (0) e'tiborga olinmaydi",
  on({ planLimit: 15, override: 0 }).limit === 15,
  '0 "filial umuman ochilmasin" degani bo\'lib qolardi',
);

// ── 3) Pullik kengaytma ──
console.log('\n\x1b[1m3) Sotib olingan filiallar (add-on)\x1b[0m');

check(
  '5 + 1 paket = 6',
  on({ planLimit: 5, addonBonus: 1 }).limit === 6,
);
check(
  '5 + 5 paket = 10',
  on({ planLimit: 5, addonBonus: 5 }).limit === 10,
);
check(
  'paketlar birga qo\'shiladi (5 + 1 + 5 = 11)',
  on({ planLimit: 5, addonBonus: 6 }).limit === 11,
);
check(
  'asos va bonus ALOHIDA qaytadi (panel "5 + 1" deb chizadi)',
  on({ planLimit: 5, addonBonus: 1 }).base === 5 &&
    on({ planLimit: 5, addonBonus: 1 }).addonBonus === 1,
);
check(
  'qo\'lda qo\'yilgan qiymatga ham paket qo\'shiladi (3 + 2 = 5)',
  on({ override: 3, planLimit: 20, addonBonus: 2 }).limit === 5,
);

// ── 4) Cheksiz ──
console.log('\n\x1b[1m4) Cheksiz tarif\x1b[0m');

check(
  'cheksiz tarif cheksizligicha qoladi',
  on({ planLimit: UNLIMITED }).limit === UNLIMITED,
);
check(
  '⚠ CHEKSIZGA PAKET QO\'SHILMAYDI (-1 + 5 = 4 bo\'lib qolardi)',
  on({ planLimit: UNLIMITED, addonBonus: 5 }).limit === UNLIMITED,
  'bu cheksiz loyihani jimgina 4 ta filialga qisib qo\'yardi',
);
check(
  'cheksiz bayrog\'i qo\'yiladi',
  on({ planLimit: UNLIMITED }).unlimited === true,
);

// ── 5) Yakka markaz ──
console.log('\n\x1b[1m5) Yakka markaz rejimi\x1b[0m');

const single = resolveBranchLimit({ branchesEnabled: false, planLimit: 50, addonBonus: 10 });

check(
  `rejim o'chirilsa chegara doim ${SINGLE_CENTER_BRANCH_LIMIT} ta`,
  single.limit === SINGLE_CENTER_BRANCH_LIMIT,
  `olindi: ${single.limit}`,
);
check(
  '⚠ tarif ham, sotib olingan paket ham buni KO\'TARA OLMAYDI',
  single.addonBonus === 0 && single.base === SINGLE_CENTER_BRANCH_LIMIT,
  "yakka markaz — rejim qarori, savdo qarori emas",
);
check(
  'manbasi "single-center" deb belgilanadi',
  single.source === 'single-center',
);
check(
  "o'chirilgan rejimda cheksiz tarif ham 1 ta beradi",
  resolveBranchLimit({ branchesEnabled: false, planLimit: UNLIMITED }).limit === 1,
);

// ── 6) Foydalanish ko'rinishi ──
console.log('\n\x1b[1m6) "Used / Limit / Remaining"\x1b[0m');

const u = branchUsage(3, 5);
check('Used: 3', u.used === 3);
check('Limit: 5', u.limit === 5);
check('Remaining: 2', u.remaining === 2);
check('chegaraga yetmagan', u.limitReached === false);

const full = branchUsage(5, 5);
check(
  '⚠ 5/5 da chegara YETILGAN deb hisoblanadi (`>=`)',
  full.limitReached === true,
  'tekshiruv YANGI filial ochishdan OLDIN bo\'ladi — 5/5 da yana bittasi sig\'maydi',
);
check('to\'lgan holatda remaining 0', full.remaining === 0);

const over = branchUsage(8, 5);
check(
  'chegaradan oshib ketgan loyihada remaining manfiy EMAS',
  over.remaining === 0,
  'migratsiyadan keyin mavjud loyihada 8/5 bo\'lishi mumkin',
);
check('oshib ketgan loyiha ham "yetilgan"', over.limitReached === true);

const inf = branchUsage(120, UNLIMITED);
check('cheksizda chegara yetilmaydi', inf.limitReached === false);
check('cheksizda remaining null (raqam emas)', inf.remaining === null);

console.log(
  `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
    `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : '0 yiqildi'}`,
);
if (R.fail) {
  console.log('\nYiqilganlar:');
  R.notes.forEach((n) => console.log(`  • ${n}`));
  process.exit(1);
}
