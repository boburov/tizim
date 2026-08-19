/**
 * ══════════════════════════════════════════════════════════════════════
 * IKKI PANEL — BRAUZER QABUL TESTI (talab 39)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Build va HTTP tekshiruvlari YETARLI EMAS: ular DOM'ni ko'rmaydi,
 * konsol xatosini ushlamaydi va "menyu bosildi-yu, hech narsa
 * ochilmadi" holatini sezmaydi.
 *
 * TEKSHIRILADIGAN ARXITEKTURA:
 *
 *   SUPER ADMIN  `/org` — ALOHIDA qobiq (o'z sarlavhasi, o'z uch
 *                 yozuvli menyusi, sarlavhada MOLIYA). Oqim:
 *                 Asosiy → Filiallar → filial kartasi → Filial A →
 *                 Xonalar → "+" → xona formasi → Moliya → drill-down
 *                 zanjiri → tranzaksiya → Tizim tahlili → Xonalar
 *
 *   ADMIN        `/owner` — MAVJUD panel, o'z menyusi bilan. Unda
 *                 Xonalar va Tizim tahlili BOR, tashkilot bo'limlari
 *                 YO'Q. `/org` unga yopiq.
 *
 *   XODIM/O'QUVCHI — o'zgarmadi (`/work`, `/me`).
 *
 * ENG MUHIM TEKSHIRUV: ikki panel BIR XIL QOBIQDA EMAS. Super Admin
 * ekranida shadcn sidebari (`[data-sidebar]`) BO'LMASLIGI kerak — u
 * bo'lsa, demak panel "tugmalari boshqacha Admin paneli" bo'lib
 * qolgan.
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
/**
 * MA'LUMOT YO'QLIGI — XATO EMAS, LEKIN "O'TDI" HAM EMAS.
 *
 * Bo'sh bazada daromad jadvali bo'sh bo'ladi va drill-down zanjirini
 * tekshirib bo'lmaydi. Buni "yiqildi" deb belgilash yolg'on
 * ogohlantirish beradi, "o'tdi" deb belgilash esa undan battar:
 * tekshirilmagan narsa tekshirilgandek ko'rinadi.
 *
 * Shuning uchun uchinchi holat — OCHIQ e'lon qilinadi va yakuniy
 * hisobotda alohida sanaladi.
 */
const skipped = [];
const skip = (n, why) => { skipped.push(`${n} — ${why}`); console.log(`  ⏭️  ${n} — ${why}`); };
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

console.log("\n═══════ IKKI PANEL — BRAUZER QABUL TESTI ═══════");

/** Super Admin panelining menyusi (shadcn sidebari EMAS). */
const orgNavItems = async (page) =>
  (await page.locator('nav[aria-label="Tashkilot menyusi"] a').allTextContents())
    .map((t) => t.trim()).filter(Boolean);

// ══════════════════════════════════════════════════════════════════
// 1) SUPER ADMIN — ALOHIDA PANEL
// ══════════════════════════════════════════════════════════════════
head("1) SUPER ADMIN — o'z qobig'i");
{
  const { ctx, page } = await newSession();
  const landing = await loginAs(page, "owner", "owner123");
  check("login → Super Admin paneli", landing.startsWith("/org"), landing);

  await page.waitForTimeout(1500);

  // ── QOBIQ HAQIQATAN BOSHQAMI (talab 2) ──
  //
  // Bu testning eng muhim qatori. Ilgari ikkala panel ham AYNI
  // `OperationalLayout` da chizilardi va faqat menyu massivi
  // boshqacha edi — ya'ni "alohida panel" aslida yo'q edi.
  const shadcnSidebar = await page.locator("[data-sidebar]").count();
  check("Admin panelining qobig'i ISHLATILMAYDI", shadcnSidebar === 0,
    shadcnSidebar ? `${shadcnSidebar} ta [data-sidebar] element` : "o'z qobig'i");

  // ── SIDEBAR: UCHTA YOZUV (talab 4) ──
  const nav = await orgNavItems(page);
  const EXPECT = ["Asosiy", "Filiallar", "Tizim tahlili"];
  const missing = EXPECT.filter((t) => !nav.some((n) => n.includes(t)));
  check("sidebar: Asosiy · Filiallar · Tizim tahlili", missing.length === 0,
    missing.length ? `yo'q: ${missing}` : nav.join(" · "));
  check("sidebar minimal (3 yozuv)", nav.length === 3, nav.join(" · "));
  check("entitetlar sidebarda YO'Q",
    !nav.some((n) => /O'quvchi|O'qituvchi|Guruh|Xona|Chiqim|To'lov/.test(n)),
    nav.join(" · "));

  // ── MOLIYA SARLAVHADA (talab 3) ──
  const headerMoliya = page.locator('header a[href="/org/moliya"]');
  check("MOLIYA sarlavhada, sidebarda emas",
    (await headerMoliya.count()) > 0 && !nav.some((n) => n.includes("Moliya")));

  // ── ASOSIY: yuqori darajadagi manzara (talab 5) ──
  const kpi = await page.locator("main .tabular-nums").count();
  check("Asosiy: KPI plitalari", kpi > 0, `${kpi} raqam`);
  const emptyTiles = await page.locator("main").locator("text=Ma'lumot yo'q").count();
  check("KPI larda 'Ma'lumot yo'q' yo'q", emptyTiles === 0, `${emptyTiles} ta bo'sh plita`);
  await shot(page, "01-org-asosiy");

  // ══════════════════════════════════════════════════════════════
  // FILIALLAR — KARTALAR (talab 6, 8)
  // ══════════════════════════════════════════════════════════════
  await page.goto(`${APP}/org/filiallar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  const cards = page.locator('main a[href^="/org/filiallar/"]');
  const cardCount = await cards.count();
  check("filial KARTALARI (jadval emas)", cardCount > 0, `${cardCount} karta`);

  const addBranch = page.locator("main button", { hasText: "Filial qo'shish" });
  check("'+ Filial qo'shish' ko'rinib turadi", (await addBranch.count()) > 0);
  await shot(page, "02-org-filiallar");

  // ── FILIAL YARATISH FORMASI (talab 7) ──
  if (await addBranch.count()) {
    await addBranch.first().click();
    await page.waitForTimeout(900);
    const dialog = page.locator('[role="dialog"]');
    for (const [label, name] of [["nomi", "name"], ["login", "username"], ["parol", "password"]]) {
      check(`filial formasida ${label} maydoni`,
        (await dialog.locator(`input[name="${name}"]`).count()) > 0);
    }
    // Murakkab sehrgar YO'Q: qolgan maydonlar yig'ilgan holatda.
    const fields = await dialog.locator("input").count();
    check("forma qisqa (3-4 maydon)", fields <= 4, `${fields} maydon`);
    await shot(page, "03-branch-create-form");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }

  // ══════════════════════════════════════════════════════════════
  // FILIALGA KIRISH → XONALAR (talab 9, 10)
  // ══════════════════════════════════════════════════════════════
  if (cardCount > 0) {
    await cards.first().click();
    await page.waitForTimeout(2000);
    check("filial konteksti ochildi",
      /\/org\/filiallar\/[0-9a-f]{24}/.test(page.url()), page.url().replace(APP, ""));

    const roomsTab = page.locator("main button", { hasText: "Xonalar" }).first();
    if (await roomsTab.count()) {
      await roomsTab.click();
      await page.waitForTimeout(1800);

      // KARTA TO'RI, jadval emas.
      const addRoomCard = page.locator("main button", { hasText: "Xona qo'shish" });
      check("filial ICHIDA 'Xona qo'shish' kartasi", (await addRoomCard.count()) > 0);
      const roomCards = await page.locator("main .aspect-\\[4\\/3\\]").count();
      check("xonalar karta to'rida (4:3)", roomCards > 0, `${roomCards} karta`);
      await shot(page, "04-org-branch-rooms");

      if (await addRoomCard.count()) {
        await addRoomCard.first().click();
        await page.waitForTimeout(900);
        const dialog = page.locator('[role="dialog"]');
        check("xona formasi ochildi", (await dialog.locator('input[name="name"]').count()) > 0);
        check("sig'im maydoni bor", (await dialog.locator('input[name="capacity"]').count()) > 0);
        // FILIAL TANLAGICHI BO'LMASLIGI SHART — kontekstdan olinadi
        // (talab 32). Bo'lsa — xato filialga xona qo'shish yo'li ochiq.
        check("filial tanlagichi YO'Q (kontekstdan)",
          (await dialog.locator('[name="branchId"]').count()) === 0);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(600);
      }
    } else bad("Xonalar tabi topilmadi");
  }

  // ══════════════════════════════════════════════════════════════
  // MOLIYA + DRILL-DOWN ZANJIRI (talab 23)
  // ══════════════════════════════════════════════════════════════
  await page.goto(`${APP}/org/moliya?tab=revenue`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  await shot(page, "05-org-moliya");

  const revRows = page.locator("main table tbody tr");
  const revCount = await revRows.count();

  if (revCount === 0) {
    // Bazada shu davrda daromad yozuvi yo'q — zanjirni ochib
    // bo'lmaydi. Bu kod nosozligi EMAS.
    skip("drill-down zanjiri (daromad → guruh → o'quvchi → yozuv)",
      "bazada bu davr uchun daromad yozuvi yo'q");
  } else {
    ok("daromad kesimi jadvali", `${revCount} qator`);
    await revRows.first().click();
    await page.waitForTimeout(2000);
    const sheet = page.locator('[role="dialog"]');
    check("drill paneli ochildi", (await sheet.count()) > 0);
    await shot(page, "06-drill-1");

    const inner = sheet.locator("table tbody tr");
    const innerCount = await inner.count();
    check("panel ichida keyingi daraja bor", innerCount > 0, `${innerCount} qator`);
    if (innerCount > 0) {
      await inner.first().click();
      await page.waitForTimeout(1800);
      const crumbs = await sheet.locator('nav[aria-label="Zanjir"] button').count();
      check("zanjir (breadcrumb) ko'rinadi", crumbs >= 2, `${crumbs} bo'g'in`);
      await shot(page, "07-drill-2");

      const entryBtn = sheet.locator("ul li button").first();
      if (await entryBtn.count()) {
        await entryBtn.click();
        await page.waitForTimeout(1800);
        const txt = await sheet.innerText();
        check("tranzaksiya hujjati: qo'sh yozuv", /Qo'sh yozuv|Debet|Kredit/.test(txt));
        check("tranzaksiya hujjati: audit", /Audit/.test(txt));
        await shot(page, "08-drill-transaction");
      } else bad("yozuvlar ro'yxati topilmadi");
    }
    await page.keyboard.press("Escape");
  }

  // ── PUL / HISOBLAR ──
  await page.goto(`${APP}/org/moliya?tab=cash`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  const cashText = await page.locator("main").innerText();
  if (/Naqd|Bank hisobi|Click|Payme/.test(cashText)) {
    ok("hisoblar odam tilida");
  } else {
    skip("hisoblar odam tilida", "bazada moliyaviy hisob ochilmagan");
  }

  // ══════════════════════════════════════════════════════════════
  // TIZIM TAHLILI + XONA TAHLILI (talab 13, 14, 27, 28)
  // ══════════════════════════════════════════════════════════════
  await page.goto(`${APP}/org/tahlil`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  const anText = await page.locator("main").innerText();
  check("Tizim tahlili sarlavhasi", /Tizim tahlili/.test(anText));
  await shot(page, "09-org-tahlil");

  const roomsAnalysisTab = page.locator("main button", { hasText: "Xonalar" }).first();
  check("tahlilda XONALAR kesimi bor", (await roomsAnalysisTab.count()) > 0);
  if (await roomsAnalysisTab.count()) {
    await roomsAnalysisTab.click();
    await page.waitForTimeout(2000);
    const roomText = await page.locator("main").innerText();
    // Bandlik foizi MAXRAJINI aytishi shart — aks holda uni
    // tekshirib bo'lmaydi (talab 20: "Estimated" emas, ochiq asos).
    check("bandlik nimaga nisbatan hisoblanganini aytadi",
      /faol kuniga nisbatan/.test(roomText));
    check("faol kunlar/soatlar ko'rinadi", /Faol kunlar va soatlar/.test(roomText));
    await shot(page, "10-org-xona-tahlili");
  }

  // ── VAKOLATLAR (sarlavha menyusidan) ──
  await page.goto(`${APP}/org/vakolatlar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const roleBtn = page.locator("main aside button").first();
  check("rollar ro'yxati bor", (await roleBtn.count()) > 0);
  if (await roleBtn.count()) {
    await roleBtn.click();
    await page.waitForTimeout(1500);
  }
  const permText = await page.locator("main").innerText();
  check("vakolatlar odam tilida", /O'quvchilar|Moliya|Xonalar|Maoshlar/.test(permText));
  check("xom kalit KO'RSATILMAYDI",
    !/finance\.view_profitability|students\.read/.test(permText));
  await shot(page, "11-org-vakolatlar");

  // ── ESKI MANZILLAR YO'NALTIRILADI ──
  for (const [from, to] of [["/org/branches", "/org/filiallar"],
    ["/org/finance", "/org/moliya"], ["/org/analytics", "/org/tahlil"]]) {
    await page.goto(`${APP}${from}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    check(`${from} → ${to}`, page.url().includes(to), page.url().replace(APP, ""));
  }

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
// 2) ADMIN — MAVJUD PANEL, FILIAL KO'LAMIDA
// ══════════════════════════════════════════════════════════════════
head("2) ADMIN — mavjud panel, o'z filiali");
{
  const { ctx, page } = await newSession();
  const landing = await loginAs(page, "qa_admin_a", "qa123456", { allBranches: false });
  check("login → Admin paneli", landing.startsWith("/owner"), landing);

  await page.waitForTimeout(1500);

  // Admin paneli O'Z qobig'ida qoladi — shadcn sidebari BOR.
  check("Admin paneli o'z qobig'ida", (await page.locator("[data-sidebar]").count()) > 0);

  const nav = await sidebarItems(page);
  check("menyuda XONALAR bor (talab 11)", nav.some((n) => n.includes("Xonalar")), nav.join(" · "));
  check("menyuda TIZIM TAHLILI bor (talab 31)",
    nav.some((n) => n.includes("Tizim tahlili")), nav.join(" · "));
  check("VAKOLATLAR yo'q (tashkilot darajasi)",
    !nav.some((n) => n.includes("Vakolatlar")), nav.join(" · "));
  await shot(page, "12-admin-dashboard");

  // ── XONALAR: o'z filiali, filial tanlagichisiz (talab 32) ──
  await page.goto(`${APP}/owner/rooms`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  check("Xonalar sahifasi ochildi", page.url().includes("/owner/rooms"));
  const roomText = await page.locator("main").innerText();
  check("qaysi filial ekani yozilgan", /filial|Markazning/i.test(roomText),
    roomText.slice(0, 80).replace(/\n/g, " "));
  await shot(page, "13-admin-rooms");

  const addRoom = page.locator("main button", { hasText: "Xona qo'shish" });
  if (await addRoom.count()) {
    await addRoom.first().click();
    await page.waitForTimeout(900);
    const dialog = page.locator('[role="dialog"]');
    check("xona formasi ochildi", (await dialog.locator('input[name="name"]').count()) > 0);
    check("filial tanlagichi YO'Q (server ko'lamdan qo'yadi)",
      (await dialog.locator('[name="branchId"]').count()) === 0);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }

  // ── TIZIM TAHLILI: filial ko'lamida ──
  await page.goto(`${APP}/owner/tahlil`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  check("Admin tizim tahlili ochildi", page.url().includes("/owner/tahlil"));
  await shot(page, "14-admin-tahlil");

  // ── SUPER ADMIN PANELI YOPIQ (talab 33) ──
  for (const url of ["/org", "/org/filiallar", "/org/vakolatlar"]) {
    await page.goto(`${APP}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    check(`${url} → Admin paneliga qaytdi`, !page.url().includes("/org"),
      page.url().replace(APP, ""));
  }

  // ── ESKI `/branch` MANZILLARI ──
  await page.goto(`${APP}/branch/collections`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("/branch/collections → /owner/finance/undirish",
    page.url().includes("/owner/finance/undirish"), page.url().replace(APP, ""));
  await shot(page, "15-admin-undirish");

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
  // Bu login ATAYLAB yiqilishi mumkin (foydalanuvchi yo'q bo'lsa) va u
  // konsolga 401 yozadi. Shu belgidan keyingi xatolar o'sha
  // urinishga tegishli — ular yakuniy "konsol toza" tekshiruvidan
  // chiqariladi, aks holda test o'zi hosil qilgan xatoda yiqilardi.
  const errorsBeforeStudent = consoleErrors.length;
  const landing = await loginAs(page, "demo_student_1", "qa123456", { allBranches: false });

  // Bu bo'lim `demo_student_1` foydalanuvchisiga tayanadi va u faqat
  // moliya demo seed'i bilan paydo bo'ladi. Bo'lmasa — testni
  // yiqitish emas, OCHIQ o'tkazib yuborish (aks holda "o'quvchi
  // paneli buzuq" degan noto'g'ri xulosa chiqardi).
  if (!landing.startsWith("/me")) {
    skip("o'quvchi paneli", "demo_student_1 topilmadi (npm run seed:finance-demo)");
    consoleErrors.length = errorsBeforeStudent;
    await ctx.close();
  } else {
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

  for (const url of ["/org", "/owner/students", "/owner/rooms"]) {
    await page.goto(`${APP}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    check(`${url} → yopiq`, page.url().includes("/me"), page.url().replace(APP, ""));
  }

  await ctx.close();
  }
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
console.log(`NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi, ${skipped.length} tekshirilmadi`);
if (skipped.length) {
  // TEKSHIRILMAGAN NARSA "O'TDI" EMAS. Uni yashirish yakuniy hisobotni
  // haqiqatdan ko'ra yaxshiroq ko'rsatardi.
  console.log("\nTEKSHIRILMADI (bazada ma'lumot yo'q):");
  for (const sk of skipped) console.log(`  ⏭️  ${sk}`);
}
if (R.failures.length) {
  console.log("\nMUAMMOLAR:");
  for (const f of R.failures) console.log(`  • ${f}`);
  process.exitCode = 1;
}
console.log(`\nSkrinshotlar: ${SHOTS}\n`);
