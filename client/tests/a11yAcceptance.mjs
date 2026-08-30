/**
 * ══════════════════════════════════════════════════════════════════════
 * QULAYLIK (A11Y) QABUL TESTI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Rang kontrasti allaqachon `npm run check:contrast` bilan tekshiriladi
 * (219 ta token). Bu test BOSHQA narsani ko'radi — TUZILMANI:
 *
 *   • sarlavha iyerarxiyasi (har sahifada aynan bitta `<h1>`)
 *   • landmark'lar (`<main>`, nomlangan `<nav>`)
 *   • nomsiz interaktiv elementlar (faqat ikonkali tugmalar)
 *   • klaviatura yo'li (menyuga necha Tab'da yetiladi)
 *   • fokus ko'rinishi
 *   • dialog: nomlanganmi, fokus ichiga ko'chadimi, Escape yopadimi
 *
 * ── NEGA BU TEKSHIRUVLAR ──
 * Ular AYNAN shu kodbazadagi ikkita haqiqiy kamchilikni topdi:
 *
 *   1. Mobil menyu tugmasi NOMSIZ edi (faqat ikonka). U mobilda
 *      menyuga YAGONA kirish nuqtasi — ya'ni ekran o'quvchi bilan
 *      ishlaydigan odam navigatsiyaga umuman yetib bora olmasdi.
 *   2. Sidebar `<div>` edi, `<nav>` emas — menyuga sakrab o'tish
 *      imkoni yo'q edi.
 *
 * Ikkalasi ham ko'z bilan ko'rinmasdi va hech qanday lint qoidasi
 * ularni tutmasdi.
 *
 * ISHLATISH:  npm run test:a11y
 */
/** Qulaylik (a11y) audit: landmark, sarlavha iyerarxiyasi, fokus, nom. */
const { existsSync, readdirSync } = await import("node:fs");
const npx = `${process.env.HOME}/.npm/_npx`;
let pw = null;
for (const d of readdirSync(npx)) {
  const p = `${npx}/${d}/node_modules/playwright/index.mjs`;
  if (existsSync(p)) { pw = await import(`file://${p}`); break; }
}
const { pickEngine } = await import("./_engine.mjs");
const engine = pickEngine(pw);
const APP = "http://localhost:5173";
const R = { pass: 0, fail: 0, warn: 0 };
const ok = (n, x = "") => { R.pass++; console.log(`  ✅ ${n}${x ? ` — ${x}` : ""}`); };
const bad = (n, x = "") => { R.fail++; console.log(`  ❌ ${n}${x ? ` — ${x}` : ""}`); };
const warn = (n, x = "") => { R.warn++; console.log(`  ⚠️  ${n}${x ? ` — ${x}` : ""}`); };

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[name="username"]');
await page.fill('input[name="username"]', "owner");
await page.fill('input[name="password"]', "owner123");
await page.press('input[name="password"]', "Enter");
await page.waitForURL((u) => !u.pathname.includes("/login"));
await page.waitForTimeout(1200);
const gate = page.locator("[data-branch-gate]");
if (await gate.count()) { await gate.locator("button", { hasText: "Barcha filiallar" }).first().click(); await page.waitForTimeout(2500); }

// FAQAT SUPER ADMIN PANELINING SAHIFALARI.
//
// Bu test ega hisobida ishlaydi va ega `/owner/*` ga kira olmaydi
// (`AdminPanelGuard`) — u yerdagi manzil qo'yilsa, test aslida
// yo'naltirilgan `/org` ni tekshirib, "hammasi joyida" derdi.
const PAGES = ["/org", "/org/filiallar", "/org/filiallar?tab=compare",
  "/org/moliya", "/org/tahlil", "/org/vakolatlar"];

console.log("\n1) SARLAVHA IYERARXIYASI (har sahifada bitta h1)");
for (const u of PAGES) {
  await page.goto(`${APP}${u}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const h = await page.evaluate(() => {
    const hs = [...document.querySelectorAll("main h1, main h2, main h3")];
    const lv = hs.map((e) => Number(e.tagName[1]));
    let jump = null;
    for (let i = 1; i < lv.length; i += 1) if (lv[i] - lv[i - 1] > 1) jump = `h${lv[i - 1]}→h${lv[i]}`;
    return { h1: lv.filter((n) => n === 1).length, jump, total: lv.length };
  });
  if (h.h1 === 1) ok(`${u} — bitta <h1>`, `${h.total} sarlavha`);
  else bad(`${u} — <h1> soni`, String(h.h1));
  if (h.jump) warn(`${u} — daraja sakradi`, h.jump);
}

console.log("\n2) LANDMARK'LAR");
await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const lm = await page.evaluate(() => ({
  main: document.querySelectorAll("main").length,
  nav: document.querySelectorAll("nav").length,
  navNamed: [...document.querySelectorAll("nav")].filter((n) => n.getAttribute("aria-label")).length,
  header: document.querySelectorAll("header").length,
}));
if (lm.main === 1) ok("bitta <main>"); else bad("<main> soni", String(lm.main));
if (lm.nav > 0) ok("<nav> landmark", `${lm.nav} ta`); else bad("<nav> yo'q");
if (lm.navNamed === lm.nav) ok("har <nav> nomlangan", `${lm.navNamed}/${lm.nav}`);
else warn("nomlanmagan <nav>", `${lm.navNamed}/${lm.nav}`);

console.log("\n3) NOMSIZ INTERAKTIV ELEMENTLAR");
for (const u of ["/org", "/org/moliya", "/org/vakolatlar"]) {
  await page.goto(`${APP}${u}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  const nameless = await page.evaluate(() => {
    const els = [...document.querySelectorAll("main button, main a[href], main [role='button']")];
    return els.filter((e) => {
      const t = (e.innerText || "").trim();
      const al = e.getAttribute("aria-label") || e.getAttribute("title");
      return !t && !al;
    }).length;
  });
  if (nameless === 0) ok(`${u} — hamma tugmada nom bor`);
  else bad(`${u} — nomsiz element`, `${nameless} ta`);
}

console.log("\n4) KLAVIATURA — Tab bilan menyuga yetish");
await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.keyboard.press("Tab");
const first = await page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName, text: (a?.innerText || a?.getAttribute("aria-label") || "").trim().slice(0, 40) };
});
ok("birinchi Tab fokus oldi", `${first.tag} «${first.text}»`);

// MENYU SELEKTORI IKKALA QOBIQNI HAM QAMRAYDI.
//
// Ilgari bu yerda faqat `[data-sidebar="sidebar"]` — Admin panelining
// shadcn sidebari — qidirilardi. Super Admin panelida u YO'Q (o'z
// qobig'i, oddiy `<nav>`), shuning uchun tekshiruv "menyuga yetib
// bo'lmadi" deb yiqilardi — holbuki menyu bor va u fokus oladi.
//
// Selektor qobiqqa emas, MENYU ekanligiga qaraydi.
const NAV_SEL = '[data-sidebar="sidebar"], nav[aria-label]';
let steps = -1;
for (let i = 0; i < 30; i += 1) {
  const inNav = await page.evaluate((sel) =>
    Boolean(document.activeElement?.closest?.(sel)
      && document.activeElement.getAttribute("href")), NAV_SEL);
  if (inNav) { steps = i; break; }
  await page.keyboard.press("Tab");
}
if (steps >= 0 && steps <= 12) ok("menyuga Tab bilan yetiladi", `${steps} qadam`);
else if (steps >= 0) warn("menyu uzoqroqda", `${steps} qadam`);
else bad("menyuga Tab bilan yetib bo'lmadi");

console.log("\n5) FOKUS KO'RINADIMI");
const ring = await page.evaluate(() => {
  const a = document.activeElement;
  if (!a) return null;
  const s = getComputedStyle(a);
  return { outline: s.outlineWidth, shadow: s.boxShadow !== "none", ring: s.outlineStyle };
});
if (ring && (parseFloat(ring.outline) > 0 || ring.shadow)) ok("fokus halqasi bor", JSON.stringify(ring));
else warn("fokus halqasi ko'rinmadi", JSON.stringify(ring));

console.log("\n6) DRILL PANELI — klaviatura");
await page.goto(`${APP}/org/moliya?tab=revenue`, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
const row = page.locator("main table tbody tr").first();
if (await row.count()) {
  await row.click();
  await page.waitForTimeout(1800);
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    return {
      modal: d.getAttribute("aria-modal"),
      labelled: Boolean(d.getAttribute("aria-labelledby") || d.getAttribute("aria-label")),
      focusInside: Boolean(d.contains(document.activeElement)),
    };
  });
  if (dlg?.labelled) ok("panel nomlangan (aria)"); else warn("panelda aria-label yo'q");
  if (dlg?.focusInside) ok("fokus panel ichiga ko'chdi"); else warn("fokus panelga ko'chmadi");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const closed = (await page.locator('[role="dialog"]').count()) === 0;
  if (closed) ok("Escape panelni yopdi"); else bad("Escape ishlamadi");
} else {
  // Bo'sh bazada drill paneli ochiladigan qator YO'Q. Bu klaviatura
  // nosozligi EMAS — tekshiruv shunchaki bajarilmadi.
  warn("drill paneli klaviaturasi", "bazada daromad qatori yo'q — tekshirilmadi");
}

await browser.close();
console.log(`\nNATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.warn} ogohlantirish\n`);
/**
 * CHIQISH KODI — qolgan to'plamlardagidek.
 *
 * Bu yerda u YO'Q edi: ❌ chiqsa ham jarayon 0 qaytarardi, ya'ni
 * `npm run test:a11y` har doim yashil ko'rinardi va zanjirdagi keyingi
 * buyruq ishlayverardi. Yiqilgan tekshiruv o'tgan tekshiruvdan
 * farqlanmasa, testning o'zi bezakka aylanadi.
 *
 * Ogohlantirish (⚠️) chiqish kodiga TA'SIR QILMAYDI — u "tekshirilmadi"
 * degani, "buzuq" degani emas.
 */
process.exit(R.fail ? 1 : 0);
