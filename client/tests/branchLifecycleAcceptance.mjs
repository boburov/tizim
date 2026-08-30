/**
 * BRAUZER TESTI — FILIAL OCHISH -> KO'P FILIALLI REJIM -> TAQQOSLASH.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA BU ALOHIDA VA NEGA U MUHIM
 *
 * `createAndCompareAcceptance.mjs` bir filialli bazada ishlaydi, ya'ni
 * u taqqoslashning ASOSIY yo'lini (checkbox, ikki qator, yonma-yon
 * raqamlar) UMUMAN ko'rmaydi.
 *
 * Bundan ham muhimi: "filial ochdim, endi taqqoslay olamanmi?" degan
 * o'tish nuqtasi. Server FAOL filiallar sonini KESHLAYDI va kesh
 * tozalanmasa markaz ikkinchi filial ochilgandan keyin ham o'zini
 * yakka deb hisoblab turaveradi - u holda yangi filial ma'lumoti
 * jimgina muzlab qoladi. Bu aynan shu testda tutiladi.
 *
 * TEST O'ZIDAN KEYIN TOZALAYDI: yaratilgan lid, direktor va filial
 * o'chiriladi. Tozalash muvaffaqiyatsiz bo'lsa test YIQILADI - qolib
 * ketgan filial keyingi testlarni va haqiqiy ishlatishni buzardi.
 *
 * DIQQAT: filial YUMSHOQ o'chiriladi (`isDeleted: true`) - server
 * ataylab shunday qiladi va test uni chetlab o'tmaydi. Ya'ni bazada
 * har ishga tushirishdan keyin bitta arxiv qatori qoladi. U hech
 * qayerda ko'rinmaydi va `isMultiBranch` hisobiga ham kirmaydi
 * (u faqat `isDeleted: false` larni sanaydi), lekin bilib qo'yish
 * kerak: ko'p marta ishlatilsa vaqti-vaqti bilan tozalash lozim.
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
  console.error("\nPLAYWRIGHT TOPILMADI - brauzer testi BAJARILMADI.\n");
  process.exit(2);
};
const pw = await resolvePlaywright();
const { pickEngine } = await import("./_engine.mjs");
const engine = pickEngine(pw);

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


// Nom va login noyob - test ketma-ket ishlatilishi mumkin.
const TAG = `t${Date.now().toString(36)}`;
const BRANCH_NAME = `Test filial ${TAG}`;
const LOGIN = `dir_${TAG}`;

const browser = await engine.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
const badRequests = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message.slice(0, 200)));
page.on("response", (res) => {
  const u = res.url();
  if (!u.startsWith(API)) return;
  if (res.status() >= 500 && res.status() !== 501) {
    badRequests.push({ url: u.replace(API, ""), status: res.status() });
  }
});

/**
 * Brauzerdagi sessiya bilan API chaqirish (urug'lantirish va tozalash).
 *
 * `headers` - `x-branch-id` uchun: lid QAYSI filialga tushishini server
 * kontekstdan oladi (`resolveBranchForWrite`), tanadagi maydondan emas.
 */
const api = (method, path, body, headers = {}) =>
  page.evaluate(
    async ([m, p, b, base, h]) => {
      // Kalit nomi `http.js` dagi bilan bir xil bo'lishi SHART -
      // noto'g'ri kalit 401 berib, tozalash jimgina bajarilmasdi.
      const token = localStorage.getItem("authToken");
      const res = await fetch(`${base}${p}`, {
        method: m,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...h,
        },
        ...(b ? { body: JSON.stringify(b) } : {}),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    [method, path, body ?? null, API, headers],
  );

let createdBranchId = null;
let createdUserId = null;
let mainBranchId = null;
// Markaz test BOSHLANISHIDA ko'p filialli edimi. Tozalashdan keyin
// AYNAN SHU holatga qaytishi kerak - "false" deb qat'iy kutish
// noto'g'ri bo'lardi: bazada allaqachon bir nechta filial bo'lishi
// mumkin va test ularni o'chirmaydi.
let startedMulti = null;
const createdLeadIds = [];

const run = async () => {
  console.log("\n═══ FILIAL OCHISH -> TAQQOSLASH ═══\n");

  // ── 0) kirish ──
  console.log("0) kirish");
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', "owner");
  await page.fill('input[name="password"]', "owner123");
  await page.press('input[name="password"]', "Enter");
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
  ok("login", page.url().replace(APP, ""));

  await page.waitForTimeout(1200);
  if (await passBranchGate(page)) ok("majburiy filial tanlash ekrani o'tildi");

  const meBefore = await api("GET", "/auth/me");
  startedMulti = meBefore.body?.data?.multiBranch === true;

  const before = await api("GET", "/branches?includeInactive=true");
  const beforeList = before.body?.data || [];
  mainBranchId = beforeList[0]?._id || beforeList[0]?.id || null;
  ok("boshlang'ich filial soni", String(beforeList.length));

  // ── 1) FILIAL YARATISH: uchta maydon, bitta yuborish ──
  console.log("\n1) filial yaratish (nom + login + parol)");
  await page.goto(`${APP}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  await page.locator('button[aria-label="Yaratish turini tanlash"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-create-key="branch"]').click();
  await page.waitForTimeout(800);

  const dlg = page.locator('[role="dialog"]:has-text("Yangi filial")');
  check("modal ochildi", (await dlg.count()) === 1);

  await dlg.locator('input[name="name"]').fill(BRANCH_NAME);
  await dlg.locator('input[name="username"]').fill(LOGIN);
  await dlg.locator('input[name="password"]').fill("parol123");

  const submit = dlg.locator('button[type="submit"]');
  check("Yaratish tugmasi FAOL (uchta maydon yetarli)", await submit.isEnabled());

  await submit.click();
  // Yaratish + `invalidateQueries` -> /auth/me qayta o'qiladi.
  await page.waitForTimeout(3500);

  check("modal yopildi (yaratish muvaffaqiyatli)", (await dlg.count()) === 0);

  const after = await api("GET", "/branches?includeInactive=true");
  const created = (after.body?.data || []).find((b) => b.name === BRANCH_NAME);
  createdBranchId = created?._id || created?.id || null;
  check("filial bazada paydo bo'ldi", Boolean(createdBranchId), BRANCH_NAME);

  // ── 2) DIREKTOR HISOBI OCHILDI ──
  console.log("\n2) direktor hisobi");
  // KONTEKST YANGI FILIAL: foydalanuvchilar ro'yxati filial ko'lami
  // bilan kesiladi, ya'ni asosiy filial kontekstida yangi filialning
  // direktori (to'g'ri ravishda) KO'RINMAYDI.
  // `role=director` SHART: `/users` standart holatda faqat o'quvchi va
  // o'qituvchini qaytaradi (`staff` bayrog'i yoki aniq `role` kerak) -
  // direktor ikkalasiga ham kirmaydi.
  const users = await api(
    "GET",
    `/users?role=director&search=${LOGIN}&limit=5`,
    null,
    { "x-branch-id": createdBranchId },
  );
  const dir = (users.body?.data || []).find((u) => u.username === LOGIN);
  createdUserId = dir?._id || dir?.id || null;
  check("direktor hisobi yaratildi", Boolean(createdUserId), dir?.username || "topilmadi");
  // ISM SO'RALMAGAN EDI - server ko'rinadigan o'rinbosar qo'yadi.
  check(
    "ism o'rinbosari KO'RINADIGAN ('Direktor <filial nomi>')",
    dir?.firstName === "Direktor" && dir?.lastName === BRANCH_NAME,
    `${dir?.firstName} ${dir?.lastName}`,
  );
  check("roli 'director'", dir?.role === "director", String(dir?.role));

  // ── 3) KO'P FILIALLI REJIMGA O'TDI (KESH TOZALANDI) ──
  console.log("\n3) ko'p filialli rejim (server keshi)");
  const me = await api("GET", "/auth/me");
  check(
    "SERVER QAYTA ISHGA TUSHIRILMASDAN multiBranch = true",
    me.body?.data?.multiBranch === true,
    `multiBranch=${me.body?.data?.multiBranch}`,
  );

  // ── NAVIGATSIYA ENDI ISH MAKONI SIDEBAR'IDA ──
  //
  // Ilgari bu tekshiruv rahbariyat qobig'ining yuqori navigatsiyasini
  // o'qirdi. Endi "Filiallar" — TASHKILOT ish makonining sidebar
  // yozuvi (`/org/branches`), ya'ni ikkinchi filial ochilgach u aynan
  // o'sha yerda paydo bo'lishi kerak.
  await page.goto(`${APP}/org`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const navTexts = (
    await page.locator('[data-sidebar="sidebar"] a span').allInnerTexts()
  ).map((t) => t.trim());
  check(
    "'Filiallar' bo'limi navigatsiyada paydo bo'ldi",
    navTexts.some((t) => /^Filiallar$/i.test(t)),
    navTexts.join(" | "),
  );

  // ── 4) URUG'LANTIRISH: har filialga bittadan lid ──
  //
  // Bo'sh bazada uchala bo'lim ham (to'g'ri) "ma'lumot yo'q" holatini
  // ko'rsatadi va taqqoslashning O'ZAGI - ikki filial yonma-yon
  // ko'rinishi - umuman tekshirilmay qolardi. Shuning uchun eng arzon
  // ma'lumot kiritiladi: bittadan lid.
  //
  // Filial `x-branch-id` KONTEKSTIDAN olinadi (`resolveBranchForWrite`),
  // tanadagi maydondan emas.
  console.log("\n4) sotuv ma'lumoti bilan urug'lantirish");
  for (const [bid, label] of [[mainBranchId, "asosiy"], [createdBranchId, "yangi"]]) {
    if (!bid) continue;
    const r = await api(
      "POST",
      "/leads",
      { firstName: `Lid ${TAG}`, phone: "+998900000001", status: "new" },
      { "x-branch-id": bid },
    );
    const id = r.body?.data?._id || r.body?.data?.id;
    if (id) createdLeadIds.push(id);
    check(`${label} filialga lid qo'shildi`, Boolean(id), `HTTP ${r.status}`);
  }

  // ── 5) TAQQOSLASH: ikki qator, checkbox tanlagich ──
  console.log("\n5) /admin/filiallar — taqqoslash");
  await page.goto(`${APP}/admin/filiallar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // ── OGOHLANTIRISH VA UNING AMAL TUGMASI ──
  //
  // Yangi filial ochilgach global kontekst hamon ESKI filialda qoladi
  // (u yakka rejimda tanlangan edi), ya'ni kesim bitta qatorni
  // ko'rsatadi. Bu TO'G'RI xatti-harakat - server ko'lami mijoz
  // tanloviga bo'ysunadi. Muhimi: foydalanuvchi tuzoqda qolmasligi.
  // TEKSHIRUV SHARTLI: ogohlantirish faqat BITTA filial tanlangan
  // bo'lsa chiqadi. Kirish paytida majburiy tanlash ekrani "Barcha
  // filiallar" bilan o'tilgan bo'lsa, uning YO'QLIGI to'g'ri holat -
  // uni qat'iy talab qilish testning o'z xatosi bo'lardi.
  const switchBtn = page.locator('button:has-text("Barcha filiallarga o\'tish")');
  if (await switchBtn.count()) {
    ok("bitta filial rejimida OGOHLANTIRISH + amal tugmasi chiqdi");
    await switchBtn.click();
    // `changeBranch` butun keshni bekor qiladi -> hamma so'rov qayta ketadi.
    await page.waitForTimeout(3500);
    check("tugma bosilgach ogohlantirish yo'qoldi (barcha filiallar rejimi)",
      (await page.locator('button:has-text("Barcha filiallarga o\'tish")').count()) === 0);
  } else {
    ok("allaqachon 'Barcha filiallar' rejimi — ogohlantirish kerak emas");
  }

  const tables = await page.locator("main table").count();
  check("jadval chizildi", tables >= 1, `${tables} jadval`);

  // SOTUV jadvali - urug'lantirilgan yagona bo'lim. Moliya va o'qituvchi
  // bo'limlari bo'sh bazada (to'g'ri) "ma'lumot yo'q" ko'rsatadi, ya'ni
  // ularda jadval BO'LMASLIGI ham to'g'ri holat.
  const salesTable = page.locator("main table").last();
  const salesRows = await salesTable.locator("tbody tr").count();
  // Lid faqat IKKI filialga urug'lantirildi; sotuv kesimi lidi bo'lmagan
  // filialni umuman qatorga chiqarmaydi, ya'ni aynan ikkita bo'ladi.
  check("sotuv jadvalida IKKI filial qatori", salesRows === 2, `${salesRows} qator`);

  const bodyText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  check("yangi filial nomi jadvalda ko'rinadi", bodyText.includes(BRANCH_NAME));

  // ── checkbox tanlagich ──
  //
  // FAQAT KO'RINADIGAN TUGMA. "Barcha filiallar" yozuvi ikki joyda:
  // taqqoslash bo'limidagi tanlagichda va MOBIL sarlavhadagi
  // `BranchBadge` da. Ikkinchisi desktopda `md:hidden` — o'lchami
  // 0×0, ya'ni bosib bo'lmaydi.
  //
  // Ilgari `main` bilan cheklash yetarli edi (sarlavha `main` dan
  // tashqarida edi). Yagona qobiqqa o'tilgach u ichkariga tushdi va
  // `.first()` ko'rinmas tugmani tanlab, klik 30 soniya kutardi.
  const picker = page.locator('main button:visible', { hasText: "Barcha filiallar" }).first();
  check("filial tanlagichi ko'rinadi", (await picker.count()) === 1);

  await picker.click();
  await page.waitForTimeout(900);
  // cmdk ro'yxatining o'zi - `[cmdk-item]` atributi bilan. Nom bo'yicha
  // `:has-text` ISHLATILMAYDI: nom ichida bo'shliq va raqam bor, cmdk
  // esa matnni normallashtiradi. Indeks bo'yicha tanlash barqarorroq.
  const opts = page.locator("[cmdk-item]");
  const optCount = await opts.count();
  // Bazadagi filiallar soni oldindan noma'lum - test faqat O'ZI
  // yaratganini kafolatlaydi. Shuning uchun "kamida ikkita".
  check("tanlagichda checkbox variantlari bor", optCount >= 2, `${optCount} variant`);

  const optTexts = (await opts.allInnerTexts()).map((t) => t.trim());
  const newIdx = optTexts.findIndex((t) => t.includes(BRANCH_NAME));
  check("yangi filial tanlagichda ko'rinadi", newIdx >= 0, optTexts.join(" | "));

  if (newIdx >= 0) {
    await opts.nth(newIdx).click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    const salesAfter = page.locator("main table").last();
    const filteredRows = await salesAfter.locator("tbody tr").count();
    check("tanlovdan keyin jadval BITTA qatorga qisqardi", filteredRows === 1,
      `${filteredRows} qator`);

    const filteredText = await salesAfter.innerText();
    check("qolgan qator - aynan tanlangan filial", filteredText.includes(BRANCH_NAME));

    // "Barchasi" tugmasi filtrni bekor qiladi.
    const resetBtn = page.locator('button:has-text("Barchasi")').first();
    if (await resetBtn.count()) {
      await resetBtn.click();
      await page.waitForTimeout(1500);
      const restored = await page.locator("main table").last().locator("tbody tr").count();
      check("'Barchasi' filtrni bekor qildi", restored > 1, `${restored} qator`);
    } else {
      bad("'Barchasi' tugmasi topilmadi");
    }
  }

  // ── 5) YAKUNIY ──
  console.log("\n6) konsol va tarmoq");
  const realErrors = consoleErrors.filter(
    (e) => !/Download the React DevTools|status of 501|status of 40[0-9]/i.test(e),
  );
  check("konsol xatolari YO'Q", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  check("5xx javob YO'Q", badRequests.length === 0,
    badRequests.map((r) => `${r.status} ${r.url}`).join(", "));
};

const cleanup = async () => {
  console.log("\n7) tozalash");
  for (const id of createdLeadIds) {
    const r = await api("DELETE", `/leads/${id}`);
    check("lid o'chirildi", r.status >= 200 && r.status < 300, `HTTP ${r.status}`);
  }
  // TARTIB MUHIM: server foydalanuvchisi bor filialni o'chirishga yo'l
  // qo'ymaydi ("yetim guruh/foydalanuvchi qolmasin"), shuning uchun
  // avval direktor, keyin filial.
  if (createdUserId) {
    // BUTUNLAY o'chiramiz, arxivlamaymiz: arxivlangan foydalanuvchi ham
    // filialga bog'liq bo'lib qoladi va keyingi ishga tushirishda
    // "qolib ketgan" yozuv sifatida to'planardi.
    const r = await api("DELETE", `/users/${createdUserId}/permanent`, null, {
      "x-branch-id": createdBranchId,
    });
    check("direktor o'chirildi", r.status >= 200 && r.status < 300, `HTTP ${r.status}`);
  }
  if (createdBranchId) {
    const r = await api("DELETE", `/branches/${createdBranchId}`);
    check("filial o'chirildi", r.status >= 200 && r.status < 300,
      `HTTP ${r.status} ${r.body?.message || ""}`);
  }

  // Rejim yana yakka markazga qaytdimi - kesh tozalanishining IKKINCHI
  // yo'nalishi (o'chirish) ham tekshiriladi.
  // KESH TOZALANISHINING IKKINCHI YO'NALISHI: o'chirilgach rejim test
  // boshlanishidagi holatga QAYTISHI kerak.
  const me = await api("GET", "/auth/me");
  check(
    "o'chirilgach rejim boshlang'ich holatga qaytdi",
    me.body?.data?.multiBranch === startedMulti,
    `multiBranch=${me.body?.data?.multiBranch}, boshlanishida=${startedMulti}`,
  );
};

try {
  await run();
} catch (err) {
  bad("test yiqildi", String(err?.message).slice(0, 200));
} finally {
  try {
    await cleanup();
  } catch (err) {
    bad("TOZALASH XATOSI", String(err?.message).slice(0, 200));
  }
  await browser.close();
}

console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
process.exit(R.fail ? 1 : 0);
