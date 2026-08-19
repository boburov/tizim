/**
 * MOLIYA BOSHQARUV MARKAZI — HAQIQIY BRAUZER QABUL TESTI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA BUILD/LINT YETARLI EMAS
 *
 * Ular DOM'ni ko'rmaydi. `undefined so'm`, `NaN%`, toshib ketgan
 * jadval yoki bosilmaydigan qator — hammasi build'dan MUAMMOSIZ
 * o'tadi va faqat foydalanuvchi ekranida ko'rinadi.
 *
 * Bu skript haqiqiy Chromium'da haqiqiy serverga ulanib ishlaydi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * TALAB: server (5000) va client ishlab turishi kerak, hamda
 * `npm run seed:finance-demo` bajarilgan bo'lishi kerak.
 *
 * ISHLATISH:
 *   BASE=http://localhost:5174 node tests/financeCommandAcceptance.mjs
 */
const resolvePlaywright = async () => {
  const { existsSync, readdirSync } = await import("node:fs");
  const c = [];
  if (process.env.PLAYWRIGHT_PATH) c.push(process.env.PLAYWRIGHT_PATH);
  c.push(new URL("../node_modules/playwright/index.mjs", import.meta.url).pathname);
  const npx = `${process.env.HOME}/.npm/_npx`;
  if (existsSync(npx)) {
    for (const d of readdirSync(npx)) {
      const p = `${npx}/${d}/node_modules/playwright/index.mjs`;
      if (existsSync(p)) c.push(p);
    }
  }
  for (const x of c) if (existsSync(x)) return import(`file://${x}`);
  console.error("\nPLAYWRIGHT TOPILMADI — brauzer testi BAJARILMADI.\n");
  process.exit(2);
};

const BASE = process.env.BASE || "http://localhost:5174";
// API to'g'ridan-to'g'ri (Vite proxy'siga tayanmaymiz — dev serverda
// `/api` mavjud bo'lmasa u index.html qaytaradi va JSON parse yiqiladi).
const API = process.env.API || "http://localhost:5000/api";
const LOGIN = process.env.QA_LOGIN || "owner";
const PASS = process.env.QA_PASSWORD || "owner123";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, e = "") => { R.pass += 1; console.log(`  ✅ ${n}${e ? ` — ${e}` : ""}`); };
const bad = (n, e = "") => { R.fail += 1; R.failures.push(`${n} — ${e}`); console.log(`  ❌ ${n} — ${e}`); };
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const run = async () => {
  /**
   * Matn paydo bo'lishini KUTADI (qat'iy `waitForTimeout` o'rniga).
   *
   * Panel ichidagi ro'yxat alohida so'rov bilan keladi va u sekin
   * bo'lsa qat'iy kutish YETMAY qolardi — test "topilmadi" deb
   * yiqilardi, holbuki ilova to'g'ri ishlayapti. Bunday yolg'on
   * yiqilish haqiqiy nosozlikni ko'rinmas qiladi.
   */
  //
  // DIQQAT: Playwright'ning `text=` selektori APOSTROF bilan
  // ishlamaydi — "Qo'sh yozuv" kabi o'zbekcha matnlar jimgina
  // topilmay qolardi va test ilova ishlab turgan holda yiqilardi.
  // Shuning uchun `innerText` bo'yicha oddiy so'rov (polling).
  const waitForText = async (page, text, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const t = await page.evaluate(() => document.body.innerText).catch(() => "");
      if (t.includes(text)) return true;
      await page.waitForTimeout(300);
    }
    return false;
  };

  /** Bo'lim tabini bosadi — FAQAT navigatsiya ichidan. */
  const openTab = async (page, name) => {
    await page.locator("nav").getByRole("button", { name, exact: true }).first().click();
    await page.waitForTimeout(2500);
  };

  const { chromium } = await resolvePlaywright();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ── KONSOL XATOLARI YIG'ILADI ──
  // "undefined is not a function" turidagi xato ekranda ko'rinmasligi
  // mumkin, lekin bo'lim jimgina bo'sh qoladi.
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  const bodyText = () => page.evaluate(() => document.body.innerText);

  /** Ekranda taqiqlangan qiymat bormi (talab 11). */
  const assertNoBadValues = async (label) => {
    const t = await bodyText();
    const bad_ = ["NaN", "undefined", "Infinity", "[object Object]", "null so'm"]
      .filter((x) => t.includes(x));
    if (bad_.length) bad(`${label}: taqiqlangan qiymat yo'q`, bad_.join(", "));
    else ok(`${label}: NaN/undefined/Infinity yo'q`);
  };

  try {
    // ══════════ LOGIN ══════════
    //
    // Naqsh mavjud `browserAcceptance.mjs` dan olingan: Enter bilan
    // yuboriladi (tugma React qayta render paytida ajralib ketishi
    // mumkin), keyin MAJBURIY filial tanlash ekrani o'tiladi.
    head("0) Kirish");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[name="username"]', { timeout: 20000 });
    await page.fill('input[name="username"]', LOGIN);
    await page.fill('input[name="password"]', PASS);
    await page.press('input[name="password"]', "Enter");
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
    if (page.url().includes("/login")) {
      bad("kirish muvaffaqiyatli", (await bodyText()).slice(0, 120));
      throw new Error("login yiqildi");
    }
    ok("kirish muvaffaqiyatli", page.url().replace(BASE, ""));

    // FILIAL DARVOZASI — ko'p filialli markazda majburiy ekran.
    await page.waitForTimeout(1200);
    const gate = page.locator("[data-branch-gate]");
    if (await gate.count()) {
      await gate.locator("button", { hasText: "Barcha filiallar" }).first().click();
      await page.waitForTimeout(2500);
      ok("filial tanlash ekrani o'tildi");
    }

    // ══════════ 1) MOLIYA MARKAZI ══════════
    head("1) Moliya boshqaruv markazi ochiladi");
    await page.goto(`${BASE}/owner/finance`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    let t = await bodyText();
    ok("sahifa ochildi", page.url().replace(BASE, ""));
    for (const label of ["Hissa foydasi", "Daromad", "Xarajat", "Kassa qoldig'i", "Qarzdorlik"]) {
      if (t.includes(label)) ok(`KPI ko'rinadi: ${label}`);
      else bad(`KPI ko'rinadi: ${label}`, "topilmadi");
    }
    // KPI kartasi QISQA formatda ko'rsatadi ("6,8 mln so'm") —
    // `formatMoneyShort`. Uzun raqamni kutish noto'g'ri edi.
    if (/mln so'm|ming so'm|\d\s?\d{3}\s?\d{3}/.test(t)) ok("haqiqiy pul raqami ekranda", (t.match(/[\d,\s]+mln so'm/) || ["?"])[0].trim());
    else bad("haqiqiy pul raqami ekranda", "topilmadi");
    await assertNoBadValues("Umumiy");

    // ══════════ 2) OGOHLANTIRISHLAR ══════════
    head("2) Harakat markazi");
    if (t.includes("Nimaga e'tibor kerak")) ok("ogohlantirish bloki bor");
    else bad("ogohlantirish bloki bor");
    if (/byudjetdan/i.test(t)) ok("byudjet ogohlantirishi ko'rinadi");
    else bad("byudjet ogohlantirishi ko'rinadi", "topilmadi");

    // ══════════ 3) DAVR FILTRI ══════════
    head("3) Davr filtri URL bilan sinxron");
    const before = await bodyText();
    await page.getByRole("button", { name: "O'tgan oy", exact: true }).click();
    await page.waitForTimeout(2500);
    const url = page.url();
    if (/year=\d{4}/.test(url) && /month=\d+/.test(url)) ok("davr URL ga yozildi", url.split("?")[1]);
    else bad("davr URL ga yozildi", url);
    const after = await bodyText();
    if (after !== before) ok("raqamlar davr bilan o'zgardi");
    else bad("raqamlar davr bilan o'zgardi", "matn bir xil qoldi");
    await page.getByRole("button", { name: "Bu oy", exact: true }).click();
    await page.waitForTimeout(2000);

    // ══════════ 4) DAROMAD → DRILL-DOWN → TRANZAKSIYA ══════════
    head("4) Daromad → yo'nalish → guruh → yozuv → panel");
    await openTab(page, "Daromad");
    t = await bodyText();
    if (t.includes("Daromad dinamikasi")) ok("daromad bo'limi ochildi");
    else bad("daromad bo'limi ochildi");
    if (/IELTS/.test(t)) ok("yo'nalish kesimi ko'rinadi", "IELTS");
    else bad("yo'nalish kesimi ko'rinadi");
    await assertNoBadValues("Daromad");

    const ieltsRow = page.locator("tr", { hasText: "IELTS" }).first();
    if (await ieltsRow.count()) {
      await ieltsRow.click();
      if (await waitForText(page, "Guruhlar")) ok("drill-down paneli ochildi (guruhlar)");
      else bad("drill-down paneli ochildi", "«Guruhlar» topilmadi");

      const grpRow = page.locator("tr", { hasText: "IELTS-A" }).first();
      await grpRow.waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
      if (await grpRow.count()) {
        await grpRow.click();
        if (await waitForText(page, "Moliyaviy yozuvlar")) ok("guruh → yozuvlar ro'yxati");
        else bad("guruh → yozuvlar ro'yxati", "topilmadi");

        // `count()` NI GUARD SIFATIDA ISHLATMAYMIZ: jadval qayta
        // render bo'layotgan lahzada u 0 qaytarib, test yolg'on
        // yiqilardi (ilova esa to'g'ri ishlayotgan bo'lardi).
        // `waitFor` + to'g'ridan-to'g'ri klik ishonchli.
        const entryRow = page.locator("tr", { hasText: "O'quvchi to'lovi" }).first();
        const rowReady = await entryRow
          .waitFor({ state: "visible", timeout: 15000 })
          .then(() => true).catch(() => false);
        if (rowReady) {
          await entryRow.click();
          const opened = await waitForText(page, "Qo'sh yozuv");
          if (!opened) await page.waitForTimeout(1500);
          const et = await bodyText();
          if (et.includes("Qo'sh yozuv")) ok("TRANZAKSIYA PANELI ochildi");
          else bad("tranzaksiya paneli ochildi", "«Qo'sh yozuv» topilmadi");
          if (et.includes("Debet") && et.includes("Kredit")) ok("debet/kredit ko'rinadi");
          else bad("debet/kredit ko'rinadi");
          if (/Audit/.test(et)) ok("audit bo'limi ko'rinadi");
          else bad("audit bo'limi ko'rinadi");
          await assertNoBadValues("Tranzaksiya paneli");
          await page.keyboard.press("Escape");
          await page.waitForTimeout(800);
        } else bad("yozuv qatori topildi", "15s ichida ko'rinmadi");
      } else bad("guruh qatori topildi", "IELTS-A yo'q");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    } else bad("IELTS qatori bosildi");

    // FILTR SAQLANDIMI
    if (/tab=revenue/.test(page.url())) ok("panel yopilgach bo'lim saqlandi", "tab=revenue");
    else bad("panel yopilgach bo'lim saqlandi", page.url());

    // ══════════ 5) FOYDALILIK ══════════
    head("5) Foydalilik + atributsiya qamrovi");
    await openTab(page, "Foydalilik");
    t = await bodyText();
    if (t.includes("Atributsiya qamrovi")) ok("atributsiya qamrovi KO'RINADI");
    else bad("atributsiya qamrovi ko'rinadi", "topilmadi");
    if (/Hissa foydasi/.test(t)) ok("«Hissa foydasi» atamasi (sof foyda EMAS)");
    else bad("«Hissa foydasi» atamasi");
    if (/sof foyda/i.test(t)) bad("«sof foyda» ishlatilmagan", "topildi — noto'g'ri atama");
    else ok("«sof foyda» ishlatilmagan");
    await assertNoBadValues("Foydalilik");

    head("5b) Xona bo'limi — «foyda» emas, «bandlik»");
    await page.getByRole("button", { name: "Xonalar", exact: true }).first().click();
    await page.waitForTimeout(2000);
    t = await bodyText();
    if (/Bandlik/.test(t)) ok("bandlik ustuni bor");
    else bad("bandlik ustuni bor");
    if (/taxmin/i.test(t)) ok("mavjud soat TAXMIN ekani yozilgan");
    else bad("mavjud soat taxmin ekani yozilgan");

    // ══════════ 6) QARZDORLIK ══════════
    head("6) Qarzdorlik");
    await openTab(page, "Qarzdorlik");
    t = await bodyText();
    for (const l of ["Kutilgan", "Undirilgan", "Qoldiq", "Qarz yoshi"]) {
      if (t.includes(l)) ok(`ko'rinadi: ${l}`); else bad(`ko'rinadi: ${l}`);
    }
    await assertNoBadValues("Qarzdorlik");

    // ══════════ 7) PUL OQIMI ══════════
    head("7) Pul oqimi — foyda ≠ pul");
    await openTab(page, "Pul oqimi");
    t = await bodyText();
    if (/foyda emas/i.test(t)) ok("«foyda emas» izohi ko'rinadi");
    else bad("«foyda emas» izohi ko'rinadi");
    for (const l of ["Ochilish qoldig'i", "Yopilish qoldig'i", "Operatsion", "Moliyalashtirish"]) {
      if (t.includes(l)) ok(`ko'rinadi: ${l}`); else bad(`ko'rinadi: ${l}`);
    }
    await assertNoBadValues("Pul oqimi");

    // ══════════ 8) BYUDJET + TAHRIRLASH ══════════
    head("8) Byudjet vs fakt");
    await openTab(page, "Byudjet");
    t = await bodyText();
    if (/Byudjet/.test(t) && /Fakt/.test(t)) ok("byudjet/fakt ustunlari");
    else bad("byudjet/fakt ustunlari");
    if (/Oshib ketdi|Tejaldi|Rejada/.test(t)) ok("holat belgisi ko'rinadi");
    else bad("holat belgisi ko'rinadi");

    const editBtn = page.getByRole("button", { name: "Tahrirlash", exact: true }).first();
    if (await editBtn.count()) {
      await editBtn.click();
      await page.waitForTimeout(1500);
      const bt = await bodyText();
      if (bt.includes("Byudjetni tahrirlash")) ok("BYUDJET MUHARRIRI ochildi");
      else bad("byudjet muharriri ochildi");
      if (/REJA/i.test(bt)) ok("«byudjet — reja» izohi bor");
      else bad("«byudjet — reja» izohi bor");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    } else bad("tahrirlash tugmasi bor");
    await assertNoBadValues("Byudjet");

    // ══════════ 9) TEZ AMALLAR ══════════
    head("9) Tez amallar");
    t = await bodyText();
    for (const l of ["Chiqim", "To'lov", "Qaytarim", "O'tkazma", "Egasining puli"]) {
      if (t.includes(l)) ok(`tugma: ${l}`); else bad(`tugma: ${l}`);
    }
    const trBtn = page.getByRole("button", { name: "O'tkazma", exact: true }).first();
    if (await trBtn.count()) {
      await trBtn.click();
      await page.waitForTimeout(1200);
      const st = await bodyText();
      if (/Hisoblar orasida o'tkazma/.test(st)) ok("o'tkazma paneli ochildi");
      else bad("o'tkazma paneli ochildi");
      if (/o'zgarmaydi/.test(st)) ok("«umumiy qoldiq o'zgarmaydi» izohi");
      else bad("«umumiy qoldiq o'zgarmaydi» izohi");
      // ── «BARCHA FILIALLAR» REJIMIDA YOZISH TO'SILADI ──
      // Server bu holatda 400 qaytaradi (pul qaysi kassadan chiqishi
      // noaniq). UI buni OLDINDAN aytishi kerak — aks holda
      // foydalanuvchi butun formani to'ldirib, oxirida yiqilardi.
      const st2 = await bodyText();
      if (/Barcha filiallar.*rejimi|rejimi tanlangan/.test(st2)) {
        ok("«Barcha filiallar» rejimida ogohlantirish ko'rinadi");
        const sendBtn = page.getByRole("button", { name: "O'tkazish", exact: true });
        if (await sendBtn.isDisabled()) ok("yuborish tugmasi o'chirilgan");
        else bad("yuborish tugmasi o'chirilgan", "faol qolgan");
      } else bad("«Barcha filiallar» ogohlantirishi", "topilmadi");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }

    // ══════════ 9b) HAQIQIY AMAL — ANIQ FILIAL TANLANGANDA ══════════
    //
    // Talab 23-24: ruxsat etilgan moliyaviy amal bajariladi va
    // tahlil O'ZI yangilanadi.
    head("9b) Haqiqiy amal (aniq filial) + tahlil yangilanishi");
    // Filial ID si NODE tomonda olinadi (brauzer ichidan emas).
    let demoBranchId = null;
    try {
      const lr = await fetch(`${API}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: LOGIN, password: PASS }),
      });
      const lj = await lr.json();
      const token = lj?.data?.accessToken;
      const br = await fetch(`${API}/branches`, { headers: { Authorization: `Bearer ${token}` } });
      const bj = await br.json();
      const list = bj?.data?.items || bj?.data || [];
      demoBranchId = (list.find((b) => String(b.name || "").startsWith("DEMO")) || {}).id || null;
    } catch { demoBranchId = null; }
    if (demoBranchId) {
      await page.evaluate((id) => localStorage.setItem("activeBranchId", id), demoBranchId);
      await page.goto(`${BASE}/owner/finance`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await page.getByRole("button", { name: "O'tkazma", exact: true }).first().click();
      await page.waitForTimeout(1200);
      const amountInput = page.locator('input[inputmode="numeric"]').first();
      await amountInput.click();
      // IMask maskali input: `fill` onAccept ni ishga tushirmaydi —
      // HAQIQIY yozish kerak.
      await amountInput.type("150000", { delay: 50 });
      await page.waitForTimeout(500);
      const sendBtn = page.getByRole("button", { name: "O'tkazish", exact: true });
      if (await sendBtn.isDisabled()) {
        bad("aniq filialda tugma faol", "hali ham o'chirilgan");
      } else {
        ok("aniq filialda tugma faol");
        await sendBtn.click();
        await page.waitForTimeout(700);
        const confirmBtn = page.getByRole("button", { name: "Ha, tasdiqlayman", exact: true });
        if (await confirmBtn.count()) {
          ok("qaytarilmas amal uchun TASDIQ bosqichi bor");
          await confirmBtn.click();
          if (await waitForText(page, "bajarildi", 12000)) ok("o'tkazma bajarildi (haqiqiy yozuv)");
          else bad("o'tkazma bajarildi", "muvaffaqiyat xabari yo'q");
          await page.waitForTimeout(2500);
          const afterOp = await bodyText();
          if (afterOp.includes("Hissa foydasi")) ok("amaldan keyin tahlil qayta yuklandi");
          else bad("amaldan keyin tahlil qayta yuklandi");
          await assertNoBadValues("Amaldan keyin");
        } else bad("tasdiq bosqichi bor", "topilmadi");
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      // Ko'lamni qaytaramiz — keyingi bo'limlar "barcha filiallar"da.
      await page.evaluate(() => localStorage.setItem("activeBranchId", "all"));
    } else bad("DEMO filial topildi", "branches API javob bermadi");

    // ══════════ 10) RESPONSIV ══════════
    head("10) Responsiv");
    for (const [w, h, name] of [[1440, 900, "desktop"], [1024, 768, "tor desktop"], [820, 1180, "planshet"]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${BASE}/owner/finance`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2200);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow <= 2) ok(`${name} (${w}px): gorizontal toshish yo'q`);
      else bad(`${name} (${w}px): gorizontal toshish yo'q`, `${overflow}px toshdi`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // ══════════ 11) KONSOL ══════════
    head("11) Konsol xatolari");
    // 401/403 shovqini QA foydalanuvchisiga tegishli emas — ular
    // ruxsat tekshiruvining normal natijasi.
    const real = consoleErrors.filter((e) => !/401|403|Failed to load resource/.test(e));
    if (!real.length) ok("konsol toza", `${consoleErrors.length} ta filtrlangan`);
    else bad("konsol toza", real.slice(0, 3).join(" | ").slice(0, 200));

    // ══════════ 12) RUXSAT CHEGARALARI (brauzerda) ══════════
    //
    // Server allaqachon 403 qaytaradi (bu API testlarida tekshirilgan).
    // Bu yerdagi savol BOSHQA: cheklangan foydalanuvchi ekranda
    // sezgir bo'limni KO'RADIMI? Tugma ko'rinib, bosilgach 403 chiqsa —
    // bu ham nosozlik: foydalanuvchi huquqi bor deb o'ylaydi.
    head("12) Ruxsat chegaralari — brauzerda");
    for (const [login, label, expectHidden] of [
      ["demo_qa_read", "faqat finance.read", ["Foydalilik", "Pul oqimi", "Qarzdorlik"]],
      ["demo_qa_profit", "foydalilik bor, maosh yo'q", []],
    ]) {
      const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p2 = await c2.newPage();
      await p2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await p2.waitForSelector('input[name="username"]', { timeout: 20000 });
      await p2.fill('input[name="username"]', login);
      await p2.fill('input[name="password"]', process.env.QA_LIMITED_PASSWORD || "qa123456");
      await p2.press('input[name="password"]', "Enter");
      await p2.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
      await p2.waitForTimeout(1200);
      const g2 = p2.locator("[data-branch-gate]");
      if (await g2.count()) {
        await g2.locator("button", { hasText: "Barcha filiallar" }).first().click();
        await p2.waitForTimeout(2000);
      }
      await p2.goto(`${BASE}/owner/finance`, { waitUntil: "domcontentloaded" });
      await p2.waitForTimeout(2800);
      const nav = await p2.locator("nav").last().innerText().catch(() => "");
      const t2 = await p2.evaluate(() => document.body.innerText);

      for (const h of expectHidden) {
        if (nav.includes(h)) bad(`${label}: «${h}» tabi YASHIRIN`, "ko'rinib turibdi");
        else ok(`${label}: «${h}» tabi yashirin`);
      }
      if (t2.includes("Daromad")) ok(`${label}: umumiy bo'lim ochiq`);
      else bad(`${label}: umumiy bo'lim ochiq`, "KPI topilmadi");

      // Maosh ruxsati yo'q foydalanuvchi FOYDALILIK ichida
      // o'qituvchilar kesimini ko'rmasligi kerak.
      if (login === "demo_qa_profit") {
        const tab = p2.locator("nav").getByRole("button", { name: "Foydalilik", exact: true }).first();
        if (await tab.count()) {
          await tab.click();
          await p2.waitForTimeout(2500);
          const pt = await p2.evaluate(() => document.body.innerText);
          if (/ruxsat yo'q/i.test(pt)) ok("maoshsiz foydalanuvchi: o'qituvchilar kesimi YOPIQ");
          else bad("maoshsiz foydalanuvchi: o'qituvchilar kesimi yopiq", "ochiq ko'rinadi");
          if (/Yo'nalish/.test(pt)) ok("maoshsiz foydalanuvchi: yo'nalishlar OCHIQ");
          else bad("maoshsiz foydalanuvchi: yo'nalishlar ochiq");
        }
      }
      await c2.close();
    }

  } catch (e) {
    bad("test oqimi", e.message);
  } finally {
    await browser.close();
  }

  console.log(`\n=== BRAUZER QA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
  if (R.failures.length) { console.log("Muammolar:"); for (const f of R.failures) console.log("  • " + f); }
  process.exit(R.fail ? 1 : 0);
};

run();
