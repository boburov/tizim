/**
 * ══════════════════════════════════════════════════════════════════════
 * ISH MAKONLARI — BRAUZER QABUL TESTI (talab 33)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Build va HTTP tekshiruvlari YETARLI EMAS: ular DOM'ni ko'rmaydi,
 * konsol xatosini ushlamaydi va "menyu bosildi-yu, hech narsa
 * ochilmadi" holatini sezmaydi.
 *
 * Bu test talab 33 dagi to'rt yo'lni AYNAN kuzatib boradi:
 *
 *   SUPER ADMIN  login → umumiy holat → filiallar → filial → xonalar →
 *                 xona qo'shish → moliya → drill-down zanjiri →
 *                 tranzaksiya → vakolatlar
 *   ADMIN         login → filial ekrani → faqat o'z filiali
 *   XODIM         login → o'z ishi, tashkilot moliyasi YO'Q
 *   O'QUVCHI      login → faqat o'zi
 *
 * OLDIN ISHGA TUSHIRING:
 *   server: node tests/fixtures/qaUsers.mjs
 */
const resolvePlaywright = async () => {
  const { existsSync, readdirSync } = await import("node:fs");
  const candidates = [];
  if (process.env.PLAYWRIGHT_PATH) candidates.push(process.env.PLAYWRIGHT_PATH);
  candidates.push(new URL("../node_modules/playwright/index.mjs", import.meta.url).pathname);
  const npx = `${process.env.HOME}/.npm/_npx`;
  if (existsSync(npx)) {
    for (const d of readdirSync(npx)) {
      const p = `${npx}/${d}/node_modules/playwright/index.mjs`;
      if (existsSync(p)) candidates.push(p);
    }
  }
  for (const c of candidates) if (existsSync(c)) return import(`file://${c}`);
  console.error("\nPLAYWRIGHT TOPILMADI — brauzer testi BAJARILMADI.\n" +
    "O'rnatish: npx playwright install chromium\n");
  process.exit(2);
};
const { chromium } = await resolvePlaywright();

const APP = process.env.APP_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://localhost:5000/api";
const SHOTS = process.env.SHOT_DIR || "/tmp/lc-shots";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, x = "") => { R.pass++; console.log(`  ✅ ${n}${x ? ` — ${x}` : ""}`); };
const bad = (n, x = "") => { R.fail++; R.failures.push(`${n} — ${x}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ""}`); };
const check = (n, cond, x = "") => (cond ? ok(n, x) : bad(n, x));
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const browser = await chromium.launch();
const consoleErrors = [];

const newSession = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 180));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 180)}`));
  return { ctx, page };
};

/** Login + majburiy filial tanlash ekranini o'tish. */
const loginAs = async (page, user, pass, { allBranches = true } = {}) => {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password"]', pass);
  await page.press('input[name="password"]', "Enter");
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(1200);

  const gate = page.locator("[data-branch-gate]");
  if (await gate.count()) {
    const label = allBranches ? "Barcha filiallar" : null;
    const btn = label
      ? gate.locator("button", { hasText: label }).first()
      : gate.locator("button").first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(2500);
    }
  }
  return page.url().replace(APP, "");
};

const sidebarItems = async (page) =>
  (await page.locator('[data-sidebar="sidebar"] a span, [data-sidebar="sidebar"] button span')
    .allTextContents()).map((t) => t.trim()).filter(Boolean);

const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
};

console.log("\n═══════ ISH MAKONLARI — BRAUZER QABUL TESTI ═══════");

// ══════════════════════════════════════════════════════════════════
// 1) SUPER ADMIN
// ══════════════════════════════════════════════════════════════════
head("1) SUPER ADMIN — tashkilot boshqaruv markazi");
{
  const { ctx, page } = await newSession();
  const landing = await loginAs(page, "owner", "owner123");
  check("login → tashkilot makoni", landing.startsWith("/org"), landing);

  await page.waitForTimeout(1500);
  const nav = await sidebarItems(page);
  const EXPECT = ["Umumiy holat", "Filiallar", "Odamlar", "Moliya",
    "Operatsiya", "Tahlil", "Vakolatlar", "Sozlamalar"];
  const missing = EXPECT.filter((t) => !nav.some((n) => n.includes(t)));
  check("sidebar 8 bo'lim", missing.length === 0, missing.length ? `yo'q: ${missing}` : nav.join(" · "));

  const kpi = await page.locator("main .tabular-nums").count();
  check("KPI plitalari", kpi > 0, `${kpi} raqam`);

  // ── HAR KPI HAQIQIY RAQAM KO'RSATISHI SHART ──
  //
  // Bu tekshiruv HAQIQIY XATODAN keyin qo'shildi: KPI `summary`
  // javobidagi NOTO'G'RI yo'lni o'qiyotgan edi
  // (`cashBalance.total`, holbuki server oddiy son qaytaradi).
  // Natijada plita xotirjam "Ma'lumot yo'q" ko'rsatardi — so'rov
  // muvaffaqiyatli, xato yo'q, konsol toza. Bunday nosozlikni faqat
  // ko'z bilan ko'rish mumkin edi, ya'ni u ishlab chiqarishga
  // yetib borardi.
  const emptyTiles = await page.locator("main").locator("text=Ma'lumot yo'q").count();
  check("KPI larda 'Ma'lumot yo'q' yo'q", emptyTiles === 0, `${emptyTiles} ta bo'sh plita`);
  await shot(page, "01-org-overview");

  // ── FILIALLAR ──
  await page.goto(`${APP}/org/branches`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const rows = await page.locator("main table tbody tr").count();
  check("filiallar jadvali", rows > 0, `${rows} qator`);
  await shot(page, "02-org-branches");

  // ── FILIALGA KIRISH ──
  if (rows > 0) {
    await page.locator("main table tbody tr").first().click();
    await page.waitForTimeout(1800);
    check("filial kartasi ochildi", /\/org\/branches\/[0-9a-f]{24}/.test(page.url()), page.url().replace(APP, ""));

    // ── XONALAR TABI — TALAB 2 NING ASOSIY OQIMI ──
    const roomsTab = page.locator("main button", { hasText: "Xonalar" }).first();
    if (await roomsTab.count()) {
      await roomsTab.click();
      await page.waitForTimeout(1500);
      const addRoom = page.locator("main button", { hasText: "Xona qo'shish" });
      check("filial ICHIDA 'Xona qo'shish' tugmasi", await addRoom.count() > 0);
      const roomRows = await page.locator("main table tbody tr").count();
      check("xonalar ro'yxati", roomRows >= 0, `${roomRows} xona`);
      await shot(page, "03-org-branch-rooms");

      // Modal ochiladimi (yozmaymiz — faqat forma ochilishini tekshiramiz)
      if (await addRoom.count()) {
        await addRoom.first().click();
        await page.waitForTimeout(900);
        const nameField = page.locator('input[name="name"]');
        check("xona formasi ochildi", await nameField.count() > 0);
        // Filial tanlagichi BO'LMASLIGI kerak — kontekstdan olinadi.
        const branchSelect = page.locator('[role="dialog"] select[name="branchId"], [role="dialog"] [name="branchId"]');
        check("filial tanlagichi YO'Q (kontekstdan)", await branchSelect.count() === 0);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    } else bad("Xonalar tabi topilmadi");
  }

  // ── MOLIYA + DRILL-DOWN ZANJIRI (talab 34) ──
  await page.goto(`${APP}/org/finance?tab=revenue`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  await shot(page, "04-org-finance-revenue");

  const revRows = page.locator("main table tbody tr");
  const revCount = await revRows.count();
  check("daromad kesimi jadvali", revCount > 0, `${revCount} qator`);

  if (revCount > 0) {
    await revRows.first().click();
    await page.waitForTimeout(2000);
    const sheet = page.locator('[role="dialog"]');
    check("drill paneli ochildi", await sheet.count() > 0);
    await shot(page, "05-drill-level-1");

    // Ichkariga — keyingi bo'g'in
    const inner = sheet.locator("table tbody tr");
    const innerCount = await inner.count();
    check("panel ichida keyingi daraja bor", innerCount > 0, `${innerCount} qator`);
    if (innerCount > 0) {
      await inner.first().click();
      await page.waitForTimeout(1800);
      const crumbs = await sheet.locator('nav[aria-label="Zanjir"] button').count();
      check("zanjir (breadcrumb) ko'rinadi", crumbs >= 2, `${crumbs} bo'g'in`);
      await shot(page, "06-drill-level-2");

      // Yozuvlar → tranzaksiya hujjati
      const entryBtn = sheet.locator("ul li button").first();
      if (await entryBtn.count()) {
        await entryBtn.click();
        await page.waitForTimeout(1800);
        const txt = await sheet.innerText();
        check("tranzaksiya hujjati: qo'sh yozuv", /Qo'sh yozuv|Debet|Kredit/.test(txt));
        check("tranzaksiya hujjati: audit", /Audit/.test(txt));
        await shot(page, "07-drill-transaction");
      } else bad("yozuvlar ro'yxati topilmadi");
    }
    await page.keyboard.press("Escape");
  }

  // ── PUL / HISOBLAR (talab 9) ──
  await page.goto(`${APP}/org/finance?tab=cash`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  const cashText = await page.locator("main").innerText();
  check("hisoblar odam tilida", /Naqd|Bank hisobi|Click|Payme/.test(cashText));
  await shot(page, "08-org-cash");

  // ── VAKOLATLAR (talab 7) ──
  await page.goto(`${APP}/org/permissions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  // Vakolatlar ro'yxati ROL TANLANGANDAN KEYIN chiqadi — bu ataylab:
  // "qaysi rol?" savoliga javob bermasdan turib yuzlab kalitni
  // ko'rsatish talab 25 dagi minimalizmga zid bo'lardi.
  const roleBtn = page.locator("main aside button").first();
  check("rollar ro'yxati bor", await roleBtn.count() > 0);
  if (await roleBtn.count()) {
    await roleBtn.click();
    await page.waitForTimeout(1500);
  }
  const permText = await page.locator("main").innerText();
  check("vakolatlar odam tilida", /O'quvchilar|Moliya|Xonalar|Maoshlar/.test(permText),
    permText.slice(0, 90).replace(/\n/g, " "));
  check("xom kalit KO'RSATILMAYDI", !/finance\.view_profitability|students\.read/.test(permText));
  check("ish makoni ko'rsatiladi", /makoniga tushadi/.test(permText));
  await shot(page, "09-org-permissions");

  // ── TAHLIL (talab 4) ──
  await page.goto(`${APP}/org/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const anText = await page.locator("main").innerText();
  const dims = ["O'qituvchi", "Yo'nalish", "Guruh", "Xona", "Filial"].filter((d) => anText.includes(d));
  check("foydalilik kesimlari bitta joyda", dims.length >= 4, dims.join(", "));
  await shot(page, "10-org-analytics");

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
// 2) ADMIN — FILIAL
// ══════════════════════════════════════════════════════════════════
head("2) ADMIN — filial ish makoni");
{
  const { ctx, page } = await newSession();
  const landing = await loginAs(page, "qa_admin_a", "qa123456", { allBranches: false });
  check("login → filial makoni", landing.startsWith("/branch"), landing);

  await page.waitForTimeout(1500);
  const nav = await sidebarItems(page);
  check("sidebar filial tuzilishi", nav.some((n) => n.includes("Bugun")), nav.join(" · "));
  check("TASHKILOT bo'limlari YO'Q",
    !nav.some((n) => n.includes("Filiallar") || n.includes("Vakolatlar")),
    nav.join(" · "));
  await shot(page, "11-branch-today");

  // Tashkilot manziliga urinish — o'z sahifasiga qaytariladi
  await page.goto(`${APP}/org/permissions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("/org/permissions → o'z makoniga qaytdi", !page.url().includes("/org"), page.url().replace(APP, ""));

  // Undirish — direktorning kundalik ishi
  await page.goto(`${APP}/branch/collections`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  check("undirish sahifasi ochildi", page.url().includes("/branch/collections"));
  await shot(page, "12-branch-collections");

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
// 3) XODIM
// ══════════════════════════════════════════════════════════════════
head("3) XODIM — faqat o'z ishi");
{
  const { ctx, page } = await newSession();
  const landing = await loginAs(page, "qa_staff_a", "qa123456", { allBranches: false });
  check("login → ish joyi makoni", landing.startsWith("/work"), landing);

  await page.waitForTimeout(1500);
  const nav = await sidebarItems(page);
  check("MOLIYA bo'limi YO'Q", !nav.some((n) => n.includes("Moliya")), nav.join(" · "));
  check("FILIALLAR bo'limi YO'Q", !nav.some((n) => n.includes("Filiallar")), nav.join(" · "));
  await shot(page, "13-work-home");

  await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("/org → o'z makoniga qaytdi", !page.url().includes("/org"), page.url().replace(APP, ""));

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
// 4) O'QUVCHI
// ══════════════════════════════════════════════════════════════════
head("4) O'QUVCHI — faqat o'zi");
{
  const { ctx, page } = await newSession();
  const landing = await loginAs(page, "demo_student_1", "qa123456", { allBranches: false });
  check("login → o'quvchi makoni", landing.startsWith("/me"), landing);

  await page.waitForTimeout(1500);
  const nav = await sidebarItems(page);
  const own = ["O'qishim", "Jadvalim", "Davomatim", "To'lovlarim"].filter((t) => nav.some((n) => n.includes(t)));
  check("menyu o'quvchi tilida", own.length >= 3, nav.join(" · "));
  check("tashkilot tushunchalari YO'Q",
    !nav.some((n) => /Filial|Moliya|Vakolat|Xodim/.test(n)), nav.join(" · "));
  await shot(page, "14-me-home");

  await page.goto(`${APP}/me/payments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const payText = await page.locator("main").innerText();
  check("to'lov holati ko'rinadi", /Qarzingiz|Oldindan to'lov|Qarzingiz yo'q/.test(payText));
  check("buxgalteriya atamalari YO'Q", !/Debitorlik|Kredit|Hisobvaraq/.test(payText));
  await shot(page, "15-me-payments");

  for (const url of ["/org", "/branch", "/owner/students"]) {
    await page.goto(`${APP}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    check(`${url} → yopiq`, page.url().includes("/me"), page.url().replace(APP, ""));
  }

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
// 5) MOBIL / RESPONSIV (talab 26)
// ══════════════════════════════════════════════════════════════════
head("5) Responsiv — 1440 / 1024 / 820 / 390");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await loginAs(page, "owner", "owner123");
  for (const w of [1440, 1024, 820, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${w}px — gorizontal toshish yo'q`, overflow <= 2, `${overflow}px`);
    await shot(page, `16-responsive-${w}`);
  }
  await ctx.close();
}

// ── KONSOL XATOLARI ──
head("6) Konsol");
const realErrors = consoleErrors.filter((e) =>
  !/favicon|Download the React DevTools|ResizeObserver/.test(e));
check("konsol xatolari yo'q", realErrors.length === 0,
  realErrors.slice(0, 3).join(" | ") || "toza");

await browser.close();

console.log(`\n${"═".repeat(60)}`);
console.log(`NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi`);
if (R.failures.length) {
  console.log("\nMUAMMOLAR:");
  for (const f of R.failures) console.log(`  • ${f}`);
  process.exitCode = 1;
}
console.log(`\nSkrinshotlar: ${SHOTS}\n`);
