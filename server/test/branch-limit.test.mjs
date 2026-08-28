/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL CHEGARASINI MAJBURLASH — tenant tomoni.
 *
 * ── SAVOL ──
 * "Mijoz 5 ta filial ochib bo'ldi. `POST /branches` ga to'g'ridan-to'g'ri
 *  (frontendsiz) murojaat qilsa oltinchi filial ochilib ketmasligiga
 *  ishonchim komilmi? Va server hozirgina qayta ishga tushgan, ya'ni
 *  heartbeat hali kelmagan bo'lsa-chi?"
 *
 * Ikkinchi savol muhimroq: tarif keshi (`EntitlementsService`) ATAYLAB
 * OCHIQ yiqiladi — kelmagan limit "cheksiz" deb o'qiladi. Filial uchun bu
 * har restartdan keyingi ~15 daqiqalik ochiq eshik bo'lardi. Shuning
 * uchun `.env` dagi qiymat zaxira sifatida turadi va quyidagi 2-bo'lim
 * aynan shuni tekshiradi.
 *
 * BAZA HAM, HTTP HAM KERAK EMAS — sof funksiyalar tekshiriladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import {
  BRANCH_LIMIT_REACHED,
  SINGLE_CENTER_BRANCH_LIMIT,
  UNLIMITED,
  evaluateBranchCreation,
  resolveEffectiveBranchConfig,
} from '../dist/common/entitlements/branch-limit.js';

const R = { pass: 0, fail: 0, notes: [] };
const check = (n, cond, d = 'shart bajarilmadi') => {
  if (cond) { R.pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${n}`); }
  else { R.fail += 1; R.notes.push(`${n} — ${d}`); console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`); }
};

/** `.env` standart holati: rejim yoqilgan, chegara 5. */
const env = (extra = {}) => ({
  envBranchesEnabled: true,
  envLimit: 5,
  ...extra,
});

const create = (used, cfg) =>
  evaluateBranchCreation({ used, limit: cfg.limit, branchesEnabled: cfg.branchesEnabled });

console.log('\n\x1b[1mFILIAL CHEGARASINI MAJBURLASH (tenant)\x1b[0m');

// ── 1) Heartbeat qiymati ustun ──
console.log('\n\x1b[1m1) Tirik qiymat (heartbeat) ustun\x1b[0m');

const live = resolveEffectiveBranchConfig(
  env({ entitlementLimit: 10, entitlementBranchesEnabled: true }),
);
check(
  'heartbeat 10 desa, .env dagi 5 emas 10 amal qiladi',
  live.limit === 10,
  `olindi: ${live.limit}`,
);
check('manba "heartbeat" deb belgilanadi', live.source === 'heartbeat');
check(
  'chegara oshirilgach restart KUTILMAYDI',
  live.limit === 10,
  'admin panelda +5 bosilsa, keyingi heartbeat (15 daq) buni yetkazadi',
);

// ── 2) Heartbeat kelmagan — .env zaxirasi ──
console.log('\n\x1b[1m2) ⚠ Heartbeat hali kelmagan (server yangi ko\'tarilgan)\x1b[0m');

const cold = resolveEffectiveBranchConfig(env());
check(
  'kesh bo\'sh bo\'lsa .env dagi chegara amal qiladi',
  cold.limit === 5,
  `olindi: ${cold.limit} — bu 15 daqiqalik "cheksiz filial" oynasi bo'lardi`,
);
check('manba "env" deb belgilanadi', cold.source === 'env');
check(
  'bo\'sh kesh bilan ham 5/5 da to\'siladi',
  create(5, cold).allowed === false,
  "aynan shu holat aslida OCHIQ ESHIK edi",
);
check(
  'buzuq heartbeat qiymati (0) e\'tiborga olinmaydi — .env ga qaytadi',
  resolveEffectiveBranchConfig(
    env({ entitlementLimit: 0, entitlementBranchesEnabled: true }),
  ).limit === 5,
);
check(
  'rejim bayrog\'i kelmasa heartbeat chegarasi ham QABUL QILINMAYDI',
  resolveEffectiveBranchConfig(env({ entitlementLimit: 99 })).limit === 5,
  'rejim va chegara BIRGA olinadi — aks holda ular ajralib ketardi',
);

// ── 3) To'sish qoidasi ──
console.log('\n\x1b[1m3) Yangi filial ochish qoidasi\x1b[0m');

const five = resolveEffectiveBranchConfig(env());

check('0/5 — ruxsat', create(0, five).allowed === true);
check('3/5 — ruxsat', create(3, five).allowed === true);
check('4/5 — ruxsat (oxirgisi)', create(4, five).allowed === true);
check(
  '⚠ 5/5 — RAD ETILADI (`>=`, yozuvdan OLDIN tekshiriladi)',
  create(5, five).allowed === false,
);
check(
  'rad etilganda kod aynan BRANCH_LIMIT_REACHED',
  create(5, five).code === BRANCH_LIMIT_REACHED,
  `olindi: ${create(5, five).code} — frontend AYNAN shu satrga qaraydi`,
);
check(
  'ruxsat berilganda kod yo\'q',
  create(3, five).code === null,
);
check(
  'xabar mijozga tarifni kengaytirishni aytadi',
  /tarif/i.test(create(5, five).message || ''),
  `xabar: ${create(5, five).message}`,
);
check('3/5 da remaining 2', create(3, five).remaining === 2);

// ── 4) Chegaradan oshib ketgan mavjud loyiha ──
console.log('\n\x1b[1m4) ⚠ Migratsiyadan oldin ochilgan ortiqcha filiallar\x1b[0m');

const over = create(8, five);
check(
  '8 ta filiali bor loyihada yangisi RAD ETILADI',
  over.allowed === false,
);
check(
  'mavjud 8 tasiga TEGILMAYDI (funksiya hech narsa o\'chirmaydi)',
  over.used === 8,
  "migratsiya to'lagan mijozning ishlayotgan filialini o'chirmasligi kerak",
);
check('remaining manfiy emas', over.remaining === 0);

// ── 5) Yakka markaz ──
console.log('\n\x1b[1m5) Yakka markaz rejimi\x1b[0m');

const single = resolveEffectiveBranchConfig(
  env({ entitlementLimit: 50, entitlementBranchesEnabled: false }),
);
check(
  `rejim o'chiq bo'lsa chegara ${SINGLE_CENTER_BRANCH_LIMIT} ta — tarif nima deyishidan qat'i nazar`,
  single.limit === SINGLE_CENTER_BRANCH_LIMIT,
  `olindi: ${single.limit}`,
);
check('birinchi filial ochiladi', create(0, single).allowed === true);
check('ikkinchisi rad etiladi', create(1, single).allowed === false);
check(
  '⚠ XABAR BOSHQACHA: tarifni oshirish yordam BERMAYDI',
  !/tarif/i.test(create(1, single).message || ''),
  `xabar: ${create(1, single).message} — mijozni foydasiz xaridga undamaslik kerak`,
);
check(
  '.env orqali ham yakka markaz bo\'la oladi',
  resolveEffectiveBranchConfig(env({ envBranchesEnabled: false })).limit === 1,
);

// ── 6) Cheksiz ──
console.log('\n\x1b[1m6) Cheksiz tarif\x1b[0m');

const inf = resolveEffectiveBranchConfig(
  env({ entitlementLimit: UNLIMITED, entitlementBranchesEnabled: true }),
);
check('cheksiz tarif o\'tadi', inf.limit === UNLIMITED);
check('1000 ta filialda ham ruxsat', create(1000, inf).allowed === true);
check('cheksizda remaining null', create(1000, inf).remaining === null);
check(
  '.env dagi -1 ham cheksiz deb o\'qiladi',
  resolveEffectiveBranchConfig(env({ envLimit: -1 })).limit === UNLIMITED,
);

console.log(
  `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
    `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : '0 yiqildi'}`,
);
if (R.fail) {
  console.log('\nYiqilganlar:');
  R.notes.forEach((n) => console.log(`  • ${n}`));
  process.exit(1);
}
