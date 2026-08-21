/**
 * PARITET GARNIZONI — Express (5000) ↔ NestJS (5001).
 *
 * Ko'chirilgan har bir endpoint uchun IKKALA stekka bir xil so'rov
 * yuboradi va farqni ko'rsatadi:
 *   • HTTP status
 *   • javob tanasi (chuqur solishtiruv)
 *   • muhim sarlavhalar (content-type, set-cookie shakli)
 *   • xato tuzilmasi ({ success, message, code, details })
 *
 * ⚠ MUSBAT NAZORAT: agar BIRORTA endpoint tekshirilmasa yoki steklardan
 * biri javob bermasa — bu MUVAFFAQIYAT emas, XATO. Bo'sh tekshiruv
 * "hammasi bir xil" degan yolg'on natija berardi.
 *
 * BEQAROR MAYDONLAR (`VOLATILE`) solishtiruvdan chiqariladi: token,
 * vaqt tamg'asi, latency. Ular har chaqiruvda boshqacha bo'ladi va
 * ularni solishtirish shovqindan boshqa narsa bermaydi.
 *
 * ISHLATISH:  node test/parity.mjs [--token <accessToken>]
 */
const EXPRESS = process.env.EXPRESS_URL || 'http://127.0.0.1:5000';
const NEST = process.env.NEST_URL || 'http://127.0.0.1:5001';

const argv = process.argv.slice(2);
const tokenArg = argv.indexOf('--token');
const TOKEN = tokenArg >= 0 ? argv[tokenArg + 1] : process.env.PARITY_TOKEN || null;

/** Har chaqiruvda o'zgaradigan maydonlar — solishtirilmaydi. */
const VOLATILE = new Set([
  'accessToken', 'refreshToken', 'token', 'latencyMs', 'iat', 'exp',
  'createdAt', 'updatedAt', 'lastLoginAt', 'stack', 'expiresAt',
]);

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (VOLATILE.has(k)) continue;
      out[k] = strip(val);
    }
    return out;
  }
  return v;
};

/**
 * KO'CHIRILGAN ENDPOINTLAR RO'YXATI.
 *
 * Har bir modul ko'chirilganda shu yerga qo'shiladi. `auth: true`
 * bo'lsa so'rovga `--token` qo'shiladi.
 */
const CASES = [
  { name: 'health', method: 'GET', path: '/api/health' },
  { name: 'health/db', method: 'GET', path: '/api/health/db',
    // NestJS'da qo'shimcha diagnostika bor; Express'da bu manzil YO'Q.
    // Faza 2.3 gacha ataylab solishtirilmaydi.
    skip: 'NestJS-only diagnostika manzili' },
  // ── Faza 2.2: ko'chirilgan marshrutlar ──
  { name: 'roles (list)', method: 'GET', path: '/api/roles', auth: true },
  // ── Faza 2.4: matritsa (`/:value` DAN OLDIN turishi shart) ──
  { name: 'roles/matrix', method: 'GET', path: '/api/roles/matrix', auth: true },
  { name: 'roles/owner', method: 'GET', path: '/api/roles/owner', auth: true },
  { name: 'roles/director', method: 'GET', path: '/api/roles/director', auth: true },
  { name: 'roles/__nope__ (404)', method: 'GET', path: '/api/roles/__nope__', auth: true },
  { name: 'roles (auth yo\'q → 401)', method: 'GET', path: '/api/roles' },
  { name: 'users/:id/password (404)', method: 'GET',
    path: `/api/users/${'a'.repeat(24)}/password`, auth: true },
  // ── Faza 2.5a: foydalanuvchilar (o'qish yo'llari) ──
  // Mutatsiyalar bu yerda EMAS — ular holatni o'zgartiradi va
  // `test/users-parity.test.mjs` da tiklash bilan sinaladi.
  { name: 'users (list)', method: 'GET', path: '/api/users?limit=5', auth: true },
  { name: 'users (staff)', method: 'GET', path: '/api/users?staff=1&limit=5', auth: true },
  { name: 'users/staff-stats', method: 'GET', path: '/api/users/staff-stats', auth: true },
  { name: 'users/check-availability', method: 'GET',
    path: '/api/users/check-availability?username=owner', auth: true },
  { name: 'users/:id (404)', method: 'GET',
    path: `/api/users/${'a'.repeat(24)}`, auth: true },
  // ── Faza 2.5b: hayot sikli (FAQAT 404 — holat o'zgartirmaydigan yo'l) ──
  // Haqiqiy arxivlash/tiklash/o'chirish bu yerda EMAS: ular bazani
  // o'zgartiradi va `test/users-lifecycle-parity.test.mjs` da o'z
  // fixture'i bilan, tozalash kafolati ostida sinaladi.
  { name: 'users/:id arxivlash (404)', method: 'DELETE',
    path: `/api/users/${'a'.repeat(24)}`, auth: true },
  { name: 'users/:id/restore (404)', method: 'POST',
    path: `/api/users/${'a'.repeat(24)}/restore`, auth: true },
  { name: 'users/:id/permanent (404)', method: 'DELETE',
    path: `/api/users/${'a'.repeat(24)}/permanent`, auth: true },
  // ── Faza 3: filiallar (o'qish yo'llari) ──
  { name: 'branches (list)', method: 'GET', path: '/api/branches?limit=5', auth: true },
  { name: 'branches (withManagers)', method: 'GET',
    path: '/api/branches?withManagers=true&limit=5', auth: true },
  { name: 'branches/compare', method: 'GET', path: '/api/branches/compare', auth: true },
  { name: 'branches/delegation-options', method: 'GET',
    path: '/api/branches/delegation-options', auth: true },
  { name: 'branches/:id (404)', method: 'GET',
    path: `/api/branches/${'a'.repeat(24)}`, auth: true },
  // ── Faza 3: xonalar (o'qish yo'llari) ──
  { name: 'rooms (list)', method: 'GET', path: '/api/rooms?limit=5', auth: true },
  { name: 'rooms (includeInactive)', method: 'GET',
    path: '/api/rooms?includeInactive=true&limit=5', auth: true },
  { name: 'rooms (search)', method: 'GET', path: '/api/rooms?search=101', auth: true },
  { name: 'rooms/:id (404)', method: 'GET',
    path: `/api/rooms/${'a'.repeat(24)}`, auth: true },
  { name: "rooms (auth yo'q → 401)", method: 'GET', path: '/api/rooms' },
  // ── Faza 10: bildirishnomalar (o'qish yo'llari) ──
  { name: 'notifications (list)', method: 'GET', path: '/api/notifications?limit=5', auth: true },
  { name: 'notifications/inbox', method: 'GET', path: '/api/notifications/inbox?limit=5', auth: true },
  { name: 'notifications/inbox/unread-count', method: 'GET',
    path: '/api/notifications/inbox/unread-count', auth: true },
  // ⚠ 500 KUTILADI — Express'da ham shunday (B4). Paritet aynan shuni qulflaydi.
  { name: 'notifications/stats (B4: 500)', method: 'GET',
    path: '/api/notifications/stats', auth: true },
  { name: 'notifications/:id (404)', method: 'GET',
    path: `/api/notifications/${'a'.repeat(24)}`, auth: true },
  { name: "notifications (auth yo'q → 401)", method: 'GET', path: '/api/notifications' },
  // ── Faza 10: shablonlar + tizim bildirishnomalari ──
  { name: 'notification-templates (list)', method: 'GET',
    path: '/api/notification-templates?limit=5', auth: true },
  { name: 'notification-templates/:id (404)', method: 'GET',
    path: `/api/notification-templates/${'a'.repeat(24)}`, auth: true },
  { name: "notification-templates (auth yo'q → 401)", method: 'GET',
    path: '/api/notification-templates' },
  { name: 'system-notifications (list)', method: 'GET',
    path: '/api/system-notifications?limit=5', auth: true },
  { name: 'system-notifications/unread-count', method: 'GET',
    path: '/api/system-notifications/unread-count', auth: true },
  { name: "system-notifications (auth yo'q → 401)", method: 'GET',
    path: '/api/system-notifications' },
  // ── Faza 10: saqlagich ──
  { name: 'storage/usage', method: 'GET', path: '/api/storage/usage', auth: true },
  { name: 'storage/settings', method: 'GET', path: '/api/storage/settings', auth: true },
  { name: 'storage/files', method: 'GET', path: '/api/storage/files?limit=5', auth: true },
  { name: "storage/usage (auth yo'q → 401)", method: 'GET', path: '/api/storage/usage' },
  // ── Faza 10: fikr-mulohaza + kataloglar ──
  { name: 'feedback (list)', method: 'GET', path: '/api/feedback?limit=5', auth: true },
  { name: 'feedback/me', method: 'GET', path: '/api/feedback/me?limit=5', auth: true },
  { name: 'feedback/stats', method: 'GET', path: '/api/feedback/stats', auth: true },
  { name: 'feedback/:id (404)', method: 'GET',
    path: `/api/feedback/${'a'.repeat(24)}`, auth: true },
  { name: 'lead-options (list)', method: 'GET', path: '/api/lead-options', auth: true },
  { name: 'archive-reasons (list)', method: 'GET',
    path: '/api/archive-reasons?limit=5', auth: true },
  { name: 'archive-reasons/report', method: 'GET',
    path: '/api/archive-reasons/report', auth: true },
  { name: 'attendance-settings', method: 'GET', path: '/api/attendance-settings', auth: true },
  { name: 'holidays (list)', method: 'GET', path: '/api/holidays?limit=5', auth: true },
  { name: 'holidays/teacher-birthdays', method: 'GET',
    path: '/api/holidays/teacher-birthdays', auth: true },
  { name: 'holidays/:id (404)', method: 'GET',
    path: `/api/holidays/${'a'.repeat(24)}`, auth: true },
  // ── Faza 3: kurslar (o'qish yo'llari) ──
  { name: 'courses (list)', method: 'GET', path: '/api/courses?limit=5', auth: true },
  { name: 'courses (includeInactive)', method: 'GET',
    path: '/api/courses?includeInactive=true&limit=5', auth: true },
  { name: 'courses/:id (404)', method: 'GET',
    path: `/api/courses/${'a'.repeat(24)}`, auth: true },
  { name: 'courses/:id/prices (404)', method: 'GET',
    path: `/api/courses/${'a'.repeat(24)}/prices`, auth: true },
  // ⚠ `/resolve/:groupId` `/:id` DAN OLDIN e'lon qilinganini QULFLAYDI:
  // tartib buzilsa bu «Kurs topilmadi» qaytarardi.
  { name: 'courses/resolve/:groupId (404 «Guruh topilmadi»)', method: 'GET',
    path: `/api/courses/resolve/${'a'.repeat(24)}`, auth: true },
  { name: "courses (auth yo'q → 401)", method: 'GET', path: '/api/courses' },
  { name: 'search (q=ali)', method: 'GET', path: '/api/search?q=ali', auth: true },
  { name: "search (qisqa → bo'sh)", method: 'GET', path: '/api/search?q=a', auth: true },
  { name: 'activity-history/students (404)', method: 'GET',
    path: `/api/activity-history/students/${'a'.repeat(24)}`, auth: true },
  // ── Faza 5a: guruhlar (o'qish yo'llari, 9/24) ──
  { name: 'groups (list)', method: 'GET', path: '/api/groups?limit=5', auth: true },
  { name: 'groups (archived)', method: 'GET',
    path: '/api/groups?archived=1&limit=5', auth: true },
  { name: 'groups (archived=xato → 400)', method: 'GET',
    path: '/api/groups?archived=xato', auth: true },
  { name: 'groups/:id (404)', method: 'GET',
    path: `/api/groups/${'a'.repeat(24)}`, auth: true },
  { name: 'groups/:id/history (404)', method: 'GET',
    path: `/api/groups/${'a'.repeat(24)}/history`, auth: true },
  { name: 'groups/:id/teacher-periods (404 emas — bo\'sh)', method: 'GET',
    path: `/api/groups/${'a'.repeat(24)}/teacher-periods`, auth: true },
  { name: 'groups/:id/available-teachers (404)', method: 'GET',
    path: `/api/groups/${'a'.repeat(24)}/available-teachers`, auth: true },
  // ⚠ `/me/*` `/:id` DAN OLDIN e'lon qilinganini QULFLAYDI: tartib
  // buzilsa "me" guruh ID'si deb o'qilib 404 chiqardi. Owner uchun
  // ikkala marshrut ham 403 beradi — lekin AYNAN 403, 404 EMAS.
  { name: 'groups/me/active (owner → 403, 404 EMAS)', method: 'GET',
    path: '/api/groups/me/active', auth: true },
  { name: 'groups/me/teach (owner → 403, 404 EMAS)', method: 'GET',
    path: '/api/groups/me/teach', auth: true },
  { name: "groups (auth yo'q → 401)", method: 'GET', path: '/api/groups' },
  // ── Faza 6: davomat (11/11 marshrut) ──
  { name: 'attendance/groups/:id (404)', method: 'GET',
    path: `/api/attendance/groups/${'a'.repeat(24)}?date=2026-08-10`, auth: true },
  { name: 'attendance/groups/:id (sanasiz → 400)', method: 'GET',
    path: `/api/attendance/groups/${'a'.repeat(24)}`, auth: true },
  { name: 'attendance/groups/:id/monthly (404)', method: 'GET',
    path: `/api/attendance/groups/${'a'.repeat(24)}/monthly?year=2026&month=8`, auth: true },
  { name: 'attendance/groups/:id/monthly (month=13 → 400)', method: 'GET',
    path: `/api/attendance/groups/${'a'.repeat(24)}/monthly?year=2026&month=13`, auth: true },
  { name: 'attendance/dashboard', method: 'GET',
    path: '/api/attendance/dashboard?fromDate=2026-08-01&toDate=2026-08-07&limit=3', auth: true },
  { name: 'attendance/dashboard (sanasiz → 400)', method: 'GET',
    path: '/api/attendance/dashboard', auth: true },
  // ⚠ `/teacher/me/summary` `/students/:id` va `/groups/:id` DAN
  // MUSTAQIL yo'l — owner uchun AYNAN 403 (404 EMAS) bo'lishi
  // marshrut tartibi buzilmaganini qulflaydi.
  { name: 'attendance/teacher/me/summary (owner → 403)', method: 'GET',
    path: '/api/attendance/teacher/me/summary?fromDate=2026-08-01&toDate=2026-08-07',
    auth: true },
  { name: "attendance (auth yo'q → 401)", method: 'GET',
    path: '/api/attendance/dashboard' },
  // ── Faza 8.1: o'qituvchi maoshi (15/15 marshrut) ──
  { name: 'teacher-salary/salaries', method: 'GET',
    path: '/api/teacher-salary/salaries?limit=5', auth: true },
  { name: 'teacher-salary/salaries (limit=999 → 400)', method: 'GET',
    path: '/api/teacher-salary/salaries?limit=999', auth: true },
  { name: 'teacher-salary/salaries/:id (404)', method: 'GET',
    path: `/api/teacher-salary/salaries/${'a'.repeat(24)}`, auth: true },
  // ⚠ `by-teacher/:id/balance` `/salaries/:id` DAN OLDIN e'lon
  // qilinganini QULFLAYDI — tartib buzilsa "by-teacher" maosh ID'si
  // deb o'qilib, boshqa xato chiqardi.
  { name: 'teacher-salary/salaries/by-teacher/:id (404)', method: 'GET',
    path: `/api/teacher-salary/salaries/by-teacher/${'a'.repeat(24)}`, auth: true },
  { name: 'teacher-salary/salaries/by-teacher/:id/balance (404)', method: 'GET',
    path: `/api/teacher-salary/salaries/by-teacher/${'a'.repeat(24)}/balance`,
    auth: true },
  { name: 'teacher-salary/obligations?year=2026', method: 'GET',
    path: '/api/teacher-salary/obligations?year=2026', auth: true },
  { name: 'teacher-salary/obligations (yilsiz → 400)', method: 'GET',
    path: '/api/teacher-salary/obligations', auth: true },
  { name: 'teacher-salary/compensations/by-teacher/:id', method: 'GET',
    path: `/api/teacher-salary/compensations/by-teacher/${'a'.repeat(24)}`,
    auth: true },
  // ⚠ `/me/finance` `/salaries/:id` DAN OLDIN — owner uchun AYNAN 403.
  { name: 'teacher-salary/me/finance (owner → 403)', method: 'GET',
    path: '/api/teacher-salary/me/finance', auth: true },
  { name: "teacher-salary (auth yo'q → 401)", method: 'GET',
    path: '/api/teacher-salary/salaries' },
  // ── Faza 4/9: lidlar + rahbariyat paneli ──
  { name: 'leads (list)', method: 'GET', path: '/api/leads?limit=5', auth: true },
  { name: 'leads/stats', method: 'GET', path: '/api/leads/stats', auth: true },
  { name: 'leads/conversion', method: 'GET', path: '/api/leads/conversion', auth: true },
  { name: 'leads/assignees', method: 'GET', path: '/api/leads/assignees', auth: true },
  { name: 'leads/routing', method: 'GET', path: '/api/leads/routing', auth: true },
  { name: 'admin-dashboard/overview', method: 'GET',
    path: '/api/admin-dashboard/overview', auth: true },
  { name: 'admin-dashboard/student-flow', method: 'GET',
    path: '/api/admin-dashboard/student-flow', auth: true },
  { name: 'admin-dashboard/cashflow', method: 'GET',
    path: '/api/admin-dashboard/cashflow', auth: true },
  { name: 'admin-dashboard/student-stats', method: 'GET',
    path: '/api/admin-dashboard/student-stats', auth: true },
  { name: 'admin-dashboard/retention', method: 'GET',
    path: '/api/admin-dashboard/retention', auth: true },
  { name: 'admin-dashboard/churned-students', method: 'GET',
    path: '/api/admin-dashboard/churned-students', auth: true },
  { name: 'branch-analytics/rooms', method: 'GET',
    path: '/api/branch-analytics/rooms', auth: true },
  // ── Moliya tahlili (30 marshrut) — bu yerda VAKIL tanlov.
  // To'liq qamrov `test/finance-analytics-parity.test.mjs` da: u
  // ruxsat darajalarini, filial ko'lamini va qo'riqchilarni ham
  // o'lchaydi. Quyidagilar qo'shni agentlar uchun REGRESSIYA to'sig'i.
  { name: 'finance-analytics/summary', method: 'GET',
    path: '/api/finance-analytics/summary', auth: true },
  { name: 'finance-analytics/revenue/by/course', method: 'GET',
    path: '/api/finance-analytics/revenue/by/course', auth: true },
  { name: 'finance-analytics/expenses/breakdown', method: 'GET',
    path: '/api/finance-analytics/expenses/breakdown', auth: true },
  { name: 'finance-analytics/cash-flow', method: 'GET',
    path: '/api/finance-analytics/cash-flow', auth: true },
  { name: 'finance-analytics/receivables', method: 'GET',
    path: '/api/finance-analytics/receivables', auth: true },
  { name: 'finance-analytics/teachers', method: 'GET',
    path: '/api/finance-analytics/teachers', auth: true },
  // ⚠ `rooms` — `RoomOccupancyService` YAGONA manba ekanini ushlab
  // turadi: nusxa paydo bo'lsa bandlik foizi ajralib ketadi.
  { name: 'finance-analytics/rooms', method: 'GET',
    path: '/api/finance-analytics/rooms', auth: true },
  { name: 'finance-analytics/entries', method: 'GET',
    path: '/api/finance-analytics/entries?limit=10', auth: true },
  // ── Faza 2.3: auth moduli ──
  { name: 'auth/me', method: 'GET', path: '/api/auth/me', auth: true },
  { name: 'auth/me (401)', method: 'GET', path: '/api/auth/me' },
];

const call = async (base, c) => {
  const headers = { 'content-type': 'application/json' };
  if (c.auth && TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  const t0 = Date.now();
  try {
    const res = await fetch(base + c.path, {
      method: c.method,
      headers,
      ...(c.body ? { body: JSON.stringify(c.body) } : {}),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return {
      reachable: true,
      status: res.status,
      contentType: (res.headers.get('content-type') || '').split(';')[0],
      hasSetCookie: Boolean(res.headers.get('set-cookie')),
      body,
      ms: Date.now() - t0,
    };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
};

const run = async () => {
  console.log('\n\x1b[1mPARITET: Express ↔ NestJS\x1b[0m');
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  let compared = 0, diffs = 0, skipped = 0, unreachable = 0;
  // ⚠ MUSBAT NAZORAT #2: himoyalangan marshrutlardan KAMIDA BITTASI
  // 200 qaytarishi shart. Tokenning muddati o'tsa hamma tekshiruv 401
  // bo'lardi — ikkala stekda BIR XIL 401, ya'ni "paritet saqlangan"
  // degan YASHIL natija chiqardi va aslida hech narsa o'lchanmasdi.
  let authedOk = 0;

  for (const c of CASES) {
    if (c.skip) { skipped += 1; console.log(`  ⏭  ${c.name} — ${c.skip}`); continue; }

    const [e, n] = await Promise.all([call(EXPRESS, c), call(NEST, c)]);

    if (!e.reachable || !n.reachable) {
      unreachable += 1;
      console.log(`  ❌ ${c.name} — STEK JAVOB BERMADI ` +
        `(express: ${e.reachable ? 'ok' : e.error}, nest: ${n.reachable ? 'ok' : n.error})`);
      continue;
    }

    compared += 1;
    const problems = [];
    if (e.status !== n.status) problems.push(`status ${e.status} ≠ ${n.status}`);
    if (e.contentType !== n.contentType) problems.push(`content-type ${e.contentType} ≠ ${n.contentType}`);
    if (e.hasSetCookie !== n.hasSetCookie) problems.push(`set-cookie ${e.hasSetCookie} ≠ ${n.hasSetCookie}`);
    const eb = JSON.stringify(strip(e.body));
    const nb = JSON.stringify(strip(n.body));
    if (eb !== nb) problems.push(`tana farq qiladi:\n      express: ${eb}\n      nest   : ${nb}`);

    if (c.auth && e.status === 200) authedOk += 1;
    if (problems.length) { diffs += 1; console.log(`  ❌ ${c.name}\n      ${problems.join('\n      ')}`); }
    else console.log(`  ✅ ${c.name} — ${e.status}, tana bir xil`);
  }

  console.log(`\n  Solishtirildi: ${compared} · farq: ${diffs} · o'tkazib yuborildi: ${skipped} · yetib bo'lmadi: ${unreachable}`);

  // ⚠ MUSBAT NAZORAT: hech narsa solishtirilmagan bo'lsa — bu YASHIL EMAS.
  if (compared === 0) {
    console.log('\n  ❌ O\'LCHANMADI: birorta endpoint solishtirilmadi.');
    console.log('     Ikkala stek ham ishlab turishi SHART — aks holda bu test');
    console.log('     "farq yo\'q" deb yolg\'on yashil berardi.\n');
    process.exit(1);
  }
  if (CASES.some((c) => c.auth && !c.skip) && authedOk === 0) {
    console.log('\n  ❌ O\'LCHANMADI: birorta himoyalangan marshrut 200 qaytarmadi.');
    console.log('     Token eskirgan bo\'lishi mumkin — yangisini oling:');
    console.log('     node test/parity.mjs --token <accessToken>\n');
    process.exit(1);
  }
  if (unreachable > 0 || diffs > 0) { console.log(''); process.exit(1); }
  console.log('  ✅ Paritet saqlangan\n');
};

run().catch((e) => { console.error(e); process.exit(1); });
