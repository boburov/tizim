/**
 * KO'CHIRISH ZONDI — QAYSI MODUL POSTGRESQL'DA ISHLAYAPTI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA STATIK TAHLIL YETARLI EMAS
 *
 * "Qaysi fayl `mongoose` import qiladi" degan sanoq HAQIQATNI
 * ko'rsatmaydi. Import qilish zararsiz — faqat SO'ROV BAJARISH
 * yiqiladi. Migratsiya davomida ikkala yo'nalishda ham xato bo'lgan:
 *
 *   • import bor, lekin chaqirilmaydi -> endpoint 200 (statik tahlil
 *     uni "ko'chirilmagan" deb sanardi);
 *   • import yo'q, lekin boshqa fayl orqali chaqiriladi -> 501
 *     (statik tahlil uni "tayyor" deb sanardi).
 *
 * Shuning uchun bu zond ENDPOINTNI HAQIQATAN CHAQIRADI va HTTP
 * javob kodiga qaraydi. 501 = MODULE_NOT_MIGRATED (server
 * shartnomasi, `config/legacyMongoose.js`).
 * ═══════════════════════════════════════════════════════════════════
 *
 * YOLG'ON IJOBIYDAN EHTIYOT BO'LING. Bir endpoint ma'lumotga
 * yetmasdan ERTA QAYTISHI mumkin va 200 beradi. Haqiqiy misol:
 * `/search?q=a` — kod 2 belgidan qisqa so'rovni Mongoose'ga umuman
 * yubormaydi, ya'ni "ishlayapti" bo'lib ko'rinardi. Shuning uchun
 * har yozuvda MA'LUMOTGA YETADIGAN parametr beriladi (`q=owner`).
 *
 * ISHLATISH:
 *   node tests/migrationProbe.mjs                # jadval
 *   node tests/migrationProbe.mjs --json         # JSON (taqqoslash uchun)
 *   node tests/migrationProbe.mjs --before f.json  # oldingi holat bilan farq
 */
const API = process.env.API_URL || "http://localhost:5000/api";
const LOGIN = process.env.PROBE_LOGIN || "owner";
const PASSWORD = process.env.PROBE_PASSWORD || "owner123";

// Har yozuv: [modul, yo'l, izoh?]
// Yo'llar MARSHRUT FAYLLARIDAN o'qib olingan, taxmin qilinmagan.
const ENDPOINTS = [
  // ── Poydevor ──
  ["auth", "/auth/me"],
  ["users", "/users?limit=1"],
  ["roles", "/roles"],
  ["branches", "/branches"],
  ["rooms", "/rooms?limit=1"],
  ["courses", "/courses?limit=1"],
  ["groups", "/groups?limit=1"],
  ["leads", "/leads?limit=1"],
  ["lead-options", "/lead-options"],
  ["archive-reasons", "/archive-reasons"],
  ["holidays", "/holidays"],
  ["settings/attendance", "/attendance-settings"],

  // ── Moliya ──
  ["finance/payments", "/finance/student-payments?limit=1"],
  ["finance/discounts", "/finance/discounts?limit=1"],
  ["finance-report", "/finance-report/summary"],
  ["deposits", "/deposits/report"],
  ["expenses", "/expenses?limit=1"],
  ["expense-approvals", "/expense-approvals?limit=1"],
  ["teacher-salary", "/teacher-salary/salaries?limit=1"],
  ["staff-payroll", "/staff-payroll?limit=1"],
  ["opening-balance", "/opening-balance"],
  ["journal/balances", "/journal/balances"],
  ["journal/shifts", "/journal/shifts"],
  ["journal/transfers", "/journal/transfers"],
  ["ledger", "/ledger/me"],

  // ── Tahlil ──
  ["admin-dashboard/overview", "/admin-dashboard/overview"],
  ["admin-dashboard/student-flow", "/admin-dashboard/student-flow"],
  ["admin-dashboard/cashflow", "/admin-dashboard/cashflow"],
  ["admin-dashboard/student-stats", "/admin-dashboard/student-stats"],
  ["admin-dashboard/retention", "/admin-dashboard/retention"],
  ["admin-dashboard/churned", "/admin-dashboard/churned-students"],
  ["branch-analytics/pnl", "/branch-analytics/pnl"],
  ["branch-analytics/sales", "/branch-analytics/sales"],
  ["branch-analytics/teachers", "/branch-analytics/teachers"],
  ["branch-analytics/utilization", "/branch-analytics/utilization"],
  ["branch-analytics/alerts", "/branch-analytics/alerts"],

  // ── O'quv jarayoni ──
  ["attendance", "/attendance/dashboard?fromDate=2026-08-01&toDate=2026-08-17"],
  ["teacher-attendance", "/teacher-attendance?date=2026-08-17"],
  ["attendance-exemptions", "/attendance-exemptions?limit=1"],
  ["lesson-cancellations", "/lesson-cancellations?limit=1"],
  // ⚠ YOLG'ON IJOBIY XAVFI: `getLeaderboard` faol a'zolik bo'lmasa
  // ERTA QAYTADI (`studentIds.length === 0`) va Mongoose'ga umuman
  // yetib bormaydi. Ya'ni bo'sh bazada 200 ko'rsatadi, holbuki
  // `rating.service` -> `attendance.service` zanjiri hali ko'chmagan.
  // Bazada faol o'quvchi paydo bo'lgach bu yozuv haqiqatni aytadi.
  ["grades/rating", "/grades/rating/leaderboard"],
  ["grades/settings", "/grades/rating/settings"],

  // ── Aloqa ──
  ["notifications", "/notifications?limit=1"],
  ["notification-templates", "/notification-templates"],
  ["system-notifications", "/system-notifications?limit=1"],
  ["feedback", "/feedback?limit=1"],
  ["feedback-types", "/feedback-types"],
  ["assignments", "/assignments?limit=1"],

  // ── Tizim ──
  // `q` UZUN bo'lishi shart: qisqa so'rov Mongoose'ga yetmasdan qaytadi.
  ["search", "/search?q=owner"],
  ["activity-logs", "/activity-logs?limit=1"],
  // `:studentId` kerak - zond birinchi o'quvchini o'zi topadi (pastda).
  ["activity-history", "/activity-history/students/__STUDENT__"],
  ["storage/usage", "/storage/usage"],
  ["storage/settings", "/storage/settings"],
  ["storage/files", "/storage/files?limit=1"],
  ["exports/datasets", "/exports/datasets"],
  ["imports", "/imports/history?limit=1"],
  ["ai/briefing", "/ai/briefing"],
  ["ai/insights", "/ai/insights?limit=1"],
  ["ai/reports", "/ai/reports"],
];

// Filial konteksti talab qiladigan yozuvlar (aniq filial tanlanmasa
// boshqa kod yo'lidan ketadi va nosozlik yashirinib qoladi).
const NEEDS_BRANCH = new Set(["exports/download"]);

const jsonFlag = process.argv.includes("--json");
const beforeIdx = process.argv.indexOf("--before");

const main = async () => {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  }).catch(() => null);

  if (!res || !res.ok) {
    console.error(
      `\nSERVERGA ULANIB BO'LMADI (${API}).\n` +
        `Server ishga tushganini tekshiring: npm run dev\n`,
    );
    process.exit(2);
  }
  const token = (await res.json()).data.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  // Aniq filial bilan chaqiriladigan yozuv uchun ID kerak.
  const branches = await (
    await fetch(`${API}/branches`, { headers: auth })
  ).json();
  const branchId = branches?.data?.[0]?._id || branches?.data?.[0]?.id || null;

  // `activity-history` o'quvchi ID'sini talab qiladi. Bittasi topilmasa
  // yozuv o'tkazib yuboriladi - "o'quvchi yo'q" ko'chirish holati
  // haqida hech nima demaydi.
  const students = await (
    await fetch(`${API}/users?role=student&limit=1`, { headers: auth })
  ).json().catch(() => null);
  const studentId = students?.data?.[0]?._id || students?.data?.[0]?.id || null;

  const out = [];
  for (const [name, rawPath] of ENDPOINTS) {
    if (rawPath.includes("__STUDENT__") && !studentId) continue;
    const path = rawPath.replace("__STUDENT__", studentId || "");
    const headers = { ...auth };
    if (NEEDS_BRANCH.has(name) && branchId) headers["x-branch-id"] = branchId;

    let status, code = "";
    try {
      const r = await fetch(`${API}${path}`, { headers });
      status = r.status;
      if (status >= 400) {
        const b = await r.json().catch(() => ({}));
        code = b.code || "";
      }
    } catch (err) {
      status = 0;
      code = String(err.message).slice(0, 40);
    }
    out.push({ name, path, status, code });
  }

  // Eksport YUKLASH — alohida, chunki POST va aniq filial talab qiladi.
  // Aynan shu yo'lda xato topilgan: "barcha filiallar" rejimida
  // ishlaydi, aniq filial tanlanganda yiqiladi.
  if (branchId) {
    try {
      const r = await fetch(`${API}/exports/student-payments`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify({ columns: ["studentName"], format: "csv" }),
      });
      let code = "";
      if (r.status >= 400) code = (await r.json().catch(() => ({}))).code || "";
      out.push({ name: "exports/download", path: "POST /exports/:key (+branch)", status: r.status, code });
    } catch { /* tarmoq xatosi - zond o'zi yiqilmasin */ }
  }

  if (jsonFlag) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const cls = (o) =>
    o.status === 501 ? "notMigrated" : o.status >= 500 || o.status === 0 ? "broken" : "ok";

  const groups = { ok: [], notMigrated: [], broken: [] };
  for (const o of out) groups[cls(o)].push(o);

  // ── Oldingi holat bilan farq ──
  let before = null;
  if (beforeIdx !== -1 && process.argv[beforeIdx + 1]) {
    const { readFileSync } = await import("node:fs");
    before = JSON.parse(readFileSync(process.argv[beforeIdx + 1], "utf8"));
  }

  const line = (o) => {
    let mark = "";
    if (before) {
      const prev = before.find((b) => b.name === o.name);
      if (prev && prev.status === 501 && o.status !== 501) mark = "  ⬆ YANGI";
      if (prev && prev.status !== 501 && o.status === 501) mark = "  ⬇ REGRESSIYA";
    }
    return `   ${String(o.status).padEnd(4)} ${o.name.padEnd(30)} ${o.path}${mark}`;
  };

  console.log(`\n═══ KO'CHIRISH ZONDI — ${out.length} ta endpoint ═══`);
  console.log(`\n✅ POSTGRESQL'DA ISHLAYDI (${groups.ok.length})`);
  for (const o of groups.ok) console.log(line(o));
  if (groups.notMigrated.length) {
    console.log(`\n⛔ KO'CHIRILMAGAN — 501 (${groups.notMigrated.length})`);
    for (const o of groups.notMigrated) console.log(line(o));
  }
  if (groups.broken.length) {
    console.log(`\n❗ HAQIQIY XATO — 5xx (${groups.broken.length})`);
    for (const o of groups.broken) console.log(line(o));
  }

  const pct = Math.round((groups.ok.length / out.length) * 100);
  console.log(
    `\n── ${groups.ok.length}/${out.length} (${pct}%) ko'chirilgan, ` +
      `${groups.notMigrated.length} qoldi, ${groups.broken.length} buzuq ──\n`,
  );

  // BUZUQ (5xx) bo'lsa yiqiladi. 501 esa YIQITMAYDI - u kutilgan
  // oraliq holat, "hali navbat kelmagan" degani.
  process.exit(groups.broken.length ? 1 : 0);
};

await main();
