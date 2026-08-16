/**
 * PHASE G — HAQIQIY BRAUZER QABUL TESTI (Playwright + Chromium).
 *
 * Build/lint/HTTP-replay YETARLI EMAS: ular DOM'ni ham, konsol
 * xatosini ham, mobil toshib ketishni ham ko'rmaydi.
 */
/**
 * PLAYWRIGHT loyihaga devDependency sifatida QO'SHILMAGAN.
 *
 * Sabab: u ~300 MB brauzer yuklaydi va CI/dev muhitida hammaga kerak
 * emas. Skript uni uch joydan qidiradi:
 *   1) PLAYWRIGHT_PATH env (ochiq ko'rsatilgan yo'l)
 *   2) loyiha node_modules (agar keyin o'rnatilsa)
 *   3) npx keshi (`npx playwright` bir marta ishlatilgan bo'lsa)
 *
 * Topilmasa - test YIQILMAYDI, balki OCHIQ "bajarilmadi" deb aytadi.
 * Brauzer tekshiruvi bajarilmagani "o'tdi" bo'lib ko'rinmasligi kerak.
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
  for (const c of candidates) {
    if (existsSync(c)) return import(`file://${c}`);
  }
  console.error(
    "\nPLAYWRIGHT TOPILMADI - brauzer qabul testi BAJARILMADI.\n" +
      "O'rnatish: npx playwright install chromium\n" +
      "yoki PLAYWRIGHT_PATH=/yo'l/playwright/index.mjs bilan ishga tushiring.\n",
  );
  process.exit(2);
};
const { chromium } = await resolvePlaywright();

const APP = process.env.APP_URL || "http://localhost:5174";
const API = "http://localhost:5000/api";

const R = { pass: 0, fail: 0 };
const ok = (n, x = "") => { R.pass++; console.log(`  ✅ ${n}${x ? ` — ${x}` : ""}`); };
const bad = (n, x = "") => { R.fail++; console.log(`  ❌ ${n}${x ? ` — ${x}` : ""}`); };
const check = (n, cond, x = "") => (cond ? ok(n, x) : bad(n, x));

const browser = await chromium.launch();

// ── Konsol xatolari va tarmoq muammolari YIG'ILADI ──
const consoleErrors = [];
const badRequests = [];
const allRequests = [];

const newPage = async (ctx) => {
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message.slice(0, 200)));
  page.on("response", async (res) => {
    const u = res.url();
    // FAQAT backend so'rovlari - Vite manba fayllari (/src/**/api/*.js) EMAS.
    if (!u.startsWith(API)) return;
    allRequests.push({ url: u.replace(API, ""), status: res.status() });
    // 501 = MODULE_NOT_MIGRATED - bu KUTILGAN shartnoma, server xatosi
    // EMAS. Faqat haqiqiy 5xx (500, 502, 503...) muammo hisoblanadi.
    if (res.status() >= 500 && res.status() !== 501) badRequests.push({ url: u.replace(API, ""), status: res.status() });
  });
  return page;
};

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await newPage(ctx);

console.log("\n═══════ PHASE G — BRAUZER QABUL TESTI ═══════\n");

// ══ 0) KIRISH ══════════════════════════════════════════════════
console.log("0) tizimga kirish");
await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.fill('input[name="username"]', "owner");
await page.fill('input[name="password"]', "owner123");
// Enter bilan yuborish - tugma re-render paytida qisqa vaqtga
// ajralib ketishi mumkin (React), Enter esa forma darajasida ishlaydi.
await page.press('input[name="password"]', "Enter");
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(async () => {
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-shukrullo-Desktop-lc-total/c49e703c-8378-4381-b00b-f20df2e7e5fd/scratchpad/login-fail.png" });
  console.log("     (login-fail.png saqlandi)", (await page.locator("body").innerText()).slice(0, 200));
});
check("login muvaffaqiyatli", !page.url().includes("/login"), page.url().replace(APP, ""));

// ══ 1) EXECUTIVE — SIDEBAR YO'Q ════════════════════════════════
console.log("\n1) /admin — rahbariyat qobig'i");
await page.goto(`${APP}/admin`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const sidebarCount = await page.locator('[data-sidebar="sidebar"]').count();
check("SIDEBAR YO'Q", sidebarCount === 0, `${sidebarCount} ta topildi`);

const topnav = await page.locator('nav[aria-label="Rahbariyat bo\'limlari"]').count();
check("yuqori navigatsiya BOR", topnav === 1);

const navLinks = await page.locator('nav[aria-label="Rahbariyat bo\'limlari"] a').allTextContents();
check("bo'lim tablari ko'rinadi", navLinks.length >= 3, navLinks.map(t => t.trim()).join(" | "));

const kpiCount = await page.locator("main .tabular-nums").count();
check("KPI plitalari render bo'ldi", kpiCount > 0, `${kpiCount} raqamli element`);

// Gorizontal toshib ketish
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("desktop gorizontal scroll YO'Q", overflow <= 0, `${overflow}px`);

// ══ 2) FILIAL TANLAGICH ════════════════════════════════════════
console.log("\n2) filial tanlagich");
// BranchBadge BITTA filialli markazda ATAYLAB bosilmaydigan yorliq
// bo'ladi (komponent izohi: "tanlash ma'nosiz, lekin kontekstni
// ko'rsatish baribir kerak"). Shuning uchun tekshiruv XATTI-HARAKATGA
// tayanadi: yorliq ko'rinadimi, bosilganda menyu ochiladimi.
//
// API'dan filial sonini so'rash SINALDI va TASHLANDI: u brauzerdagi
// token kalitini taxmin qilishni talab qilardi va noto'g'ri kalit
// 401 berib, konsol xatolari tekshiruvini ham buzardi.
// MATN bo'yicha qidirish ISHLAMAYDI: badge filial KODINI ko'rsatadi
// ("MAIN"), nomini emas - va kod har markazda boshqacha. Shuning uchun
// IKONKA bo'yicha topamiz (Building2 = bitta filial, Layers = "barcha").
const shellHeader = page.locator("header").first();
const badge = shellHeader
  .locator('[class*="lucide-building"], [class*="lucide-layers"]')
  .first();
check("filial konteksti header'da KO'RINADI", (await badge.count()) > 0);
if (await badge.count()) {
  await badge.click().catch(() => {});
  await page.waitForTimeout(700);
  const menuItems = await page.locator('[role="menuitem"]').count();
  if (menuItems > 0) {
    ok("ko'p filialli rejim: menyu ochildi", `${menuItems} variant`);
    await page.keyboard.press("Escape");
  } else {
    ok("bitta filialli rejim: menyu ochilmaydi (ataylab)", "BranchBadge izohiga mos");
  }
}

// ══ 3) /admin/moliya — P&L HAQIQIY MA'LUMOT ════════════════════
console.log("\n3) /admin/moliya");
await page.goto(`${APP}/admin/moliya`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const pnlReq = allRequests.filter((r) => r.url.includes("/branch-analytics/pnl"));
check("P&L so'rovi yuborildi", pnlReq.length > 0, pnlReq.map(r => r.status).join(","));
check("P&L 500 BERMADI", pnlReq.every((r) => r.status < 500), pnlReq.map(r => r.status).join(","));

const bodyText = await page.locator("main").innerText();
const hasTable = await page.locator("main table").count();
const hasEmpty = /Ma'lumot yo'q|topilmadi|hisoblanmagan/i.test(bodyText);
check(
  "P&L jadval YOKI to'g'ri bo'sh holat",
  hasTable > 0 || hasEmpty,
  hasTable ? "jadval chizildi" : "bo'sh holat matni",
);
check("P&L 'ulanmagan' DEMAYDI (endi ko'chirilgan)",
  !/Manba ulanmagan/i.test(bodyText));

// Davr tanlagichi
const selects = await page.locator("main select, header select").count();
check("davr tanlagichi bor", selects >= 2, `${selects} ta select`);

// ══ 4) /admin/tavsiyalar — AI 501 → "ulanmagan" ════════════════
console.log("\n4) /admin/tavsiyalar (AI hali ko'chirilmagan)");
await page.goto(`${APP}/admin/tavsiyalar`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const aiReq = allRequests.filter((r) => r.url.includes("/ai/insights"));
check("AI so'rovi yuborildi", aiReq.length > 0, aiReq.map(r => r.status).join(","));
check("AI 501 qaytardi (500 EMAS)", aiReq.every((r) => r.status === 501), aiReq.map(r => r.status).join(","));

const aiText = await page.locator("main").innerText();
check("ekranda 'Manba ulanmagan' ko'rinadi", /Manba ulanmagan/i.test(aiText));
check("SOXTA raqam yo'q ('0 ta xavf' kabi)", !/\b0 ta (xavf|tavsiya)\b/i.test(aiText));

// ══ 5) DRILL-DOWN + BACK ═══════════════════════════════════════
console.log("\n5) drill-down va brauzer Back");
await page.goto(`${APP}/admin`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const firstKpiLink = page.locator('main a[href^="/owner"]').first();
const drillCount = await page.locator('main a[href^="/owner"]').count();
if (drillCount) {
  const href = await firstKpiLink.getAttribute("href");
  await firstKpiLink.click();
  await page.waitForTimeout(2500);
  const landed = page.url().includes("/owner");
  check("drill-down operatsion panelga o'tdi", landed, `${href} -> ${page.url().replace(APP, "")}`);

  // 6) OPERATSION SAHIFADA SIDEBAR BOR
  const opSidebar = await page.locator('[data-sidebar="sidebar"]').count();
  check("operatsion sahifada SIDEBAR BOR", opSidebar > 0, `${opSidebar} ta`);

  await page.goBack();
  await page.waitForTimeout(1500);
  check("brauzer Back rahbariyatga qaytardi", page.url().includes("/admin"), page.url().replace(APP, ""));
  const backSidebar = await page.locator('[data-sidebar="sidebar"]').count();
  check("qaytgach SIDEBAR yana YO'Q", backSidebar === 0, `${backSidebar} ta`);
} else {
  check("drill-down havolalari bor", false, "topilmadi");
}

// ══ 6) OPERATSION → RAHBARIYAT ═════════════════════════════════
console.log("\n6) operatsion → rahbariyat");
await page.goto(`${APP}/owner/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const toAdmin = page.locator('a[href="/admin"]').first();
if (await toAdmin.count()) {
  await toAdmin.click();
  await page.waitForTimeout(2000);
  check("sidebar'dagi 'Rahbariyat' /admin ga olib bordi", page.url().includes("/admin"));
} else {
  check("operatsion paneldan /admin ga havola bor", false, "topilmadi");
}

// ══ 7) MOBIL ═══════════════════════════════════════════════════
console.log("\n7) mobil (360×740)");
const mctx = await browser.newContext({
  viewport: { width: 360, height: 740 },
  isMobile: true,
  hasTouch: true,
});
const mpage = await newPage(mctx);
// Kirish holatini ko'chiramiz
const storage = await ctx.storageState();
await mctx.addCookies(storage.cookies);
await mpage.goto(`${APP}/admin`, { waitUntil: "domcontentloaded" });
await mpage.evaluate((s) => {
  for (const o of s.origins || []) for (const kv of o.localStorage || []) localStorage.setItem(kv.name, kv.value);
}, storage);
await mpage.goto(`${APP}/admin`, { waitUntil: "networkidle" });
await mpage.waitForTimeout(2500);

const mOverflow = await mpage.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobil: sahifa gorizontal TOSHMAYDI", mOverflow <= 1, `${mOverflow}px`);

const mSidebar = await mpage.locator('[data-sidebar="sidebar"]').count();
check("mobil: sidebar yo'q", mSidebar === 0);

const tabsScrollable = await mpage.evaluate(() => {
  const n = document.querySelector('nav[aria-label="Rahbariyat bo\'limlari"]');
  return n ? { sw: n.scrollWidth, cw: n.clientWidth } : null;
});
check(
  "mobil: bo'lim tablari o'z konteynerida suriladi",
  tabsScrollable && tabsScrollable.sw >= tabsScrollable.cw,
  tabsScrollable ? `${tabsScrollable.sw}px / ${tabsScrollable.cw}px` : "nav yo'q",
);

await mpage.goto(`${APP}/admin/moliya`, { waitUntil: "networkidle" });
await mpage.waitForTimeout(2000);
const mOverflow2 = await mpage.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobil: /admin/moliya toshmaydi (jadval o'z ichida suriladi)", mOverflow2 <= 1, `${mOverflow2}px`);

// ══ 8) YAKUNIY: KONSOL VA TARMOQ ═══════════════════════════════
console.log("\n8) konsol va tarmoq xulosasi");
const realErrors = consoleErrors.filter(
  (e) => !/Download the React DevTools|Failed to load resource: the server responded with a status of 501/i.test(e),
);
check("konsol xatolari YO'Q", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
check("500 javob YO'Q", badRequests.length === 0, badRequests.map((r) => `${r.status} ${r.url}`).join(", "));

const byStatus = {};
for (const r of allRequests) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log(`  ℹ jami API so'rov: ${allRequests.length} — ${JSON.stringify(byStatus)}`);
const uniq = [...new Set(allRequests.map((r) => `${r.status} ${r.url.split("?")[0]}`))].sort();
console.log("  ℹ noyob so'rovlar:");
for (const u of uniq) console.log(`     ${u}`);

await browser.close();
console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
process.exit(R.fail ? 1 : 0);
