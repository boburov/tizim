/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZA 3 — KURSLAR MODULI PARITETI (Express 5000 ↔ NestJS 5001).
 *
 * ── NIMA O'LCHANADI ──
 *  1. Katalog CRUD: ro'yxat, `meta` (⚠ standart limit 100, `pages` YO'Q),
 *     kod normalizatsiyasi (kichik harf), unikal kod (409).
 *  2. `groupCount` FILIAL KO'LAMI bilan hisoblanadi (katalogning O'ZI global).
 *  3. NOFAOL qilish — o'chirish EMAS; faol guruhi bo'lsa ham RUXSAT
 *     (xonadan farqi).
 *  4. Narx matritsasi: bazaviy ↔ filial istisnosi, `isPending`,
 *     davr yopilishi (`validTo`), `resolve` manbasi.
 *  5. Ruxsat chegarasi: `courses.read` bor, `courses.manage` YO'Q →
 *     o'qish 200, yozish 403 (musbat nazorat bilan).
 *  6. Filial chegarasi: A direktori B filialiga narx belgilay olmaydi.
 *
 * ── MARSHRUT TARTIBI ──
 * `GET /resolve/:groupId` `GET /:id` DAN OLDIN turishi ALOHIDA
 * sinaladi: teskarisida u "resolve" ni kurs ID'si deb o'qib 404 berardi.
 *
 * ── BAZA GIGIYENASI ──
 * `__parity_course_` prefiksli kurslar va ularning narx qatorlari
 * yakunda TO'LIQ o'chiriladi. Kurs guruhga bog'lanmaydi, ya'ni FK
 * qoldiq yo'q.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, mintToken, waitForStacks, createReporter, nowStamps,
} from './_harness.mjs';

const PREFIX = '__parity_course_';
// Kod `[a-zA-Z0-9_-]` bilan cheklangan — prefiks alohida.
const CODE_PREFIX = 'parity-course-';
const ROLE_PREFIX = '__parity_cprole_';
const USER_PREFIX = '__parity_cpuser_';
const T = createReporter('kurslar');
const prisma = new PrismaClient();

const main = async () => {
  console.log('\n\x1b[1mFAZA 3 — KURSLAR MODULI PARITETI\x1b[0m\n');
  await waitForStacks();

  const actor = async (username) => {
    const u = await prisma.user.findUnique({
      where: { username },
      select: { id: true, role: true, isActive: true, isDeleted: true },
    });
    if (!u) throw new Error(`${username} topilmadi — \`node tests/fixtures/qaUsers.mjs\``);
    if (!u.isActive || u.isDeleted) throw new Error(`${username} faol emas`);
    return mintToken(u);
  };

  const ownerToken = await actor('owner');

  const branches = await prisma.branch.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, name: true, isMain: true },
    orderBy: { createdAt: 'asc' },
  });
  const A =
    branches.find((b) => String(b.name).startsWith('DEMO')) ||
    branches.find((b) => b.isMain) ||
    branches[0];
  const B = branches.find((b) => b.id !== A.id);
  if (!A || !B) {
    console.log('  ❌ IKKI FILIAL KERAK');
    process.exit(1);
  }

  const stamp = String(process.hrtime.bigint()).slice(-9);
  const titleOf = (b) => `${PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`;
  const codeOf = (b) => `${CODE_PREFIX}${b === EXPRESS ? 'e' : 'n'}${stamp}`;
  const created = { [EXPRESS]: null, [NEST]: null };
  /** Filial ko'lamini o'lchash uchun vaqtincha aktyor va uning roli. */
  let scopedUser = null;
  let scopedRole = null;

  // ── NARX QATORI ID'LARI ──
  //
  // `CoursePrice.id` bazada generatsiya qilinadi, ya'ni har stekda
  // BOSHQACHA. Ular oldindan ma'lum emas, shuning uchun javoblardan
  // YIG'ILADI: ikkala stek ham AYNI ketma-ketlikda chaqiriladi, demak
  // `i`-chi ID lar bir-biriga mos keladi.
  const priceIds = { [EXPRESS]: [], [NEST]: [] };
  const trackPrice = (base, r) => {
    const id = r?.body?.data?.id;
    if (id && !priceIds[base].includes(id)) priceIds[base].push(id);
    return r;
  };

  // ⚠ IKKALA stekning nomi/kodi/ID si HAM almashtiriladi — ro'yxat
  // so'rovi ikkala kursni ham qaytaradi (sabab: rooms testidagi izoh).
  //
  // `nowStamps()` — `validFrom`/`validTo` server tomonda `new Date()`
  // bilan qo'yiladi va stekar orasida MILLISEKUND farq qiladi.
  const stampRule = nowStamps();
  const subs = () => [
    [titleOf(EXPRESS), '<TITLE>'], [titleOf(NEST), '<TITLE>'],
    [codeOf(EXPRESS), '<CODE>'], [codeOf(NEST), '<CODE>'],
    ...(created[EXPRESS] ? [[created[EXPRESS], '<ID>']] : []),
    ...(created[NEST] ? [[created[NEST], '<ID>']] : []),
    ...priceIds[EXPRESS].map((id, i) => [id, `<PRICE${i}>`]),
    ...priceIds[NEST].map((id, i) => [id, `<PRICE${i}>`]),
    stampRule,
  ];

  try {
    // ═══════════════ O'QISH ═══════════════
    T.section("o'qish");

    for (const q of ['', '?limit=5', '?includeInactive=true&limit=5', '?search=__yoq__']) {
      await T.both(`GET /courses${q}`, (b) =>
        request(b, 'GET', `/api/courses${q}`, { token: ownerToken }));
    }
    await T.both('GET /courses?limit=9999 (400)', (b) =>
      request(b, 'GET', '/api/courses?limit=9999', { token: ownerToken }));
    await T.both("GET /courses (token yo'q → 401)", (b) =>
      request(b, 'GET', '/api/courses'));
    await T.both('GET /courses/:id (404)', (b) =>
      request(b, 'GET', `/api/courses/${'a'.repeat(24)}`, { token: ownerToken }));

    // ═══════════════ YARATISH ═══════════════
    T.section('yaratish');

    const createRes = await T.both('POST /courses', async (b) => {
      const r = await request(b, 'POST', '/api/courses', {
        token: ownerToken,
        body: {
          title: titleOf(b),
          // ⚠ ATAYLAB KATTA HARF: servis uni kichik harfga tushiradi.
          // Aks holda "IELTS" va "ielts" IKKI XIL kurs bo'lib qolardi
          // (`code` unique) va hisobot ikkiga bo'linardi.
          code: codeOf(b).toUpperCase(),
          level: 'B2',
          defaultDurationMonths: 6,
        },
      });
      if (r.status === 201) created[b] = r.body.data.id;
      return r;
    }, subs);

    await T.both("POST /courses (kodsiz → 400)", (b) =>
      request(b, 'POST', '/api/courses', {
        token: ownerToken, body: { title: `${titleOf(b)}_x` },
      }), subs);
    await T.both("POST /courses (nomsiz → 400)", (b) =>
      request(b, 'POST', '/api/courses', {
        token: ownerToken, body: { code: `${codeOf(b)}-x` },
      }), subs);
    await T.both("POST /courses (kodda bo'sh joy → 400)", (b) =>
      request(b, 'POST', '/api/courses', {
        token: ownerToken, body: { title: `${titleOf(b)}_y`, code: 'bad code' },
      }), subs);
    await T.both("POST /courses (kod 1 belgi → 400)", (b) =>
      request(b, 'POST', '/api/courses', {
        token: ownerToken, body: { title: `${titleOf(b)}_z`, code: 'a' },
      }), subs);
    await T.both('POST /courses (takroriy kod → 409)', (b) =>
      request(b, 'POST', '/api/courses', {
        token: ownerToken, body: { title: `${titleOf(b)}_dup`, code: codeOf(b) },
      }), subs);

    if (createRes.e?.status !== 201 || createRes.n?.status !== 201) {
      T.skip('qolgan qadamlar', 'kurs yaratilmadi');
    } else {
      T.section('bitta kurs');
      await T.both('GET /courses/:id', (b) =>
        request(b, 'GET', `/api/courses/${created[b]}`, { token: ownerToken }), subs);
      await T.both('GET /courses?search=<kod>', (b) =>
        request(b, 'GET', `/api/courses?search=${codeOf(b)}`, { token: ownerToken }), subs);

      // ═══════════════ TAHRIRLASH ═══════════════
      T.section('tahrirlash');

      await T.both('PATCH /courses/:id (daraja, davomiylik)', (b) =>
        request(b, 'PATCH', `/api/courses/${created[b]}`, {
          token: ownerToken, body: { level: 'C1', defaultDurationMonths: 9 },
        }), subs);
      await T.both("PATCH /courses/:id (bo'sh nom → 400 validatsiya)", (b) =>
        request(b, 'PATCH', `/api/courses/${created[b]}`, {
          token: ownerToken, body: { title: '   ' },
        }), subs);
      await T.both("PATCH /courses/:id (band kod → 409)", async (b) => {
        // Boshqa stekning kodi ATAYLAB olinadi — u bazada BOR va
        // shu kursga tegishli EMAS, ya'ni to'qnashuv HAQIQIY.
        const other = b === EXPRESS ? NEST : EXPRESS;
        return request(b, 'PATCH', `/api/courses/${created[b]}`, {
          token: ownerToken, body: { code: codeOf(other) },
        });
      }, subs);
      await T.both('PATCH /courses/:id (404)', (b) =>
        request(b, 'PATCH', `/api/courses/${'a'.repeat(24)}`, {
          token: ownerToken, body: { level: 'x' },
        }), subs);

      // ═══════════════ NARX MATRITSASI ═══════════════
      T.section('narx matritsasi');

      await T.both('GET /courses/:id/prices (narxsiz)', (b) =>
        request(b, 'GET', `/api/courses/${created[b]}/prices`, { token: ownerToken }), subs);
      await T.both('GET /courses/:id/prices (404)', (b) =>
        request(b, 'GET', `/api/courses/${'a'.repeat(24)}/prices`, {
          token: ownerToken,
        }), subs);

      await T.both('PUT /prices (bazaviy narx)', async (b) =>
        trackPrice(b, await request(b, 'PUT', `/api/courses/${created[b]}/prices`, {
          token: ownerToken, body: { amount: 500000 },
        })), subs);
      // Bir xil summa — YANGI QATOR OCHILMAYDI (shovqin bo'lardi).
      await T.both("PUT /prices (o'sha summa → yangi qator yo'q)", async (b) =>
        trackPrice(b, await request(b, 'PUT', `/api/courses/${created[b]}/prices`, {
          token: ownerToken, body: { amount: 500000 },
        })), subs);
      // ⚠ `validFrom` amaldagi narxdan KEYIN bo'lishi shart.
      await T.both("PUT /prices (o'tmishdagi validFrom → 400)", (b) =>
        request(b, 'PUT', `/api/courses/${created[b]}/prices`, {
          token: ownerToken,
          body: { amount: 600000, validFrom: '2000-01-01T00:00:00.000Z' },
        }), subs);
      // KELAJAKDAGI narx → `isPending: true`.
      await T.both('PUT /prices (kelajakdagi narx)', async (b) =>
        trackPrice(b, await request(b, 'PUT', `/api/courses/${created[b]}/prices`, {
          token: ownerToken,
          body: { amount: 600000, validFrom: '2099-01-01T00:00:00.000Z' },
        })), subs);
      await T.both('GET /prices (isPending ko\'rinadi)', (b) =>
        request(b, 'GET', `/api/courses/${created[b]}/prices`, { token: ownerToken }), subs);

      await T.both('PUT /prices (filial istisnosi)', async (b) =>
        trackPrice(b, await request(b, 'PUT', `/api/courses/${created[b]}/prices`, {
          token: ownerToken, body: { branchId: A.id, amount: 450000 },
        })), subs);
      await T.both('GET /prices (bazaviy + filial)', (b) =>
        request(b, 'GET', `/api/courses/${created[b]}/prices`, { token: ownerToken }), subs);

      await T.both("PUT /prices (manfiy summa → 400 validatsiya)", (b) =>
        request(b, 'PUT', `/api/courses/${created[b]}/prices`, {
          token: ownerToken, body: { amount: -1 },
        }), subs);
      await T.both('PUT /prices (404 kurs)', (b) =>
        request(b, 'PUT', `/api/courses/${'a'.repeat(24)}/prices`, {
          token: ownerToken, body: { amount: 1000 },
        }), subs);

      await T.both("DELETE /prices/:branchId (istisno olib tashlanadi)", (b) =>
        request(b, 'DELETE', `/api/courses/${created[b]}/prices/${A.id}`, {
          token: ownerToken,
        }), subs);
      await T.both("DELETE /prices/:branchId (endi yo'q → 404)", (b) =>
        request(b, 'DELETE', `/api/courses/${created[b]}/prices/${A.id}`, {
          token: ownerToken,
        }), subs);
      await T.both('GET /prices (istisno olingach faqat bazaviy)', (b) =>
        request(b, 'GET', `/api/courses/${created[b]}/prices`, { token: ownerToken }), subs);
    }

    // ═══════════════ MARSHRUT TARTIBI ═══════════════
    //
    // ⚠ `GET /resolve/:groupId` `GET /:id` DAN OLDIN e'lon qilingan.
    // Teskarisida "resolve" kurs ID'si deb o'qilardi va bu yerda
    // 404 "Kurs topilmadi" chiqardi — ya'ni guruh narxi HECH QACHON
    // yechilmasdi.
    T.section("marshrut tartibi: /resolve/:groupId");

    await T.both("GET /courses/resolve/<yo'q> → 404 «Guruh topilmadi»", (b) =>
      request(b, 'GET', `/api/courses/resolve/${'a'.repeat(24)}`, {
        token: ownerToken,
      }), subs);

    // MUSBAT NAZORAT: HAQIQIY guruh bilan — 200 va manba nomi.
    const anyGroup = await prisma.group.findFirst({
      where: { isDeleted: false },
      select: { id: true, courseId: true, branchId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (anyGroup) {
      await T.both('GET /courses/resolve/:groupId (haqiqiy guruh)', (b) =>
        request(b, 'GET', `/api/courses/resolve/${anyGroup.id}`, {
          token: ownerToken,
        }), subs);
      await T.both('GET /courses/resolve/:groupId?year&month', (b) =>
        request(b, 'GET', `/api/courses/resolve/${anyGroup.id}?year=2026&month=7`, {
          token: ownerToken,
        }), subs);
      await T.both("GET /courses/resolve/:groupId?month=13 → 400", (b) =>
        request(b, 'GET', `/api/courses/resolve/${anyGroup.id}?month=13`, {
          token: ownerToken,
        }), subs);
    } else {
      T.skip('resolve (haqiqiy guruh)', 'bazada guruh yo\'q — TAXMIN QILINMADI');
    }

    // ═══════════════ RUXSAT CHEGARASI ═══════════════
    //
    // `qa_admin_a` da `courses.*` YO'Q, lekin `groups.read` bor.
    // ⚠ Aynan shu kesim muhim: katalog O'QISH filial ichi ruxsati
    // bo'lgani uchun, agar `qa_admin_a` da `courses.read` bo'lmasa u
    // 403 oladi — bu ham Express bilan bir xil bo'lishi kerak.
    T.section('ruxsat chegarasi');

    try {
      const staffAToken = await actor('qa_staff_a');
      const alive = await T.both(
        'MUSBAT NAZORAT: qa_staff_a tirik (`/auth/me` → 200)',
        (b) => request(b, 'GET', '/api/auth/me', { token: staffAToken }), subs);

      if (alive.e?.status !== 200) {
        T.skip('ruxsat chegarasi', 'musbat nazorat 200 bermadi');
      } else {
        await T.both("`courses.read` yo'q → GET /courses 403", (b) =>
          request(b, 'GET', '/api/courses', { token: staffAToken }), subs);
        await T.both("`courses.manage` yo'q → POST /courses 403", (b) =>
          request(b, 'POST', '/api/courses', {
            token: staffAToken,
            body: { title: `${PREFIX}nope${stamp}`, code: `${CODE_PREFIX}nope${stamp}` },
          }), subs);
        await T.both("`finance.manage` yo'q → PUT /prices 403", (b) =>
          request(b, 'PUT', `/api/courses/${created[b] || 'a'.repeat(24)}/prices`, {
            token: staffAToken, body: { amount: 1 },
          }), subs);
      }

    } catch (err) {
      T.skip('ruxsat chegarasi', err.message);
    }

    // ═══════════════════════════════════════════════════════════════
    // FILIAL KO'LAMI — NARX BELGILASHDA
    //
    // ⚠ MAVJUD FIXTURE YARAMAYDI: `qa_admin_a` da `finance.manage`
    // YO'Q, ya'ni u 403 ni RUXSAT qatlamida olardi va KO'LAM
    // tekshiruvi (`isBranchAllowed`) UMUMAN ISHGA TUSHMASDI. Test
    // yashil bo'lardi va hech narsani isbotlamasdi.
    //
    // Shuning uchun shu yerda VAQTINCHA aktyor yaratiladi:
    //   • `courses.read` + `finance.manage` ruxsatlari
    //   • FAQAT A filialiga biriktirilgan
    // Ikkalasi ham `finally` da o'chiriladi.
    // ═══════════════════════════════════════════════════════════════
    T.section("filial ko'lami: narx belgilash");

    try {
      if (!created[EXPRESS] || !created[NEST]) throw new Error('kurs yaratilmadi');

      const perms = await prisma.permission.findMany({
        where: { key: { in: ['courses.read', 'finance.manage'] } },
        select: { id: true, key: true },
      });
      if (perms.length !== 2) throw new Error('kerakli ruxsatlar bazada yo\'q');

      scopedRole = await prisma.role.create({
        data: {
          value: `${ROLE_PREFIX}${stamp}`,
          label: 'Paritet: narx boshqaruvchi',
          roleType: 'staff',
          defaultPath: '/',
          isSystem: false,
          permissions: { connect: perms.map((p) => ({ id: p.id })) },
        },
        select: { id: true, value: true },
      });

      scopedUser = await prisma.user.create({
        data: {
          username: `${USER_PREFIX}${stamp}`,
          firstName: 'Paritet',
          lastName: 'NarxAdmin',
          role: scopedRole.value,
          homeBranchId: A.id,
          // Parol OCHIQ MATNDA saqlanadi (loyiha talabi) — lekin
          // token to'g'ridan-to'g'ri imzolanadi, login qilinmaydi.
          passwordHash: 'parity-not-used',
          branchAssignments: { create: [{ branchId: A.id, role: scopedRole.value }] },
        },
        select: { id: true, role: true },
      });

      const scopedToken = mintToken(scopedUser);

      // ⚠ MUSBAT NAZORAT: aktyor O'Z filialiga narx belgilay OLADI.
      // Usiz pastdagi 403 "ruxsat yo'q" dan kelib chiqishi mumkin edi
      // va KO'LAM chegarasi yana o'lchanmasdi.
      const positive = await T.both(
        "MUSBAT NAZORAT: A filialiga narx belgilaydi → 200",
        async (b) => trackPrice(b, await request(
          b, 'PUT', `/api/courses/${created[b]}/prices`,
          { token: scopedToken, body: { branchId: A.id, amount: 333000 } },
        )), subs);

      if (positive.e?.status !== 200) {
        T.skip("filial ko'lami (narx)", 'musbat nazorat 200 bermadi');
      } else {
        await T.both("B filialiga narx belgilay OLMAYDI → 403", (b) =>
          request(b, 'PUT', `/api/courses/${created[b]}/prices`, {
            token: scopedToken, body: { branchId: B.id, amount: 111 },
          }), subs);
        await T.both("B filialining istisnosini o'chira OLMAYDI → 403", (b) =>
          request(b, 'DELETE', `/api/courses/${created[b]}/prices/${B.id}`, {
            token: scopedToken,
          }), subs);
        // ⚠ MATRITSA HAM KESILADI: A filialiga biriktirilgan aktyor
        // B filialining istisno narxini KO'RMASLIGI kerak.
        await T.both("GET /prices — faqat A filiali istisnosi ko'rinadi", (b) =>
          request(b, 'GET', `/api/courses/${created[b]}/prices`, {
            token: scopedToken,
          }), subs);
      }
    } catch (err) {
      T.skip("filial ko'lami (narx belgilash)", err.message);
    }

    // ═══════════════ NOFAOL QILISH ═══════════════
    //
    // ⚠ XONADAN FARQI: kursni faol guruhi BOR bo'lsa ham nofaol qilish
    // MUMKIN (xonada bu 400 berardi). Javobdagi xabar nechta guruh
    // ta'sirlanganini aytadi.
    T.section('nofaol qilish');

    if (created[EXPRESS] && created[NEST]) {
      // Guruhsiz kurs — xabar "Kurs nofaol qilindi".
      await T.both("DELETE /courses/:id (guruhsiz)", (b) =>
        request(b, 'DELETE', `/api/courses/${created[b]}`, { token: ownerToken }), subs);
      // Nofaol kurs standart ro'yxatda KO'RINMAYDI, `includeInactive` da ko'rinadi.
      await T.both("GET /courses?search=<kod> (nofaol → bo'sh)", (b) =>
        request(b, 'GET', `/api/courses?search=${codeOf(b)}`, { token: ownerToken }), subs);
      await T.both('GET /courses?includeInactive=true&search=<kod>', (b) =>
        request(b, 'GET', `/api/courses?includeInactive=true&search=${codeOf(b)}`, {
          token: ownerToken,
        }), subs);
      // ⚠ NOFAOL kurs `GET /:id` da HAMON KO'RINADI — u o'chirilmagan.
      await T.both("GET /courses/:id (nofaol → 200, o'chirilmagan)", (b) =>
        request(b, 'GET', `/api/courses/${created[b]}`, { token: ownerToken }), subs);

      // ── FAOL GURUHLI KURS: xabar boshqacha ──
      //
      // Shart O'ZIMIZ yaratamiz va API orqali O'LCHAYMIZ — bazada
      // guruhli kurs tasodifan topilmasligi mumkin.
      for (const b of [EXPRESS, NEST]) {
        await prisma.group.create({
          data: {
            branchId: A.id,
            name: `${PREFIX}grp_${b === EXPRESS ? 'e' : 'n'}${stamp}`,
            courseId: created[b],
            isActive: true,
          },
        });
      }
      const measured = {};
      for (const b of [EXPRESS, NEST]) {
        const lst = await request(
          b, 'GET', `/api/courses?includeInactive=true&search=${codeOf(b)}`,
          { token: ownerToken },
        );
        measured[b] = (lst.body?.data || [])[0]?.groupCount ?? -1;
      }
      if (measured[EXPRESS] > 0 && measured[NEST] > 0) {
        console.log(
          `      (shart o'lchandi: express ${measured[EXPRESS]} guruh, ` +
          `nest ${measured[NEST]} guruh)`,
        );
        await T.both("DELETE /courses/:id (faol guruhli → xabarda son)", (b) =>
          request(b, 'DELETE', `/api/courses/${created[b]}`, { token: ownerToken }), subs);
      } else {
        T.skip(
          'faol guruhli kursni nofaol qilish',
          `groupCount o'lchanmadi (e=${measured[EXPRESS]}, n=${measured[NEST]})`,
        );
      }
    }
    await T.both('DELETE /courses/:id (404)', (b) =>
      request(b, 'DELETE', `/api/courses/${'a'.repeat(24)}`, { token: ownerToken }), subs);
  } finally {
    // ═══════════════ TOZALASH ═══════════════
    // ⚠ TARTIB: guruh → narx → kurs (FK zanjiri teskarisi).
    // Vaqtincha aktyor va rol — narx qatorlaridan OLDIN o'chadi
    // (`coursePrice.createdById` → `users.id` FK).
    if (scopedUser) {
      await prisma.userBranchAssignment.deleteMany({ where: { userId: scopedUser.id } });
    }
    const g = await prisma.group.deleteMany({ where: { name: { startsWith: PREFIX } } });
    const courseIds = (
      await prisma.course.findMany({
        where: { code: { startsWith: CODE_PREFIX } },
        select: { id: true },
      })
    ).map((c) => c.id);
    const p = await prisma.coursePrice.deleteMany({
      where: { courseId: { in: courseIds } },
    });
    const c = await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    // ⚠ AKTYOR NARX QATORLARIDAN KEYIN o'chadi: `createdById` FK unga
    // ishora qiladi va teskari tartibda o'chirish yiqilardi.
    const u = await prisma.user.deleteMany({
      where: { username: { startsWith: USER_PREFIX } },
    });
    const r = await prisma.role.deleteMany({
      where: { value: { startsWith: ROLE_PREFIX } },
    });
    console.log(
      `\n  🧹 tozalandi: ${c.count} kurs, ${p.count} narx qatori, ` +
      `${g.count} guruh, ${u.count} aktyor, ${r.count} rol`,
    );

    const left =
      (await prisma.course.count({ where: { code: { startsWith: CODE_PREFIX } } })) +
      (await prisma.group.count({ where: { name: { startsWith: PREFIX } } })) +
      (await prisma.user.count({ where: { username: { startsWith: USER_PREFIX } } })) +
      (await prisma.role.count({ where: { value: { startsWith: ROLE_PREFIX } } }));
    if (left === 0) T.ok('sinov obyektlari qolmadi');
    else T.bad("tozalash to'liq bo'lmadi", `${left} ta obyekt qoldi`);

    await prisma.$disconnect();
  }

  process.exit(T.finish());
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
