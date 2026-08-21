/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TA'LIM YORDAMCHILARI — FUNKSIYA DARAJASIDAGI PARITET.
 *
 * Express `helpers/*.js` ↔ NestJS `dist/common/**` — AYNI kirish,
 * AYNI chiqish.
 *
 * ── NEGA HTTP EMAS ──
 * Bu funksiyalar SANA va JADVAL semantikasini belgilaydi: `dateKey`,
 * mahalliy kun, jadval versiyasi, a'zolik oynasi. Ular HTTP orqali
 * FAQAT BILVOSITA ko'rinadi — bir kunlik siljish ro'yxat javobida
 * umuman sezilmasligi, lekin maosh va qarz hisobini buzishi mumkin.
 *
 * To'g'ridan-to'g'ri solishtirish o'sha siljishni AYNAN topadi va
 * qaysi kirishda ekanini ko'rsatadi.
 *
 * ⚠ MUSBAT NAZORAT: har bo'limda kamida bitta NOTRIVIAL natija
 * (bo'sh massiv / null EMAS) bo'lishi TALAB qilinadi. Aks holda
 * ikkala tomon ham `[]` qaytarib "bir xil" bo'lardi va hech narsa
 * o'lchanmasdi.
 *
 * ⚠ NEGATIV NAZORAT: yakunda ataylab BUZILGAN nusxa solishtiriladi —
 * agar u ham "farq yo'q" desa, taqqoslagichning O'ZI ishlamayapti.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';

const EXP = '../../server_legacy/src/helpers';
const NEST = '../dist/common';

const [
  expAtt, expPeriod, expGroup,
  nestDate, nestAtt, nestPeriod, nestGroupState,
] = await Promise.all([
  import(`${EXP}/attendance.helper.js`),
  import(`${EXP}/period.helper.js`),
  import(`${EXP}/group.helper.js`),
  import(`${NEST}/utils/date.js`),
  import(`${NEST}/utils/attendance.js`),
  import(`${NEST}/utils/period.js`),
  import(`${NEST}/helpers/group-state.js`),
]);

let pass = 0, fail = 0;
const nontrivial = new Map();

const section = (n) => console.log(`\x1b[2m  ── ${n} ──\x1b[0m`);

/** Chiqishni solishtirish uchun barqaror shaklga keltiradi. */
const norm = (v) => JSON.parse(JSON.stringify(v ?? null));

/**
 * @param name    tekshiruv nomi
 * @param a       Express natijasi (yoki tashlangan xato)
 * @param b       NestJS natijasi
 * @param group   musbat nazorat guruhi
 * @param trivial natija "bo'sh" deb hisoblansinmi
 */
const same = (name, a, b, group, trivial = false) => {
  if (group && !trivial) nontrivial.set(group, (nontrivial.get(group) || 0) + 1);
  try {
    assert.deepEqual(norm(b), norm(a));
    pass += 1;
    console.log(`  ✅ ${name}`);
  } catch {
    fail += 1;
    console.log(
      `  ❌ ${name}\n      express: ${JSON.stringify(norm(a))}\n` +
      `      nest   : ${JSON.stringify(norm(b))}`,
    );
  }
};

/** Xato ham natija — xabari va statusi bilan solishtiriladi. */
const call = (fn) => {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, status: e?.statusCode ?? null, message: e?.message ?? String(e) };
  }
};

console.log('\n\x1b[1mTA\'LIM YORDAMCHILARI — FUNKSIYA PARITETI\x1b[0m\n');

// ═══════════════════ 1. SANA PRIMITIVLARI ═══════════════════
section('sana primitivlari');

const DATES = [
  '2026-01-01', '2026-02-28', '2026-02-29', '2026-12-31',
  '2026-07-15T23:30:00.000Z',   // mahalliy ertaga (UTC+5)
  '2026-07-15T18:59:59.000Z',   // mahalliy hali bugun
  '2026-07-15T19:00:00.000Z',   // mahalliy AYNAN ertaga chegarasi
  '2026-02-31',                 // toshib ketgan — null bo'lishi kerak
  'not-a-date',
  new Date(Date.UTC(2026, 6, 15, 0, 0, 0)).toISOString(),
];

for (const d of DATES) {
  same(`dateKeyOf(${d})`, expAtt.dateKeyOf(d), nestDate.dateKeyOf(d),
    'sana', String(expAtt.dateKeyOf(d)) === 'null');
  same(`parseLocalDay(${d})`, expAtt.parseLocalDay(d), nestDate.parseLocalDay(d),
    'sana', expAtt.parseLocalDay(d) === null);
  same(`parseLocalDayKey(${d})`, expAtt.parseLocalDayKey(d),
    nestDate.parseLocalDayKey(d), 'sana', expAtt.parseLocalDayKey(d) === null);
}
for (const d of DATES.filter((x) => x !== 'not-a-date' && x !== '2026-02-31')) {
  same(`dayOfWeekOf(${d})`, expAtt.dayOfWeekOf(d), nestDate.dayOfWeekOf(d), 'sana');
  same(`toUtcMidnight(${d})`, expAtt.toUtcMidnight(d), nestDate.toUtcMidnight(d), 'sana');
}

// `now` ni ochiq beramiz — soatga bog'liq bo'lmasin.
const NOWS = [
  new Date('2026-07-15T00:30:00.000Z'), // mahalliy 05:30 — o'sha kun
  new Date('2026-07-15T18:30:00.000Z'), // mahalliy 23:30 — hali o'sha kun
  new Date('2026-07-15T19:30:00.000Z'), // mahalliy 00:30 — ERTASI kun
];
for (const now of NOWS) {
  same(`localTodayMidnight(${now.toISOString()})`,
    expAtt.localTodayMidnight(now), nestDate.localTodayMidnight(now), 'sana');
  same(`localTodayKey(${now.toISOString()})`,
    expAtt.localTodayKey(now), nestDate.localTodayKey(now), 'sana');
  same(`localDayOfWeek(${now.toISOString()})`,
    expAtt.localDayOfWeek(now), nestDate.localDayOfWeek(now), 'sana');
  for (const d of ['2026-07-14', '2026-07-15', '2026-07-16']) {
    same(`isFutureLocalDay(${d}, ${now.toISOString()})`,
      expAtt.isFutureLocalDay(d, now), nestDate.isFutureLocalDay(d, now), 'sana');
  }
}
same('TZ_OFFSET_MIN', expAtt.TZ_OFFSET_MIN, nestDate.TZ_OFFSET_MIN, 'sana');

// ═══════════════════ 2. JADVAL VERSIYALASH ═══════════════════
section('jadval versiyalash (scheduleActiveOn)');

const S = (day, startTime, endTime, effectiveFrom = null) =>
  ({ day, startTime, endTime, effectiveFrom });

const SCHEDULES = [
  [],
  [S('mon', '10:00', '12:00')],
  // Ikki versiya: eskisi boshidan, yangisi 2026-07-01 dan.
  [
    S('mon', '10:00', '12:00'),
    S('wed', '10:00', '12:00'),
    S('mon', '14:00', '16:00', '2026-07-01'),
  ],
  // ⚠ ENG MUHIM HOLAT: yangi versiyada `wed` OLIB TASHLANGAN.
  // Snapshot semantikasi bo'lsa u YO'QOLADI; har-kun fallback bo'lsa
  // eski `wed` TIRILIB qolardi.
  [
    S('mon', '10:00', '12:00', '2026-01-01'),
    S('wed', '10:00', '12:00', '2026-01-01'),
    S('mon', '10:00', '12:00', '2026-07-01'),
  ],
  // Kelajakdagi versiya — bugungi kunga TA'SIR QILMAYDI.
  [S('mon', '10:00', '12:00'), S('tue', '09:00', '11:00', '2099-01-01')],
  // Bir kunda ikki slot.
  [S('mon', '09:00', '10:30'), S('mon', '14:00', '15:30')],
];

const ON_DATES = ['2025-12-31', '2026-01-01', '2026-06-30', '2026-07-01', '2026-07-15', '2100-01-01'];

SCHEDULES.forEach((sch, i) => {
  for (const on of ON_DATES) {
    const a = expAtt.scheduleActiveOn(sch, on);
    const b = nestAtt.scheduleActiveOn(sch, on);
    same(`scheduleActiveOn(#${i}, ${on})`, a, b, 'jadval', a.length === 0);
  }
});

// ═══════════════════ 3. DARS KUNLARI ═══════════════════
section('dars kunlari (getClassDaysInRange)');

const GROUPS = [
  { schedule: SCHEDULES[1], startDate: null, endDate: null },
  { schedule: SCHEDULES[2], startDate: '2026-06-15', endDate: null },
  { schedule: SCHEDULES[3], startDate: '2026-01-01', endDate: null },
  { schedule: SCHEDULES[5], startDate: null, endDate: null },
  // ⚠ startDate diapazon ICHIDA — undan oldingi kunlar hisoblanmasin.
  { schedule: SCHEDULES[1], startDate: '2026-07-08', endDate: null },
];
const RANGES = [
  ['2026-06-25', '2026-07-10'],
  ['2026-07-01', '2026-07-31'],
  ['2026-07-15', '2026-07-15'],
  // Teskari diapazon — ikkala tomon ham bo'sh berishi kerak.
  ['2026-07-10', '2026-07-01'],
];
const HOLIDAYS = [null, new Set(['2026-07-06', '2026-07-13'])];

GROUPS.forEach((g, gi) => {
  RANGES.forEach(([from, to], ri) => {
    HOLIDAYS.forEach((hs, hi) => {
      const a = expAtt.getClassDaysInRange(g, from, to, hs);
      const b = nestAtt.getClassDaysInRange(g, from, to, hs);
      same(`getClassDaysInRange(g${gi}, r${ri}, h${hi}) → ${a.length} sessiya`,
        a, b, 'darslar', a.length === 0);
    });
  });
});

// ═══════════════════ 4. OZOD DAVRLARI ═══════════════════
section('ozod davrlari (isExemptOn / defaultStatusFor)');

const EXEMPTIONS = [
  [],
  [{ isActive: true, startDate: '2026-07-01', endDate: null }],
  [{ isActive: false, startDate: '2026-07-01', endDate: null }],
  [{ isActive: true, startDate: '2026-07-01', endDate: '2026-07-10' }],
  [{ isActive: true, startDate: '2026-07-01', endDate: null, daysOfWeek: ['mon'] }],
  [{ isActive: true, startDate: '2026-07-01', endDate: null, daysOfWeek: [] }],
];
EXEMPTIONS.forEach((ex, i) => {
  for (const d of ['2026-06-30', '2026-07-01', '2026-07-10', '2026-07-11', '2026-07-13']) {
    const dow = expAtt.dayOfWeekOf(d);
    const a = expAtt.isExemptOn(ex, d, dow);
    same(`isExemptOn(#${i}, ${d})`, a, nestAtt.isExemptOn(ex, d, dow), 'ozod', a === false);
    same(`defaultStatusFor(#${i}, ${d})`,
      expAtt.defaultStatusFor(ex, d, dow),
      nestAtt.defaultStatusFor(ex, d, dow), 'ozod', a === false);
  }
});

// ═══════════════════ 5. KURS CHEGARALARI ═══════════════════
section('kurs chegaralari (withinCourseBounds / isHolidayOn)');

const BOUND_GROUPS = [
  {},
  { startDate: '2026-07-01' },
  { endDate: '2026-07-20' },
  { startDate: '2026-07-01', endDate: '2026-07-20' },
];
BOUND_GROUPS.forEach((g, i) => {
  for (const d of ['2026-06-30', '2026-07-01', '2026-07-20', '2026-07-21']) {
    const a = expAtt.withinCourseBounds(g, d);
    same(`withinCourseBounds(#${i}, ${d})`, a, nestAtt.withinCourseBounds(g, d),
      'chegara', a === false);
  }
});
const HS = new Set(['2026-07-06']);
for (const d of ['2026-07-06', '2026-07-07']) {
  const a = expAtt.isHolidayOn(HS, d);
  same(`isHolidayOn(${d})`, a, nestAtt.isHolidayOn(HS, d), 'chegara', a === false);
}

// ═══════════════════ 6. DAVR INVARIANTLARI ═══════════════════
section('davr invariantlari (period.helper)');

same('monthToIndex(2026, 7)', expPeriod.monthToIndex(2026, 7),
  nestPeriod.monthToIndex(2026, 7), 'davr');
same('indexToMonth(24318)', expPeriod.indexToMonth(24318),
  nestPeriod.indexToMonth(24318), 'davr');
same('monthsInRange(2026,5,2026,9)', expPeriod.monthsInRange(2026, 5, 2026, 9),
  nestPeriod.monthsInRange(2026, 5, 2026, 9), 'davr');

// ── "month" granularligi (INCLUSIVE) ──
const MONTH_EXISTING = [
  { startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 6 },
  { startYear: 2026, startMonth: 9, endYear: null, endMonth: null },
];
const MONTH_CANDIDATES = [
  { startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 8 },   // toza
  { startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 8 },   // kesishadi
  { startYear: 2026, startMonth: 10, endYear: null, endMonth: null },// ikkinchi ochiq
  { startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 7 },   // teskari
];
MONTH_CANDIDATES.forEach((c, i) => {
  const a = call(() => expPeriod.assertPeriodInvariants(c, MONTH_EXISTING, 'month'));
  const b = call(() => nestPeriod.assertPeriodInvariants(c, MONTH_EXISTING, 'month'));
  same(`assertPeriodInvariants(month, #${i})`, a, b, 'davr');
});

// ── "date" granularligi (HALF-OPEN) ──
//
// ⚠ AYNAN SHU YERDA `[start, end)` semantikasi sinaladi: 2026-07-01 da
// TUGAGAN davr bilan AYNAN 2026-07-01 da BOSHLANADIGAN davr
// KESISHMAYDI. Inclusive bo'lsa u rad etilardi va o'quvchini chiqqan
// kuni boshqa guruhga qo'shib bo'lmasdi.
const DATE_EXISTING = [
  { startDate: '2026-01-01', endDate: '2026-07-01' },
  { startDate: '2026-09-01', endDate: null },
];
const DATE_CANDIDATES = [
  { startDate: '2026-07-01', endDate: '2026-08-01' },  // chegarada — TOZA
  { startDate: '2026-06-30', endDate: '2026-08-01' },  // kesishadi
  { startDate: '2026-10-01', endDate: null },          // ikkinchi ochiq
  { startDate: '2026-08-01', endDate: '2026-07-01' },  // teskari
  { startDate: '2026-08-01', endDate: '2026-09-01' },  // ochiq davrga tegib turadi
];
DATE_CANDIDATES.forEach((c, i) => {
  const a = call(() => expPeriod.assertPeriodInvariants(c, DATE_EXISTING, 'date'));
  const b = call(() => nestPeriod.assertPeriodInvariants(c, DATE_EXISTING, 'date'));
  same(`assertPeriodInvariants(date, #${i})`, a, b, 'davr');
});

same('findPeriodForMonth(2026, 3)',
  expPeriod.findPeriodForMonth(MONTH_EXISTING, 2026, 3),
  nestPeriod.findPeriodForMonth(MONTH_EXISTING, 2026, 3), 'davr');
same('findPeriodForMonth(2026, 7) → null',
  expPeriod.findPeriodForMonth(MONTH_EXISTING, 2026, 7),
  nestPeriod.findPeriodForMonth(MONTH_EXISTING, 2026, 7), 'davr', true);
for (const d of ['2026-03-01', '2026-07-01', '2026-10-01']) {
  const a = expPeriod.findPeriodForDate(DATE_EXISTING, d);
  same(`findPeriodForDate(${d})`, a,
    nestPeriod.findPeriodForDate(DATE_EXISTING, d), 'davr', a === null);
}

// ═══════════════════ 7. GURUH HOLATI ═══════════════════
section('guruh holati (assertGroupActive)');

const GROUP_STATES = [
  null,
  { isDeleted: true, isActive: true },
  { isActive: true, endDate: null },
  { isActive: false, endDate: null },
  { isActive: true, endDate: '2099-01-01' },
  { isActive: true, endDate: '2000-01-01' },   // sana o'tgan — job hali yangilamagan
];
GROUP_STATES.forEach((g, i) => {
  const a = call(() => expGroup.assertGroupActive(g));
  const b = call(() => nestGroupState.assertGroupActive(g));
  same(`assertGroupActive(#${i})`, a, b, 'guruh');
});

// ═══════════════════ MUSBAT NAZORAT ═══════════════════
section('musbat nazorat');

const REQUIRED = ['sana', 'jadval', 'darslar', 'ozod', 'chegara', 'davr', 'guruh'];
for (const g of REQUIRED) {
  const n = nontrivial.get(g) || 0;
  if (n > 0) {
    pass += 1;
    console.log(`  ✅ "${g}" — ${n} ta NOTRIVIAL natija o'lchandi`);
  } else {
    fail += 1;
    console.log(
      `  ❌ "${g}" — NOTRIVIAL natija YO'Q.\n` +
      "      Hamma natija bo'sh/null bo'lsa ikkala tomon ham \"bir xil\"\n" +
      '      bo\'lardi va bu bo\'lim hech narsani isbotlamasdi.',
    );
  }
}

// ═══════════════════ NEGATIV NAZORAT ═══════════════════
//
// ⚠ TAQQOSLAGICHNING O'ZINI SINAYMIZ. Ataylab BUZILGAN natija
// solishtiriladi; `same()` uni TOPISHI shart. Topmasa — yuqoridagi
// 200+ yashil belgi hech narsani anglatmasdi.
section('negativ nazorat (taqqoslagich ishlaydimi)');

{
  const before = fail;
  // Bir kunlik siljish — aynan shu turdagi xato eng xavfli.
  const broken = expAtt.dateKeyOf('2026-07-16');
  same('ATAYLAB BUZILGAN: dateKey bir kun siljitilgan',
    expAtt.dateKeyOf('2026-07-15'), broken, null);
  if (fail === before + 1) {
    fail -= 1; pass += 1;
    console.log('  ✅ taqqoslagich siljishni TOPDI (kutilgan xato)');
  } else {
    fail += 1;
    console.log('  ❌ taqqoslagich siljishni TOPMADI — barcha yashil natija SHUBHALI');
  }
}

console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
process.exit(fail ? 1 : 0);
