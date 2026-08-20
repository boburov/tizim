/**
 * ══════════════════════════════════════════════════════════════════════
 * ISH MAKONI XAVFSIZLIK AUDITI (talab 27, 33)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu test emas — CHEGARA TEKSHIRUVI. U ishlab turgan serverga HAQIQIY
 * HTTP so'rovlar yuboradi va to'rt ish makonining chegarasi AMALDA
 * ushlab turishini tasdiqlaydi. Kod o'qish bilan emas, xatti-harakat
 * bilan.
 *
 * ── ASOSIY QOIDA (talab 27) ──
 * UI hech qachon xavfsizlik chegarasi emas. Shuning uchun bu yerda
 * brauzer YO'Q: har so'rov to'g'ridan-to'g'ri API ga ketadi, xuddi
 * hujumchi yuborgandek.
 *
 * ISHLATISH:
 *   node tests/fixtures/qaUsers.mjs     # sinov foydalanuvchilari
 *   node tests/workspaceSecurityAudit.mjs
 *   node tests/fixtures/qaUsers.mjs --clean
 */
import "dotenv/config";

const API = process.env.API || "http://localhost:5000/api";
const R = { pass: 0, fail: 0, warn: 0, failures: [] };
const ok = (n, e = "") => { R.pass += 1; console.log(`  ✅ ${n}${e ? ` — ${e}` : ""}`); };
const bad = (n, e = "") => { R.fail += 1; R.failures.push(`${n} — ${e}`); console.log(`  ❌ ${n} — ${e}`); };
/** O'LCHANMADI — «o'tdi» ham emas, «yiqildi» ham emas. */
const warn = (n, e = "") => { R.warn += 1; console.log(`  ⚠️  ${n}${e ? ` — ${e}` : ""}`); };
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const login = async (l, p) => {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: l, password: p }),
  });
  return (await r.json().catch(() => ({})))?.data?.accessToken || null;
};
const req = (method, path, token, { body, headers } = {}) =>
  fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const get = (p, t, h) => req("GET", p, t, { headers: h });
const post = (p, t, b) => req("POST", p, t, { body: b });

/** Kutilgan status(lar)dan biri kelishi shart. */
const expect = async (name, promise, allowed) => {
  const r = await promise;
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (list.includes(r.status)) ok(name, String(r.status));
  else bad(name, `kutilgan ${list.join("/")}, kelgani ${r.status}`);
  return r;
};

const run = async () => {
  console.log("\n=== ISH MAKONI XAVFSIZLIK AUDITI ===\n");

  const owner = await login("owner", "owner123");
  if (!owner) { bad("owner login", "server ishlayaptimi?"); return; }
  const adminA = await login("qa_admin_a", "qa123456");
  const adminB = await login("qa_admin_b", "qa123456");
  const staff = await login("qa_staff_a", "qa123456");
  // `users.read` BOR, `finance.read` YO'Q — qidiruvdagi to'lov
  // bo'limining chegarasini aynan shu kombinatsiya sinaydi.
  const people = await login("qa_people_a", "qa123456");
  const student = await login("demo_student_1", "qa123456");

  for (const [n, t] of [["qa_admin_a", adminA], ["qa_admin_b", adminB],
    ["qa_staff_a", staff]]) {
    if (!t) bad(`${n} login`, "fixture ishga tushirilganmi? (tests/fixtures/qaUsers.mjs)");
  }
  // O'QUVCHI IXTIYORIY: u moliya demo seed'i bilan keladi. Yo'q bo'lsa
  // tegishli bo'lim O'TKAZIB YUBORILADI — auditni yiqitish noto'g'ri
  // signal berardi ("chegara buzilgan"), holbuki chegara emas,
  // MA'LUMOT yo'q.
  if (!student) warn("demo_student_1 yo'q", "o'quvchi bo'limi tekshirilmadi");
  if (!adminA || !adminB) return;

  // ══════════════════════════════════════════════════════════════════
  // IKKI FILIAL — ADMINNING O'Z BIRIKTIRILISHIDAN O'QILADI
  // ══════════════════════════════════════════════════════════════════
  //
  // ── NEGA TAXMIN QILINMAYDI ──
  // Bu yerda avval filial NOM bo'yicha tanlanardi ("DEMO..." yoki
  // `isMain`). Muammo shundaki, fixture ham filialni O'ZICHA tanlaydi
  // va ikkala mantiq ajralishi bilan audit YOLG'ON gapira boshlaydi:
  // "A admini O'Z filialini so'raydi → 403" deb yozadi, aslida esa u
  // BOSHQA filialni so'ragan bo'ladi. Bu aynan yuz berdi.
  //
  // Endi haqiqat manbai bitta: `/auth/me` qa_admin_a ga QAYSI filial
  // biriktirilganini aytadi. B — undan boshqa istalgan filial.
  const meA = await (await get("/auth/me", adminA)).json();
  const A = (meA?.data?.branches || [])[0];
  const branches = ((await (await get("/branches", owner)).json()).data || [])
    .filter((b) => !b.isDeleted);
  const B = branches.find((b) => (b.id || b._id) !== (A?.id || A?._id));
  if (!A || !B) {
    bad("ikkita filial kerak", `admin filiali: ${A?.name || "yo'q"}, jami: ${branches.length}`);
    return;
  }
  ok("ko'lam manbai", `A = ${A.name} (adminning o'z filiali) · B = ${B.name}`);

  // ══════════════════════════════════════════════════════════════════
  head("1) Autentifikatsiyasiz kirish — hamma joy yopiq");
  for (const p of [
    "/finance-analytics/summary", "/branches", "/rooms", "/users",
    "/search?q=ali", "/ledger/me", "/roles",
  ]) {
    await expect(`${p} → 401`, get(p, null), 401);
  }

  // ══════════════════════════════════════════════════════════════════
  head("2) FILIAL KO'LAMI — query parametri bilan kengaytirib bo'lmaydi");
  //
  // Talab 27: "Admin attempts to change a URL/query parameter to
  // another branch → backend blocks it."
  for (const p of [
    "/finance-analytics/summary",
    "/finance-analytics/revenue/by/group",
    "/finance-analytics/revenue/by/student",
    "/finance-analytics/expenses/by/category",
    "/finance-analytics/entries",
    "/finance-analytics/receivables",
    "/finance-analytics/intelligence",
  ]) {
    const sep = p.includes("?") ? "&" : "?";
    await expect(`B admini A ni so'raydi: ${p}`, get(`${p}${sep}branchId=${A.id}`, adminB), 403);
  }
  // O'Z filialini aniq ko'rsatish ISHLASHI SHART — aks holda "filialga
  // kirib ishlash" oqimi buzilardi.
  await expect("A admini O'Z filialini so'raydi", get(`/finance-analytics/summary?branchId=${A.id}`, adminA), 200);
  // Ega har filialni ko'radi.
  await expect("ega A ni so'raydi", get(`/finance-analytics/summary?branchId=${A.id}`, owner), 200);
  await expect("ega B ni so'raydi", get(`/finance-analytics/summary?branchId=${B.id}`, owner), 200);

  // ══════════════════════════════════════════════════════════════════
  head("3) FILIAL KO'LAMI — sarlavha bilan ham kengaytirib bo'lmaydi");
  const hdr = await get("/finance-analytics/summary", adminB, { "x-branch-id": A.id });
  const hdrBody = await hdr.json().catch(() => ({}));
  const leaked = Number(hdrBody?.data?.revenue?.current || 0);
  if (leaked === 0) ok("x-branch-id e'tiborsiz qoldirildi", "daromad 0");
  else bad("x-branch-id orqali sizish", `boshqa filial daromadi ko'rindi: ${leaked}`);

  // ══════════════════════════════════════════════════════════════════
  head("3b) DEPOZIT HISOBOTI — boshqa filial puli qo'shilmaydi");
  //
  // ── NEGA ALOHIDA TEKSHIRUV ──
  // Hisobot ID QAYTARMAYDI, faqat SONLARNI. Ro'yxat sizishini ko'rish
  // oson (begona ism ko'rinadi), yig'indidagi sizish esa KO'RINMAYDI —
  // raqam shunchaki kattaroq bo'ladi va uni hech kim tekshirmaydi.
  //
  // Eski `test:scope` shu xususiyatni qo'riqlardi, lekin u fiksturani
  // Mongoose bilan yozadi, servis esa Prisma bilan o'qiydi (migratsiya
  // qoldig'i) — ya'ni u hozir HECH NARSANI tasdiqlamayapti. Bu yerda
  // xususiyat HTTP orqali, haqiqiy ko'lam bilan tekshiriladi.
  {
    const rOwner = await (await get("/deposits/report", owner)).json();
    const rAdminA = await (await get("/deposits/report", adminA)).json();
    const rAdminB = await (await get("/deposits/report", adminB)).json();
    const num = (r) => Number(r?.data?.totalTopup ?? r?.data?.topup ?? 0);
    const all = num(rOwner);
    const a = num(rAdminA);
    const b = num(rAdminB);

    // ── BO'SH MA'LUMOTDA «O'TDI» DEB YOZMAYMIZ ──
    //
    // Demo seed depozit tranzaksiyasi YARATMAYDI, ya'ni uchala raqam
    // ham nol bo'lishi mumkin. `0 ≤ 0` shartini «o'tdi» deb belgilash
    // eng yomon turdagi yolg'on bo'lardi: audit yashil, xususiyat esa
    // umuman tekshirilmagan.
    //
    // Aynan shu sabab eski `test:scope` ni ham chalg'itgan edi — u
    // nolni ko'rib «kutilmagan qiymat» deb yiqilardi, lekin hech kim
    // sababini tekshirmasdi (fikstura Mongoose bilan yozilardi,
    // servis esa Prisma bilan o'qiydi).
    if (all === 0 && a === 0 && b === 0) {
      warn("depozit hisoboti ko'lami — O'LCHANMADI",
        "bazada depozit tranzaksiyasi yo'q; xususiyat tekshirilmadi");
    } else {
      if (a <= all) ok("A admini hisoboti tashkilotdan oshmaydi", `${a} ≤ ${all}`);
      else bad("A admini hisoboti tashkilotdan KATTA", `${a} > ${all}`);
      if (b < a || b === 0) ok("B admini A filialining pulini ko'rmaydi", `B=${b}, A=${a}`);
      else bad("depozit hisobotida filial sizishi", `B=${b}, A=${a}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  head("4) FILIAL BOSHQARUVI — admin filial ocha olmaydi");
  await expect("admin POST /branches", post("/branches", adminA, { name: "Hack", code: "HK" }), 403);
  await expect("xodim POST /branches", post("/branches", staff, { name: "Hack", code: "HK" }), 403);
  await expect("admin B filial statistikasi", get(`/branches/${B.id}/stats`, adminA), [403, 404]);

  // ══════════════════════════════════════════════════════════════════
  head("5) EGASINING PULI — alohida ruxsat");
  await expect("admin owner-capital", post("/finance-ops/owner-capital", adminA,
    { type: "investment", amount: 1000, accountKind: "cash" }), 403);
  await expect("xodim owner-capital", post("/finance-ops/owner-capital", staff,
    { type: "investment", amount: 1000, accountKind: "cash" }), 403);

  // ══════════════════════════════════════════════════════════════════
  head("6) MAOSH — ruxsatsiz ko'rinmaydi");
  await expect("admin /finance-analytics/teachers", get("/finance-analytics/teachers", adminA), 403);
  await expect("admin chiqim kesimi ODAM bo'yicha", get("/finance-analytics/expenses/by/person", adminA), 403);
  await expect("admin chiqim kesimi KATEGORIYA bo'yicha", get("/finance-analytics/expenses/by/category", adminA), 200);
  await expect("admin /staff-payroll", get("/staff-payroll", adminA), 403);

  // ══════════════════════════════════════════════════════════════════
  head("7) FOYDALILIK — alohida ruxsat (maosh tannarxini ochadi)");
  for (const p of ["/finance-analytics/directions", "/finance-analytics/groups",
    "/finance-analytics/rooms", "/finance-analytics/branches"]) {
    await expect(`admin ${p}`, get(p, adminA), 403);
  }

  // ══════════════════════════════════════════════════════════════════
  head("8) ROLLAR — admin vakolat bera olmaydi");
  await expect("admin GET /roles", get("/roles", adminA), 403);
  await expect("admin PATCH /roles/qa_staff", req("PATCH", "/roles/qa_staff", adminA,
    { body: { permissionIds: [] } }), 403);

  // ══════════════════════════════════════════════════════════════════
  head("9) XODIM — tashkilot moliyasi yopiq");
  for (const p of ["/finance-analytics/summary", "/finance-analytics/entries",
    "/finance-analytics/cash-flow", "/finance-analytics/receivables"]) {
    await expect(`xodim ${p}`, get(p, staff), 403);
  }

  // ══════════════════════════════════════════════════════════════════
  head("10) O'QUVCHI — faqat o'zini ko'radi");
  // TOKEN YO'Q BO'LSA TEKSHIRMAYMIZ. Aks holda har so'rov 401 qaytaradi
  // va audit "chegara buzilgan" degan ELEVEN TA soxta muammo
  // ko'rsatadi — aslida shunchaki o'quvchi yaratilmagan.
  if (!student) {
    warn("o'quvchi chegarasi", "demo_student_1 yo'q — tekshirilmadi");
  } else {
  await expect("o'quvchi /ledger/me", get("/ledger/me", student), 200);
  await expect("o'quvchi /finance-analytics/summary", get("/finance-analytics/summary", student), 403);
  await expect("o'quvchi /users", get("/users", student), 403);
  await expect("o'quvchi /branches/:id/stats", get(`/branches/${A.id}/stats`, student), 403);
  await expect("o'quvchi /roles", get("/roles", student), 403);
  // Boshqa odamning hisobvarag'i
  const others = (await (await get("/users?role=student&limit=2", owner)).json()).data || [];
  const other = others.find?.((u) => u.username !== "demo_student_1");
  if (other) {
    await expect("o'quvchi BOSHQA o'quvchi hisobvarag'i", get(`/ledger/${other.id}`, student), [403, 404]);
  }
  }

  // ══════════════════════════════════════════════════════════════════
  head("11) QIDIRUV — filial chegarasini hurmat qiladi");

  // ══════════════════════════════════════════════════════════════════
  // MUSBAT NAZORAT — SIZISH TESTINING SHARTI
  // ══════════════════════════════════════════════════════════════════
  //
  // "B admini A filialidagilarni topmadi" degan tekshiruv BO'SH bazada
  // ham o'tadi: u yerda hech kim hech kimni topmaydi. Ya'ni tekshiruv
  // yashil bo'ladi-yu, HECH NARSANI isbotlamaydi — bu eng yomon
  // turdagi test, chunki u xotirjamlik beradi.
  //
  // Shuning uchun avval MUSBAT NAZORAT: A admini o'z filialida biror
  // narsani topishi kerak. Topmasa — bazada ma'lumot yo'q va sizish
  // testi O'TKAZIB YUBORILADI (yiqilmaydi ham, o'tmaydi ham).
  //
  // Qidiruv so'zi ham bazadan olinadi: ilgari bu yerda "Demo" qattiq
  // yozilgan edi va audit faqat demo seed ishlatilgan bazada
  // ma'noli natija berardi.
  const someone = ((await (await get("/users?limit=1", owner)).json()).data || [])[0];
  const term = String(someone?.firstName || someone?.username || "").slice(0, 4);

  const cnt = (d) => (d?.students?.length || 0) + (d?.teachers?.length || 0) + (d?.groups?.length || 0);
  const sA = term ? await (await get(`/search?q=${encodeURIComponent(term)}`, adminA)).json() : null;
  const sB = term ? await (await get(`/search?q=${encodeURIComponent(term)}`, adminB)).json() : null;

  if (!term || cnt(sA?.data) === 0) {
    warn("qidiruvda filial chegarasi",
      "musbat nazorat bo'sh (bazada qidiriladigan odam yo'q) — sizish testi ma'nosiz");
  } else {
    ok("A admini o'z filialidagilarni topadi", `${cnt(sA.data)} natija`);
    if (cnt(sB.data) === 0) ok("B admini A filialidagilarni TOPMAYDI", "0 natija");
    else bad("qidiruvda filial sizishi", `${cnt(sB.data)} begona natija`);
  }
  if (student) await expect("o'quvchi qidiruvi yopiq", get("/search?q=Demo", student), 403);
  else warn("o'quvchi qidiruvi", "demo_student_1 yo'q — tekshirilmadi");
  await expect("xodim qidiruvi yopiq (users.read yo'q)", get("/search?q=Demo", staff), 403);

  // ── TO'LOV NATIJALARI `finance.read` TALAB QILADI ──
  //
  // Odamlarni ko'rish huquqi PULNI ko'rish huquqini BERMAYDI.
  // Bu yerda ikkalasi bir so'rovda qaytadi, ya'ni chegara javob
  // ichida — eng oson unutiladigan turdagi chegara.
  const q = term ? `?q=${encodeURIComponent(term)}` : "?q=a";
  const payOwner = await (await get(`/search${q}`, owner)).json();
  const payPeople = await (await get(`/search${q}`, people)).json();
  const nOwner = payOwner?.data?.payments?.length || 0;
  const nPeople = payPeople?.data?.payments?.length ?? -1;

  // Bu yerda ham musbat nazorat: ega to'lovni KO'RMASA, "odamlar roli
  // to'lovni ko'rmadi" degan xulosa hech narsani isbotlamaydi.
  if (nOwner > 0) {
    ok("ega qidiruvda to'lovlarni ko'radi", `${nOwner} ta`);
    if (nPeople === 0) ok("odamlar roli TO'LOVLARNI ko'rmaydi", "0 ta");
    else bad("qidiruvda to'lov sizishi", `${nPeople} ta to'lov ko'rindi`);
  } else {
    warn("qidiruvda to'lov chegarasi",
      "bazada to'lov yo'q — musbat nazoratsiz sizish testi ma'nosiz");
  }

  // ══════════════════════════════════════════════════════════════════
  head("12) O'QUVCHI MOLIYAVIY YO'LI — ko'lamdan tashqarida ko'rinmaydi");
  const demoStudents = (await (await get(`/finance-analytics/revenue/by/student?branchId=${A.id}`, owner)).json()).data || [];
  if (demoStudents[0]) {
    await expect("ega A o'quvchisining moliyasi", get(`/finance-analytics/students/${demoStudents[0].id}`, owner), 200);
    await expect("A admini o'z o'quvchisi", get(`/finance-analytics/students/${demoStudents[0].id}`, adminA), 200);
    await expect("B admini A o'quvchisi", get(`/finance-analytics/students/${demoStudents[0].id}`, adminB), 404);
    await expect("xodim o'quvchi moliyasi", get(`/finance-analytics/students/${demoStudents[0].id}`, staff), 403);
  } else {
    warn("o'quvchi moliyaviy yo'li", "bazada to'lov qilgan o'quvchi yo'q — tekshirilmadi");
  }

  // ══════════════════════════════════════════════════════════════════
  head("13) YOZISH AMALLARI — tahlil qatlamida yozuv YO'Q");
  for (const p of ["/finance-analytics/summary", "/finance-analytics/entries"]) {
    await expect(`POST ${p} qabul qilinmaydi`, post(p, owner, {}), [404, 405]);
  }

  // ══════════════════════════════════════════════════════════════════
  head("14) XONALAR — filial chegarasi (talab 11, 32, 33)");
  {
    {
      const aId = A.id || A._id;
      const bId = B.id || B._id;

      // ── O'QISH ──
      //
      // A admini B filialining xonalarini SO'RASA — 403. Bu `branchId`
      // parametri qo'shilganda paydo bo'lgan yangi yuza: parametrsiz
      // ham ko'lam ushlab turadi, lekin parametr bilan u KENGAYTIRISH
      // vositasiga aylanmasligi kerak.
      await expect("A admini: B filialining xonalari", get(`/rooms?branchId=${bId}`, adminA), 403);
      await expect("A admini: O'Z filialining xonalari", get(`/rooms?branchId=${aId}`, adminA), 200);

      // Parametrsiz so'rov O'Z filiali bilan chegaralanadi.
      const mine = await get("/rooms", adminA);
      const mineBody = await mine.json().catch(() => ({}));
      const foreign = (mineBody.data || []).filter((r) => {
        const rb = r.branchId?._id || r.branchId?.id || r.branchId;
        return String(rb) !== String(aId);
      });
      if (foreign.length === 0) ok("A admini: ro'yxatda faqat o'z filiali");
      else bad("A admini: ro'yxatda begona filial xonasi", `${foreign.length} ta`);

      // ── YOZISH ──
      //
      // Eng muhim qator: A admini B filialiga xona QO'SHA OLMAYDI.
      // Frontend bunday imkoniyatni ko'rsatmaydi (forma filial
      // tanlagichisiz), lekin himoya SHU YERDA — so'rovni qo'lda
      // yozish har doim mumkin.
      await expect(
        "A admini: B filialiga xona qo'shish",
        post("/rooms", adminA, { name: "ZZAUDIT xona", branchId: bId }),
        403,
      );

      // ── BANDLIK TAHLILI ──
      await expect(
        "A admini: B filialining bandlik tahlili",
        get(`/branch-analytics/rooms?branchId=${bId}`, adminA),
        403,
      );
      await expect(
        "A admini: o'z bandlik tahlili",
        get("/branch-analytics/rooms", adminA),
        200,
      );
      // Xonalarni ko'rish ruxsati YO'Q xodim uchun yopiq.
      await expect("xodim: bandlik tahlili", get("/branch-analytics/rooms", staff), 403);

      // Bandlik javobida BEGONA filial xonasi bo'lmasligi kerak.
      const utilRes = await get("/branch-analytics/rooms", adminA);
      const util = (await utilRes.json().catch(() => ({})))?.data;
      const leaked = (util?.rooms || []).filter((r) => String(r.branchId) !== String(aId));
      if (leaked.length === 0) ok("bandlik javobida begona filial yo'q");
      else bad("bandlik javobida begona filial", `${leaked.length} ta xona`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  head("15) FILIAL BOSHQARUVCHISI LOGINI — `?withManagers=true`");
  {
    // Bu bayroq filial ro'yxatiga xodim LOGINLARINI qo'shadi. Ro'yxat
    // esa filial tanlagichi uchun HAR QANDAY auth'langan
    // foydalanuvchiga ochiq — ya'ni bayroq ruxsatsiz ishlasa,
    // o'quvchi direktorning loginini o'qib olardi.
    const withM = async (token) => {
      const r = await get("/branches?withManagers=true", token);
      const body = await r.json().catch(() => ({}));
      const rows = body?.data || [];
      return rows.some((b) => Array.isArray(b.managers) && b.managers.length);
    };

    const ownerSees = await withM(owner);
    if (ownerSees) {
      ok("ega: boshqaruvchi logini keladi");
      // Musbat nazorat o'tdi — endi rad etilishi kerak bo'lgan tomon.
      const staffSees = await withM(staff);
      if (!staffSees) ok("xodim (users.read yo'q): login KELMAYDI");
      else bad("xodimga boshqaruvchi logini sizdi");
    } else {
      warn("boshqaruvchi logini", "hech bir filialda direktor yo'q — tekshirilmadi");
    }

    // Bayroqsiz so'rovda maydon UMUMAN bo'lmasligi kerak.
    const bare = await (await get("/branches", owner)).json();
    const leaked = (bare?.data || []).some((b) => "managers" in b);
    if (!leaked) ok("bayroqsiz so'rovda `managers` maydoni YO'Q");
    else bad("`managers` standart javobda ham keladi");
  }

  // ── NATIJA ──
  console.log(`\n${"═".repeat(60)}`);
  console.log(`NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.warn} o'lchanmadi`);
  if (R.failures.length) {
    console.log("\nMUAMMOLAR:");
    for (const f of R.failures) console.log(`  • ${f}`);
    process.exitCode = 1;
  }
  console.log("");
};

run().catch((e) => { console.error(e); process.exit(1); });
