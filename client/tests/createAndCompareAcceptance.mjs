/**
 * BRAUZER QABUL TESTI — YARATISH TUGMASI + FILIALLAR KESIMI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA ALOHIDA FAYL
 *
 * `browserAcceptance.mjs` QOBIQNI tekshiradi (sidebar bor/yo'q,
 * drill-down, mobil). Bu yerdagi talab esa XATTI-HARAKAT: "ikki marta
 * bosib o'tirmasin". Uni faqat haqiqiy brauzerda, haqiqiy
 * `localStorage` bilan tekshirib bo'ladi - build ham, unit test ham
 * "eslab qoldimi?" degan savolga javob bermaydi.
 * ═══════════════════════════════════════════════════════════════════
 */
const resolvePlaywright = async () => {
  const { existsSync, readdirSync } = await import("node:fs");
  const candidates = [];
  if (process.env.PLAYWRIGHT_PATH) candidates.push(process.env.PLAYWRIGHT_PATH);
  candidates.push(
    new URL("../node_modules/playwright/index.mjs", import.meta.url).pathname,
  );
  const npx = `${process.env.HOME}/.npm/_npx`;
  if (existsSync(npx)) {
    for (const d of readdirSync(npx)) {
      const p = `${npx}/${d}/node_modules/playwright/index.mjs`;
      if (existsSync(p)) candidates.push(p);
    }
  }
  for (const c of candidates) if (existsSync(c)) return import(`file://${c}`);
  console.error(
    "\nPLAYWRIGHT TOPILMADI - brauzer testi BAJARILMADI.\n" +
      "O'rnatish: npx playwright install chromium\n",
  );
  process.exit(2);
};
const { chromium } = await resolvePlaywright();

const APP = process.env.APP_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://localhost:5000/api";

const R = { pass: 0, fail: 0 };
const ok = (n, x = "") => { R.pass++; console.log(`  ✅ ${n}${x ? ` — ${x}` : ""}`); };
const bad = (n, x = "") => { R.fail++; console.log(`  ❌ ${n}${x ? ` — ${x}` : ""}`); };
const check = (n, cond, x = "") => (cond ? ok(n, x) : bad(n, x));

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


const browser = await chromium.launch();
const consoleErrors = [];
const badRequests = [];
const allRequests = [];

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message.slice(0, 200)));
// MARKAZ REJIMI `/auth/me` javobidan olinadi.
//
// Kutilayotgan natija bazaga BOG'LIQ: yakka filialli markazda
// "Filiallar" bo'limi ATAYLAB ko'rinmaydi (`multiBranchOnly`), ya'ni
// uni shartsiz talab qilish testning O'Z xatosi bo'lardi.
let multiBranch = null;
page.on("response", async (res) => {
  const u = res.url();
  if (!u.startsWith(API)) return;
  allRequests.push({ url: u.replace(API, ""), status: res.status() });
  if (u.includes("/auth/me") && res.status() === 200) {
    const body = await res.json().catch(() => null);
    if (body) multiBranch = body?.data?.multiBranch !== false;
  }
  // 501 = MODULE_NOT_MIGRATED - kutilgan shartnoma, server nosozligi emas.
  if (res.status() >= 500 && res.status() !== 501) {
    badRequests.push({ url: u.replace(API, ""), status: res.status() });
  }
});

console.log("\n═══ YARATISH TUGMASI + FILIALLAR KESIMI ═══\n");

// ══ 0) KIRISH VA EGA UCHUN DEFAULT SAHIFA ══════════════════════
console.log("0) kirish");
await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.fill('input[name="username"]', "owner");
await page.fill('input[name="password"]', "owner123");
await page.press('input[name="password"]', "Enter");
await page
  .waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 })
  .catch(() => {});
check("login muvaffaqiyatli", !page.url().includes("/login"), page.url().replace(APP, ""));

await page.waitForTimeout(1200);
if (await passBranchGate(page)) ok("majburiy filial tanlash ekrani o'tildi", "Barcha filiallar");

// EGA UCHUN DEFAULT — `/org` (TASHKILOT ISH MAKONI).
//
// ── NEGA `/admin` EMAS ──
// Bosh sahifa endi ROL SOZLAMASIDAN (`Role.defaultPath`) emas, ISH
// MAKONIDAN aniqlanadi va u RUXSATLARDAN hisoblanadi
// (`shared/workspaces/workspaces.js`). Sabab: `defaultPath` — bir
// marta yozilib qoladigan satr, ruxsatlar esa o'zgaradi. Ular
// ajralib ketganda odam har login'dan keyin noto'g'ri panelga
// tushardi va buni hech qanday tekshiruv tutmasdi.
await page.waitForTimeout(1500);
check(
  "ega login qilgach tashkilot makoniga tushdi",
  new URL(page.url()).pathname.startsWith("/org"),
  page.url().replace(APP, ""),
);

// ══ 1) YARATISH TUGMASI — IKKI QISM ════════════════════════════
//
// Tugma ilgari IKKI qobiqda edi: rahbariyat sarlavhasida va
// operatsion sidebar'da. Endi ish makoni qobig'i BITTA, ya'ni tugma
// ham bitta joyda — sidebar'ning tepasida.
console.log("\n1) '+ Yaratish' split tugmasi");

// ══════════════════════════════════════════════════════════════════
// YARATISH TUGMASI — ADMIN PANELIDA (`/owner`), `/org` DA EMAS
// ══════════════════════════════════════════════════════════════════
//
// Ilgari bu tekshiruv `/org` da qidirardi, chunki o'sha paytda barcha
// ekran BITTA qobiqda edi. Endi ikki panel bor va tugma ATAYLAB
// operatsion panelda:
//
//   Admin paneli  — o'quvchi, guruh, lid, xodim yaratish (kundalik ish)
//   Super Admin   — filial va xona yaratish, LEKIN kontekst ichida:
//                   Filiallar → "+", filial → Xonalar → "+"
//
// Super Admin panelida umumiy "Yaratish" menyusi bo'lsa, u panelni
// yana operatsion panelga aylantirardi.
await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const orgCreate = await page.locator('button:has-text("Yaratish")').count();
check("Super Admin panelida umumiy 'Yaratish' menyusi YO'Q", orgCreate === 0, `${orgCreate} ta`);

// ══════════════════════════════════════════════════════════════════
// YARATISH TUGMASI DIREKTOR HISOBIDA TEKSHIRILADI
// ══════════════════════════════════════════════════════════════════
//
// Ega `/owner/*` ga KIRA OLMAYDI (`AdminPanelGuard`) — Admin paneli
// filial direktorlarining ish joyi. Shuning uchun bu bo'lim uchun
// alohida sessiya ochiladi.
//
// Ega yo'qotmaydi: u filial va xonani O'Z panelida, kontekst ichida
// yaratadi (Filiallar → "+", filial → Xonalar → "+").
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const adminPage = await adminCtx.newPage();
await adminPage.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
await adminPage.fill('input[name="username"]', "qa_admin_a");
await adminPage.fill('input[name="password"]', "qa123456");
await adminPage.press('input[name="password"]', "Enter");
await adminPage.waitForTimeout(3500);
const adminGate = adminPage.locator("[data-branch-gate]");
if (await adminGate.count()) {
  await adminGate.locator("button").first().click().catch(() => {});
  await adminPage.waitForTimeout(2000);
}
await adminPage.goto(`${APP}/owner/dashboard`, { waitUntil: "networkidle" });
await adminPage.waitForTimeout(1500);

const header = adminPage.locator('[data-sidebar="sidebar"]').first();
const createMain = header.locator('button:has-text("Yaratish")').first();
const createChevron = header.locator('button[aria-label="Yaratish turini tanlash"]');

check("chap qism (Yaratish) bor", (await createMain.count()) > 0);
check("o'ng qism (tur tanlash) bor", (await createChevron.count()) === 1);

const faceBefore = (await createMain.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
check("tugmada FAOL TUR nomi ko'rinadi", /·/.test(faceBefore), faceBefore);

// ── menyu ochilishi va yangi turlar ──
await createChevron.click();
await adminPage.waitForTimeout(600);
const menuLabels = (await adminPage.locator('[role="menuitem"]').allInnerTexts()).map((t) =>
  t.replace(/\s+/g, " ").trim(),
);
check("menyu ochildi", menuLabels.length > 0, `${menuLabels.length} variant`);
// MATN BO'YICHA QIDIRISH ISHLAMAYDI: "Filial" so'zi `Xodim` va `Xona`
// yozuvlarining IZOHIDA ham bor, ya'ni `:has-text("Filial")` uchta
// elementga mos keladi. Shu sababli `data-create-key` ishlatiladi.
check("XONA varianti bor", (await adminPage.locator('[data-create-key="room"]').count()) === 1,
  menuLabels.join(" | ").slice(0, 100));
check("FILIAL varianti bor", (await adminPage.locator('[data-create-key="branch"]').count()) === 1);

// ══ 2) BIR BOSISH: tur tanlangach modal DARHOL ochiladi ════════
console.log("\n2) tur tanlash -> modal darhol ochiladi");
await adminPage.locator('[data-create-key="room"]').click();
await adminPage.waitForTimeout(900);

const roomDialog = adminPage.locator('[role="dialog"]:has-text("Yangi xona")');
check("Xona tanlangach modal DARHOL ochildi (ikkinchi bosish yo'q)",
  (await roomDialog.count()) === 1);
check("modalda 'Xona nomi' maydoni bor",
  (await roomDialog.locator('input[name="name"]').count()) === 1);

await adminPage.keyboard.press("Escape");
await adminPage.waitForTimeout(600);

// ══ 3) ESLAB QOLISH: qayta yuklangach ham o'sha tur ════════════
console.log("\n3) tanlangan tur ESLAB QOLINADI");
const faceAfter = (await createMain.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
check("tugma yuzi 'Xona' ga o'zgardi", /Xona/.test(faceAfter), faceAfter);

await adminPage.reload({ waitUntil: "networkidle" });
await adminPage.waitForTimeout(1500);
const faceReload = (await adminPage.locator('[data-sidebar="sidebar"]').first()
  .locator('button:has-text("Yaratish")').first()
  .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
check("sahifa qayta yuklangach ham 'Xona' (localStorage)", /Xona/.test(faceReload), faceReload);

// ENG MUHIM TEKSHIRUV: chap qismni BIR MARTA bosganda modal ochiladi.
await adminPage.locator('[data-sidebar="sidebar"]').first().locator('button:has-text("Yaratish")').first().click();
await adminPage.waitForTimeout(900);
check(
  "BIR BOSISHDA xona modali ochildi (talabning o'zagi)",
  (await adminPage.locator('[role="dialog"]:has-text("Yangi xona")').count()) === 1,
);
await adminPage.keyboard.press("Escape");
await adminPage.waitForTimeout(600);

// ══ 4) SODDALASHTIRILGAN FILIAL MODALI ═════════════════════════
console.log("\n4) filial qo'shish — soddalashtirilgan");
await adminPage.locator('button[aria-label="Yaratish turini tanlash"]').first().click();
await adminPage.waitForTimeout(600);
await adminPage.locator('[data-create-key="branch"]').click();
await adminPage.waitForTimeout(900);

const branchDialog = adminPage.locator('[role="dialog"]:has-text("Yangi filial")');
check("filial modali ochildi", (await branchDialog.count()) === 1);

if (await branchDialog.count()) {
  const names = await branchDialog.locator("input").evaluateAll((els) =>
    els.map((e) => e.getAttribute("name")).filter(Boolean),
  );
  check("faqat 3 ta ko'rinadigan maydon: nom + login + parol",
    names.length === 3 && names.includes("name") && names.includes("username") && names.includes("password"),
    names.join(", "));

  // DIREKTOR ISMI SO'RALMAYDI - server bo'sh ismni ko'rinadigan
  // o'rinbosar bilan to'ldiradi (branches.service.js).
  check("direktor ISMI so'ralmaydi", !names.includes("dirFirstName"), names.join(", "));

  const dialogText = (await branchDialog.innerText()).replace(/\s+/g, " ");
  check("'Qo'shimcha' yig'ilgan bo'lim bor", /Qo'shimcha/i.test(dialogText));
}
await adminPage.keyboard.press("Escape");
await adminPage.waitForTimeout(600);

// ══ 5) TAHLIL MARKAZI — YAGONA QOBIQDA ═════════════════════════
//
// ── NIMA O'ZGARDI ──
// Bu bo'lim ilgari "tizim tahlili `/admin` ga ko'chdi" ni tekshirardi
// va buning uchun rahbariyat navigatsiyasini o'qirdi. O'sha
// navigatsiya endi YO'Q: ikkinchi qobiq butunlay olib tashlandi.
//
// Yangi haqiqat: tahlil markazi `/owner/ai*` da, ish makoni qobig'i
// ichida ochiladi. `/admin/tahlil` esa o'sha yerga yo'naltiriladi.
console.log("\n5) tahlil markazi — yagona qobiqda");

await adminPage.goto(`${APP}/admin/tahlil`, { waitUntil: "domcontentloaded" });
await adminPage.waitForTimeout(1500);
check("/admin/tahlil → /owner/ai ga yo'naltirdi",
  adminPage.url().replace(APP, "") === "/owner/ai", adminPage.url().replace(APP, ""));

await adminPage.waitForTimeout(1500);
// 404 NI MATNDAN QIDIRISH NOTO'G'RI EDI: sahifa ko'chgach ichida
// mutlaqo qonuniy "Hisobot topilmadi" kabi BO'SH HOLAT matnlari paydo
// bo'ldi va tekshiruv yolg'on yiqila boshladi.
//
// Endi 404 SAHIFANING O'ZI bo'yicha aniqlanadi: `NotFoundPage`
// sarlavhasi bormi. Bo'sh holat matni unga ta'sir qilmaydi.
const tahlilHeading = await adminPage.locator("main h1").first().innerText().catch(() => "");
check("tahlil markazi ochildi (404 emas)",
  /Tahlil markazi/i.test(tahlilHeading),
  `${adminPage.url().replace(APP, "")} | h1: ${tahlilHeading.slice(0, 40)}`);
// Tahlil markazi (`/owner/ai`) — ADMIN panelida, ya'ni uning qobig'i.
check("tahlil markazi Admin panelining qobig'ida",
  (await adminPage.locator('[data-sidebar="sidebar"]').count()) === 1);

// FILIALLAR — Super Admin panelining O'Z menyusida.
//
// Selektor `[data-sidebar]` edi (Admin panelining shadcn sidebari) va
// `/org` da bunday element YO'Q: u alohida qobiq. Menyu yozuvi bor
// edi-yu, test uni topa olmasdi.
await adminPage.goto(`${APP}/org`, { waitUntil: "networkidle" });
await adminPage.waitForTimeout(1500);
const navTexts = (await page
  .locator('nav[aria-label="Tashkilot menyusi"] a')
  .allInnerTexts()).map((t) => t.trim()).filter(Boolean);
const hasBranches = navTexts.some((t) => /^Filiallar$/i.test(t));
if (multiBranch) {
  check("ko'p filialli markaz: 'Filiallar' menyuda bor", hasBranches, navTexts.join(" | "));
} else {
  check("yakka markaz: 'Filiallar' menyuda bor (kartaga kirish uchun)",
    hasBranches, navTexts.join(" | "));
}

// Operatsion sidebar'dan ESKI yozuv olib tashlanganmi (direktor hisobida)
await adminPage.goto(`${APP}/owner/dashboard`, { waitUntil: "networkidle" });
await adminPage.waitForTimeout(1800);
const sidebarLinks = await adminPage.locator('[data-sidebar="sidebar"] a').allInnerTexts();
check("operatsion sidebar'da 'Tahlil markazi' YO'Q (ko'chirildi)",
  !sidebarLinks.some((t) => /Tahlil markazi/i.test(t)),
  sidebarLinks.map((t) => t.trim()).filter(Boolean).slice(0, 12).join(" | "));

// ══ 6) FILIALLAR KESIMI ════════════════════════════════════════
console.log("\n6) /admin/filiallar — moliya + o'qituvchi + sotuv");
await page.goto(`${APP}/admin/filiallar`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const salesReq = allRequests.filter((r) => r.url.includes("/branch-analytics/sales"));
const teachReq = allRequests.filter((r) => r.url.includes("/branch-analytics/teachers"));
const pnlReq = allRequests.filter((r) => r.url.includes("/branch-analytics/pnl"));

check("sotuv so'rovi yuborildi", salesReq.length > 0, salesReq.map((r) => r.status).join(","));
check("o'qituvchi so'rovi yuborildi", teachReq.length > 0, teachReq.map((r) => r.status).join(","));
check("moliya (P&L) so'rovi yuborildi", pnlReq.length > 0, pnlReq.map((r) => r.status).join(","));
check("uchalasi ham 5xx BERMADI",
  [...salesReq, ...teachReq, ...pnlReq].every((r) => r.status < 500),
  [...salesReq, ...teachReq, ...pnlReq].map((r) => `${r.status}`).join(","));

const cmpText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
check("uchala bo'lim sarlavhasi ko'rinadi",
  /Moliya/.test(cmpText) && /O'qituvchilar/.test(cmpText) && /Sotuv/.test(cmpText));

// Bo'sh bazada jadval o'rniga TO'G'RI bo'sh holat chiqishi kerak -
// soxta nol EMAS.
const tables = await page.locator("main table").count();
const emptyStates = /Ma'lumot yo'q|yozuv yo'q|topilmadi/i.test(cmpText);
check("jadval YOKI to'g'ri bo'sh holat", tables > 0 || emptyStates,
  tables ? `${tables} jadval` : "bo'sh holat matni");
check("'Manba ulanmagan' DEMAYDI (uchalasi ham ko'chirilgan)",
  !/Manba ulanmagan/i.test(cmpText));

// ══ 7) FILIAL TANLAGICH (checkbox) ═════════════════════════════
console.log("\n7) filial tanlagich (checkbox)");
// ── FAQAT KO'RINADIGAN TUGMA ──
//
// "Barcha filiallar" yozuvi IKKI joyda: taqqoslash bo'limidagi
// tanlagichda va MOBIL sarlavhadagi `BranchBadge` da. Ikkinchisi
// desktopda `md:hidden` bilan yashiringan — o'lchami 0×0, ya'ni
// bosib bo'lmaydi.
//
// Ilgari `main` bilan cheklash yetarli edi, chunki sarlavha `main`
// dan TASHQARIDA turardi. Yagona qobiqqa o'tilgach u ichkariga
// tushdi va `.first()` o'sha ko'rinmas tugmani tanlab, klik 30
// soniya kutib yiqila boshladi.
//
// `:visible` — Playwright'ning o'z tanlagichi: nol o'lchamli va
// `display:none` elementlarni chiqarib tashlaydi.
const picker = page.locator('main button:visible', { hasText: "Barcha filiallar" });
const pickerCount = await picker.count();
if (pickerCount > 0) {
  await picker.first().click();
  await page.waitForTimeout(900);
  const optionCount = await page.locator('[cmdk-item]').count();
  check("tanlagich ochildi, variantlar bor", optionCount > 0, `${optionCount} filial`);
  await page.keyboard.press("Escape");
} else {
  // Yakka filialli bazada tanlagich ATAYLAB chiqmaydi
  // (`hasMultipleBranches`). Bu to'g'ri holat.
  ok("yakka filialli baza: tanlagich ko'rsatilmaydi (ataylab)");
}

// ══ 8) TOAST / KONSOL / TOSHIB KETISH ══════════════════════════
console.log("\n8) yakuniy holat");
const toasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
check("xato toasti YO'Q", toasts.length === 0, toasts.join(" | ").slice(0, 120));

const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("gorizontal scroll YO'Q (jadval o'z ichida suriladi)", overflow <= 0, `${overflow}px`);

const realErrors = consoleErrors.filter(
  (e) => !/Download the React DevTools|status of 501|status of 403/i.test(e),
);
check("konsol xatolari YO'Q", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
check("5xx javob YO'Q", badRequests.length === 0,
  badRequests.map((r) => `${r.status} ${r.url}`).join(", "));

const byStatus = {};
for (const r of allRequests) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log(`  ℹ jami API so'rov: ${allRequests.length} — ${JSON.stringify(byStatus)}`);

await adminCtx.close();
await browser.close();
console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
process.exit(R.fail ? 1 : 0);
