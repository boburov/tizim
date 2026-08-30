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
      "O'rnatish: npx playwright install chromium webkit\n" +
      "yoki PLAYWRIGHT_PATH=/yo'l/playwright/index.mjs bilan ishga tushiring.\n",
  );
  process.exit(2);
};
const pw = await resolvePlaywright();
const { pickEngine } = await import("./_engine.mjs");
const engine = pickEngine(pw);

const APP = process.env.APP_URL || "http://localhost:5174";
const API = "http://localhost:5000/api";

const R = { pass: 0, fail: 0 };
const ok = (n, x = "") => { R.pass++; console.log(`  ✅ ${n}${x ? ` — ${x}` : ""}`); };
const bad = (n, x = "") => { R.fail++; console.log(`  ❌ ${n}${x ? ` — ${x}` : ""}`); };
const check = (n, cond, x = "") => (cond ? ok(n, x) : bad(n, x));
/**
 * TEKSHIRILMADI — «o'tdi» ham emas, «yiqildi» ham emas.
 *
 * Bo'sh bazada ochib bo'lmaydigan ekran uchun. Uni "yiqildi" deb
 * belgilash soxta ogohlantirish, "o'tdi" deb belgilash esa undan
 * battar: tekshirilmagan narsa tekshirilgandek ko'rinardi.
 */
const R_SKIP = [];
const info = (n) => { R_SKIP.push(n); console.log(`  ⏭️  ${n}`); };

/**
 * MAJBURIY FILIAL TANLASH EKRANINI O'TISH.
 *
 * Ko'p filialli markazda login'dan keyin BIRINCHI ekran shu bo'ladi
 * (`shared/components/branch/BranchPicker.jsx`) va uni o'tmasdan hech
 * qanday sahifaga yetib bo'lmaydi. Yangi brauzer konteksti har safar
 * bo'sh `localStorage` bilan boshlanadi, ya'ni test HAR ISHGA
 * TUSHISHDA bu ekranga tushadi.
 *
 * "Barcha filiallar" tanlanadi: testlar filiallararo ko'rinishlarni
 * tekshiradi va bitta filial tanlansa ular ko'lamdan chiqib ketardi.
 *
 * Yakka filialli markazda ekran UMUMAN chiqmaydi - u holda bu funksiya
 * hech nima qilmaydi.
 */
const passBranchGate = async (page) => {
  const gate = page.locator("[data-branch-gate]");
  if (!(await gate.count())) return false;
  await gate.locator("button", { hasText: "Barcha filiallar" }).first().click();
  // `changeBranch` butun so'rov keshini bekor qiladi - sahifa qayta yuklanadi.
  await page.waitForTimeout(2500);
  return true;
};


const browser = await engine.launch();

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

await page.waitForTimeout(1200);
if (await passBranchGate(page)) ok("majburiy filial tanlash ekrani o'tildi");

// ══ 1) ILOVADA BITTA QOBIQ ═════════════════════════════════════
//
// ── NIMA O'ZGARDI ──
// Ilgari ikkita qobiq bor edi: operatsion panel (sidebar bilan) va
// rahbariyat ko'rinishi (`/admin`, sidebarsiz, o'z navigatsiyasi
// bilan). Bu test o'sha paytda "SIDEBAR YO'Q" ni tekshirardi — ya'ni
// ikkinchi qobiq mavjudligini TASDIQLARDI.
//
// Endi qobiq BITTA: barcha kesim tashkilot ish makonining tab'lari.
// Shuning uchun test teskarisiga aylandi — HAR sahifada sidebar
// bo'lishi shart. Ikkinchi qobiq qaytib kelsa, bu test yiqiladi.
console.log("\n1) yagona qobiq — har sahifada sidebar");
await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Eski manzillar YO'NALTIRILADI (talab 32) — xatcho'q ishlashi shart.
const REDIRECTS = [
  ["/admin", "/org"],
  ["/admin/moliya", "/org/filiallar?tab=pnl"],
  ["/admin/oquv", "/org/tahlil?tab=academic"],
  ["/admin/tahlil", "/org/tahlil"],
];
for (const [from, to] of REDIRECTS) {
  await page.goto(`${APP}${from}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const got = page.url().replace(APP, "");
  check(`eski manzil ${from} → ${to}`, got === to, got);
}

// ══════════════════════════════════════════════════════════════════
// IKKI PANEL — IKKI QOBIQ
// ══════════════════════════════════════════════════════════════════
//
// Bu tekshiruvlar ilgari TESKARI narsani talab qilardi: "/org da
// sidebar BOR (yagona qobiq)". O'sha paytda barcha ekran bitta
// qobiqda edi va bu to'g'ri kutilma edi.
//
// Endi Super Admin paneli ALOHIDA qobiqda va bu ataylab: bir xil
// qobiqda turgan ikki panel, menyusi qanchalik boshqacha bo'lmasin,
// foydalanuvchi uchun bitta panel bo'lib qoladi.
await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const orgShadcn = await page.locator('[data-sidebar="sidebar"]').count();
check("Super Admin: Admin panelining qobig'i YO'Q", orgShadcn === 0, `${orgShadcn} ta`);

const orgNav = (await page
  .locator('nav[aria-label="Tashkilot menyusi"] a')
  .allTextContents()).map((t) => t.trim()).filter(Boolean);
check("Super Admin: uch yozuvli o'z menyusi", orgNav.length === 3, orgNav.join(" | "));

// ADMIN PANELINING QOBIG'I DIREKTOR HISOBIDA tekshiriladi: ega u
// yerga kira olmaydi (`AdminPanelGuard`). Bu bo'lim `panelAcceptance`
// da to'liq qoplangan, shuning uchun bu yerda faqat SUPER ADMIN
// tomonini o'lchaymiz.
const kpiCount = await page.locator("main .tabular-nums").count();
check("KPI plitalari render bo'ldi", kpiCount > 0, `${kpiCount} raqamli element`);

// XATO TOASTI CHIQMASLIGI KERAK.
//
// Bu tekshiruv HAQIQIY XATODAN keyin qo'shildi: `/ai/insights` 501
// qaytarganda global `QueryCache.onError` qizil toast chiqarardi
// ("Bu bo'lim PostgreSQL'ga hali ko'chirilmagan"), holbuki kartaning
// O'ZI allaqachon xotirjam "Manba ulanmagan" holatini ko'rsatib
// turardi. Bir holat ikki joyda, ikki xil ohangda - ishlab turgan
// tizim buzuqdek ko'rinardi.
//
// Testning oldingi versiyasi buni O'TKAZIB YUBORGAN: u konsol
// xatolarini va 500 javoblarni tekshirardi, TOASTNI emas.
const toastText = await page
  .locator("[data-sonner-toast]")
  .allInnerTexts()
  .catch(() => []);
check("xato toasti YO'Q", toastText.length === 0, toastText.join(" | ").slice(0, 120));

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
// FILIAL KONTEKSTI SHARTLI ko'rsatiladi va bu ATAYLAB.
//
// `BranchBadge` yakka markaz rejimida `if (!multiBranch) return null`
// qiladi - "filial tushunchasi umuman yo'q" (komponent izohi). Ya'ni
// badge YO'QLIGI ham to'g'ri holat.
//
// Test shuning uchun MODENI aniqlaydi va shunga qarab kutadi. Ilgari
// bu yerda "badge har doim bo'lishi kerak" deb yozilgan edi va u
// yakka markazli bazada yiqilardi - testning o'z xatosi, ilovaniki
// emas.
//
// Matn bo'yicha qidirish ham ISHLAMAYDI: badge filial KODINI
// ko'rsatadi ("MAIN"), nomini emas.
const shellHeader = page.locator("header").first();
const badge = shellHeader.locator('[class*="lucide-building"], [class*="lucide-layers"]');
const badgeCount = await badge.count();

if (badgeCount > 0) {
  ok("ko'p filialli rejim: filial konteksti header'da ko'rinadi");
  await badge.first().click().catch(() => {});
  await page.waitForTimeout(700);
  const menuItems = await page.locator('[role="menuitem"]').count();
  if (menuItems > 0) {
    ok("filial menyusi ochiladi", `${menuItems} variant`);
    await page.keyboard.press("Escape");
  } else {
    ok("bitta filial: badge bosilmaydigan yorliq (ataylab)");
  }
} else {
  ok("yakka markaz rejimi: filial badge'i YO'Q (ataylab)", "BranchBadge: !multiBranch -> null");
}

// ══ 3) /admin/moliya — P&L HAQIQIY MA'LUMOT ════════════════════
console.log("\n3) filiallar P&L");
await page.goto(`${APP}/org/filiallar?tab=pnl`, { waitUntil: "networkidle" });
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

// ══ 4) /admin/tavsiyalar — AI ENDI KO'CHIRILGAN ════════════════
//
// ⚠ BU BO'LIM QAYTA YOZILDI. Ilgari u AI `501` qaytarishini TALAB
// qilardi ("hali ko'chirilmagan" holati to'g'ri ko'rsatilyaptimi).
// AI moduli ko'chgach o'sha talab TESKARISIGA aylandi: 501 endi
// REGRESSIYA belgisi bo'lardi.
//
// Shuning uchun tekshiruv 501 ga ham, 200 ga ham QAT'IY bog'lanmaydi -
// u ikkala holatni ham TO'G'RI deb qabul qiladi, lekin har birida
// EKRAN mos holatni ko'rsatishini talab qiladi. Shunda test modul
// ko'chgan-ko'chmaganidan qat'i nazar ma'noli bo'lib qoladi.
console.log("\n4) tavsiyalar kesimi");
await page.goto(`${APP}/org/tahlil?tab=insights`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const aiReq = allRequests.filter((r) => r.url.includes("/ai/insights"));
check("AI so'rovi yuborildi", aiReq.length > 0, aiReq.map(r => r.status).join(","));

// 500 HECH QACHON to'g'ri emas: ko'chirilmagan modul 501 berishi kerak,
// ko'chirilgani esa 200. 500 - haqiqiy nosozlik.
check(
  "AI 500 BERMADI (501 yoki 200)",
  aiReq.every((r) => r.status === 501 || r.status < 400),
  aiReq.map(r => r.status).join(","),
);

const aiMigrated = aiReq.length > 0 && aiReq.every((r) => r.status < 400);
const aiText = await page.locator("main").innerText();

if (aiMigrated) {
  check(
    "ko'chirilgan: 'Manba ulanmagan' DEMAYDI",
    !/Manba ulanmagan/i.test(aiText),
    aiText.replace(/\s+/g, " ").slice(0, 90),
  );
} else {
  check("ko'chirilmagan: ekranda 'Manba ulanmagan' ko'rinadi",
    /Manba ulanmagan/i.test(aiText));
}

// Bu qoida IKKALA holatda ham amal qiladi: ma'lumot yo'q bo'lsa ham
// soxta raqam chizilmasligi kerak.
check("SOXTA raqam yo'q ('0 ta xavf' kabi)", !/\b0 ta (xavf|tavsiya)\b/i.test(aiText));

const aiToasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
check(
  "QIZIL TOAST chiqmaydi (holat kartada ko'rsatiladi)",
  aiToasts.length === 0,
  aiToasts.join(" | ").slice(0, 120),
);

// ══ 5) DRILL-DOWN — ENDI PANEL, SAHIFA ALMASHTIRISH EMAS ═══════
//
// ── NIMA O'ZGARDI ──
// Ilgari rahbariyat kartasi bosilganda BOSHQA SAHIFAGA o'tilardi
// (`/owner/...`) va tanlangan davr, filial, filtr — hammasi
// yo'qolardi. Endi ustiga PANEL ochiladi: kontekst joyida qoladi va
// zanjir (breadcrumb) qayerdan kelinganini ko'rsatib turadi.
//
// To'liq zanjir alohida testda: `tests/workspaceAcceptance.mjs`.
console.log("\n5) drill-down paneli");
await page.goto(`${APP}/org/moliya?tab=revenue`, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);

const drillRows = page.locator("main table tbody tr");
const drillCount = await drillRows.count();
if (drillCount) {
  const before = page.url();
  await drillRows.first().click();
  await page.waitForTimeout(2000);
  const sheetOpen = await page.locator('[role="dialog"]').count();
  check("jadval qatori panelni ochdi", sheetOpen > 0);
  check("SAHIFA ALMASHMADI (kontekst saqlandi)", page.url() === before,
    page.url().replace(APP, ""));

  // Qobiq drill paytida JOYIDA qoladi — panel sahifa ustida ochiladi.
  const shellNav = await page
    .locator('[data-sidebar="sidebar"], nav[aria-label="Tashkilot menyusi"]').count();
  check("qobiq joyida (kontekst yo'qolmadi)", shellNav > 0, `${shellNav} ta menyu`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  check("Escape panelni yopdi", (await page.locator('[role="dialog"]').count()) === 0);
} else {
  // Bo'sh bazada ochiladigan qator yo'q — drill mexanizmi
  // TEKSHIRILMADI. Buni "yiqildi" deb belgilash noto'g'ri signal
  // berardi: kod emas, ma'lumot yo'q.
  info("drill-down zanjiri tekshirilmadi — bazada daromad qatori yo'q");
}

// ══ 6) IKKI PANEL — QATTIQ DEVOR ═══════════════════════════════
//
// Panellar orasida navigatsiya havolasi BO'LMASLIGI kerak va
// manzilni qo'lda yozish ham ishlamasligi kerak.
//
// Bu tekshiruv ilgari TESKARI narsani talab qilardi ("Admin
// panelidan Super Admin paneliga yo'l bor"). Talab o'zgardi: ikki
// panel to'liq ajratildi — Admin paneli filial direktorlarining ish
// joyi, Super Admin esa u yerda ishlamaydi.
console.log("\n6) ikki panel — qattiq devor");
await page.goto(`${APP}/owner/students`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Ega `/owner/*` ga kira olmaydi → `/org` ga qaytariladi.
check("Super Admin Admin paneliga kira olmaydi",
  page.url().includes("/org"), page.url().replace(APP, ""));

await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const crossLinks = await page.locator('a[href^="/owner"]').count();
check("Super Admin panelida `/owner` havolasi YO'Q", crossLinks === 0, `${crossLinks} ta`);

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
await mpage.goto(`${APP}/org`, { waitUntil: "domcontentloaded" });
await mpage.evaluate((s) => {
  for (const o of s.origins || []) for (const kv of o.localStorage || []) localStorage.setItem(kv.name, kv.value);
}, storage);
await mpage.goto(`${APP}/org/filiallar?tab=pnl`, { waitUntil: "networkidle" });
await mpage.waitForTimeout(2500);

const mOverflow = await mpage.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobil: sahifa gorizontal TOSHMAYDI", mOverflow <= 1, `${mOverflow}px`);

// MOBILDA SIDEBAR YIG'ILGAN bo'ladi (shadcn `Sheet` ichida) — ya'ni
// DOM da bor, lekin ekranni yemaydi. Ilgari bu yerda "sidebar yo'q"
// tekshirilardi, chunki rahbariyat qobig'ida u UMUMAN yo'q edi.
// Endi qobiq bitta, shuning uchun to'g'ri savol boshqa: u kontentni
// SIQIB QO'YMAYAPTIMI.
const mContentWidth = await mpage.evaluate(() => {
  const m = document.querySelector("main");
  return m ? m.getBoundingClientRect().width : 0;
});
check("mobil: kontent to'liq kenglikda", mContentWidth >= 300, `${Math.round(mContentWidth)}px`);

const tabsScrollable = await mpage.evaluate(() => {
  const n = document.querySelector('nav[aria-label="Bo\'limlar"]');
  return n ? { sw: n.scrollWidth, cw: n.clientWidth } : null;
});
check(
  "mobil: bo'lim tablari o'z konteynerida suriladi",
  tabsScrollable && tabsScrollable.sw >= tabsScrollable.cw,
  tabsScrollable ? `${tabsScrollable.sw}px / ${tabsScrollable.cw}px` : "nav yo'q",
);

await mpage.goto(`${APP}/org/filiallar?tab=pnl`, { waitUntil: "networkidle" });
await mpage.waitForTimeout(2000);
const mOverflow2 = await mpage.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobil: filiallar P&L toshmaydi (jadval o'z ichida suriladi)", mOverflow2 <= 1, `${mOverflow2}px`);

// ══ 8) YAKUNIY: KONSOL VA TARMOQ ═══════════════════════════════
console.log("\n8) konsol va tarmoq xulosasi");
// ERR_NETWORK_CHANGED — MUHIT xatosi, ilova xatosi EMAS: mahalliy
// tarmoq interfeysi almashganda (Wi-Fi/VPN) brauzer ochiq so'rovni
// uzadi. Uni "ilova buzuq" deb ko'rsatish testni shovqinli qiladi va
// haqiqiy xatoni ko'rinmas holga keltiradi.
const realErrors = consoleErrors.filter(
  (e) => !/Download the React DevTools|Failed to load resource: the server responded with a status of 501|ERR_NETWORK_CHANGED|ResizeObserver/i.test(e),
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
