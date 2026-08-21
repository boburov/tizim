/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VAZIFALAR — PARITET
 *
 * Express `/api/assignments` (10 marshrut) ↔ NestJS.
 *
 * ── NIMA O'LCHANADI ──
 *
 * Javob (status + tana) YETARLI EMAS. Vazifa yuborish uchta yon
 * ta'sirni birga qiladi: `Assignment` yozuvi, har bir o'quvchi uchun
 * `AssignmentRecipient` qatori va (fayl bo'lsa) `StoredFile` +
 * `StorageUsage` hisoblagichi. Shuning uchun har bir yozuvdan keyin
 * BAZA HOLATI ham tekshiriladi.
 *
 * ── ISBOTLANADIGAN INVARIANTLAR ──
 *   1. Javob paritetı 10/10 marshrutda.
 *   2. YETKAZISH HOLATI bot bog'lanishidan kelib chiqadi:
 *      bog'lanmagan → `no_bot`, bloklagan → `blocked`.
 *   3. FAYL TEKSHIRUVI UCH QATLAM: kengaytma (oq ro'yxat), MIME
 *      ziddiyati va MAZMUN IMZOSI (magic bytes).
 *   4. EGALIK: o'qituvchi faqat O'ZI yuborgan vazifani ko'radi,
 *      o'chiradi va faylini yuklab oladi.
 *   5. FILIAL AJRATMASI: boshqa filial direktori vazifani KO'RMAYDI.
 *   6. FAYL YUKLAB OLISH sarlavhalari (`Content-Type` KENGAYTMADAN,
 *      `nosniff`, `Content-Disposition`).
 *   7. KVOTA: fayl o'chirilganda `StorageUsage` AYNAN qaytadi.
 *
 * ── ⚠ BOT YUBORISH ATAYLAB CHETLAB O'TILADI ──
 * Fikstura o'quvchilarining HECH BIRI faol bot bog'lanishiga ega
 * emas (faqat `no_bot` va `blocked`). Shu sababli `assignment.deliver`
 * job'i "pending yo'q" deb darhol chiqadi va HECH KIMGA haqiqiy
 * Telegram xabari ketmaydi. Faol bog'lanish qo'shilsa test tashqi
 * xabar yuborardi va hisoblagichlar poygaga tushardi.
 *
 * ⚠ `uploadLimiter` — 10 so'rov/daqiqa. `POST /` chaqiruvlari SANAB
 * chiqilgan (8 ta): chegaraga urilsa tekshiruv "o'lchanmadi" bo'ladi.
 *
 * ISHLATISH:  npm run test:assignments-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  EXPRESS, NEST, request, normalize, nowStamps, mintToken,
  waitForStacks, createReporter,
} from './_harness.mjs';

const prisma = new PrismaClient();
const TAG = `AS-${Date.now().toString(36)}`;
const { R, ok, bad, skip, section, finish } = createReporter('assignments');

const made = { branches: [], users: [], groups: [], botUsers: [] };
let usedBytesBefore = 0;

const rateLimited = (r) =>
  r?.status === 429 ||
  /so'rovlar soni juda ko'p|urinishlari juda ko'p/i.test(String(r?.body?.message || ''));

const usedBytesNow = async () => {
  const row = await prisma.storageUsage.findUnique({ where: { key: 'global' } });
  return row?.usedBytes ?? 0;
};

/**
 * ⚠ TOZALASH TARTIBI: `Assignment` → `StoredFile` → `Group` →
 * `User` → `Branch`. `AssignmentRecipient` kaskad bilan ketadi, lekin
 * OCHIQ o'chiriladi — kaskad sozlamasi o'zgarsa test jimgina qoldiq
 * qoldirmasin.
 */
const cleanup = async () => {
  try {
    if (made.users.length) {
      const assignments = await prisma.assignment.findMany({
        where: { senderId: { in: made.users } }, select: { id: true, fileId: true } });
      const ids = assignments.map((a) => a.id);
      if (ids.length) {
        await prisma.assignmentRecipient.deleteMany({
          where: { assignmentId: { in: ids } } });
        await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
      }
      // Fayllar API orqali o'chirilgan bo'lishi kerak (kvota o'shanda
      // to'g'ri bo'shaydi). Qolganini o'chiramiz VA hisoblagichni ham
      // qo'lda qaytaramiz — aks holda `StorageUsage` siljib qolardi.
      const files = await prisma.storedFile.findMany({
        where: { uploadedById: { in: made.users } },
        select: { id: true, size: true, isDeleted: true } });
      const aliveBytes = files
        .filter((f) => !f.isDeleted)
        .reduce((acc, f) => acc + (f.size || 0), 0);
      if (files.length) {
        await prisma.storedFile.deleteMany({
          where: { id: { in: files.map((f) => f.id) } } });
      }
      if (aliveBytes > 0) {
        await prisma.storageUsage.updateMany({
          where: { key: 'global' },
          data: { usedBytes: { decrement: aliveBytes } } });
      }
      await prisma.assignmentRecipient.deleteMany({
        where: { studentId: { in: made.users } } });
    }
    if (made.botUsers.length) {
      await prisma.botUser.deleteMany({ where: { id: { in: made.botUsers } } });
    }
    if (made.groups.length) {
      await prisma.groupMembership.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.groupScheduleItem.deleteMany({
        where: { groupId: { in: made.groups } } });
      await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
    }
    if (made.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    }
    if (made.branches.length) {
      await prisma.branch.deleteMany({ where: { id: { in: made.branches } } });
    }
  } catch (e) {
    console.error('  ⚠ tozalash xatosi:', e.message);
  }
};

const NO_SUCH_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const DUE_DATE = '2030-01-15';

/** Eng kichik haqiqiy PDF — imzo tekshiruvi `%PDF` ni ko'rishi kerak. */
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);

let botSeq = 0;

const makeFixture = async (label) => {
  const mkBranch = async (n) => {
    const b = await prisma.branch.create({
      data: { name: `${TAG} ${label}${n}`, code: `${TAG}${label}${n}` } });
    made.branches.push(b.id);
    return b;
  };
  const branchA = await mkBranch('A');
  const branchB = await mkBranch('B');

  const mk = async (n, role, branch) => {
    const u = await prisma.user.create({
      data: {
        firstName: `${n}${label}`, lastName: `${TAG}${label}`,
        username: `${n.toLowerCase()}_${TAG.toLowerCase()}_${label.toLowerCase()}`,
        passwordHash: 'x', role, homeBranchId: branch.id, isActive: true,
      } });
    made.users.push(u.id);
    return u;
  };

  const teacher1 = await mk('Ustozbir', 'teacher', branchA);
  const teacher2 = await mk('Ustozikki', 'teacher', branchA);
  const director = await mk('Direktora', 'director', branchA);
  const directorB = await mk('Direktorb', 'director', branchB);
  const reception = await mk('Qabul', 'reception', branchA);
  const s1 = await mk('Talabbir', 'student', branchA);
  const s2 = await mk('Talabikki', 'student', branchA);
  const s3 = await mk('Talabuch', 'student', branchA);
  const s4 = await mk('Talabtort', 'student', branchB);

  /**
   * ⚠ FAQAT BLOKLANGAN bog'lanish. `isBlocked: false` qo'yilsa holat
   * "pending" bo'lardi va yetkazish job'i HAQIQIY Telegram xabarini
   * yuborishga urinardi.
   */
  const bot = await prisma.botUser.create({
    data: {
      telegramId: BigInt(900000000 + (botSeq += 1)),
      chatId: BigInt(900000000 + botSeq),
      userId: s2.id,
      isBlocked: true,
    } });
  made.botUsers.push(bot.id);

  const mkGroup = async (n, branch, teacher) => {
    const g = await prisma.group.create({
      data: { branchId: branch.id, name: `${TAG}${label} ${n}`, isActive: true } });
    made.groups.push(g.id);
    await prisma.group.update({
      where: { id: g.id }, data: { teachers: { connect: { id: teacher.id } } } });
    return g;
  };

  const groupA = await mkGroup('A', branchA, teacher1);
  const groupA2 = await mkGroup('A2', branchA, teacher2);
  const groupB = await mkGroup('B', branchB, teacher1);
  // O'quvchisiz guruh — "faol o'quvchi yo'q" yo'lini o'lchash uchun.
  const empty = await mkGroup('E', branchA, teacher1);

  const join = async (group, student) => {
    await prisma.groupMembership.create({
      data: { groupId: group.id, studentId: student.id, joinedAt: new Date(Date.UTC(2024, 0, 1)) } });
  };
  await join(groupA, s1); await join(groupA, s2); await join(groupA, s3);
  await join(groupA2, s1);
  await join(groupB, s4);

  return {
    branchA, branchB, teacher1, teacher2, director, directorB, reception,
    s1, s2, s3, s4, groupA, groupA2, groupB, empty,
  };
};

const run = async () => {
  await waitForStacks();
  console.log(`\n\x1b[1mVAZIFALAR — PARITET\x1b[0m  (${TAG})`);
  console.log(`  Express: ${EXPRESS}\n  NestJS : ${NEST}\n`);

  usedBytesBefore = await usedBytesNow();
  console.log(`  boshlang'ich band joy: ${usedBytesBefore} bayt\n`);

  const owner = await prisma.user.findFirst({
    where: { role: 'owner', isDeleted: false }, select: { id: true, role: true } });
  if (!owner) throw new Error('owner topilmadi');
  const ownerToken = mintToken(owner);

  const fx = { [EXPRESS]: await makeFixture('E'), [NEST]: await makeFixture('N') };
  const tok = {};
  for (const base of [EXPRESS, NEST]) {
    const f = fx[base];
    tok[base] = {
      teacher1: mintToken(f.teacher1), teacher2: mintToken(f.teacher2),
      director: mintToken(f.director), directorB: mintToken(f.directorB),
      reception: mintToken(f.reception),
      s1: mintToken(f.s1), s3: mintToken(f.s3), s4: mintToken(f.s4),
    };
  }
  const tokenOf = (base, as) => (as ? tok[base][as] : ownerToken);

  const call = (base, method, path, { body, as, noAuth } = {}) =>
    request(base, method, path, {
      token: noAuth ? undefined : tokenOf(base, as), body });

  /** `multipart/form-data` — `POST /assignments` yagona shu shaklda. */
  const upload = async (base, { fields = {}, file, as, noAuth } = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v)) v.forEach((x) => fd.append(k, String(x)));
      else fd.append(k, String(v));
    }
    if (file) {
      fd.append('file', new Blob([file.bytes], { type: file.type }), file.name);
    }
    const token = noAuth ? undefined : tokenOf(base, as);
    const res = await fetch(`${base}/api/assignments`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed };
  };

  /** Xom javob — sarlavhalar va baytlar (fayl yuklab olish uchun). */
  const raw = async (base, path, { as, noAuth } = {}) => {
    const token = noAuth ? undefined : tokenOf(base, as);
    const res = await fetch(base + path, {
      headers: token ? { authorization: `Bearer ${token}` } : {} });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      buf,
    };
  };

  /**
   * ── OYNA FIKSTURA ──
   * Har stek O'Z fiksturasiga so'rov yuboradi, shuning uchun mos
   * obyektlar BIR XIL belgiga tushadi. "Begona fikstura oqib chiqdi"
   * holati `deepEqual` bilan emas, ALOHIDA baza tekshiruvlari bilan
   * o'lchanadi.
   */
  const subs = () => {
    const E = fx[EXPRESS]; const N = fx[NEST];
    const pair = (k, m) => [[E[k].id, `<${m}>`], [N[k].id, `<${m}>`]];
    const name = (n, m) => [[`${n}E`, `<${m}>`], [`${n}N`, `<${m}>`]];
    return [
      ...pair('branchA', 'BRA'), ...pair('branchB', 'BRB'),
      ...pair('teacher1', 'T1'), ...pair('teacher2', 'T2'),
      ...pair('director', 'DIR'), ...pair('directorB', 'DIRB'),
      ...pair('reception', 'REC'),
      ...pair('s1', 'S1'), ...pair('s2', 'S2'),
      ...pair('s3', 'S3'), ...pair('s4', 'S4'),
      ...pair('groupA', 'GA'), ...pair('groupA2', 'GA2'),
      ...pair('groupB', 'GB'), ...pair('empty', 'GE'),
      [owner.id, '<OWNER>'],
      ...name('Ustozbir', 'T1N'), ...name('Ustozikki', 'T2N'),
      ...name('Direktora', 'DIRN'), ...name('Direktorb', 'DIRBN'),
      ...name('Qabul', 'RECN'),
      ...name('Talabbir', 'S1N'), ...name('Talabikki', 'S2N'),
      ...name('Talabuch', 'S3N'), ...name('Talabtort', 'S4N'),
      [`${TAG.toLowerCase()}_e`, '<tag>'], [`${TAG.toLowerCase()}_n`, '<tag>'],
      [`${TAG}E`, '<TAG>'], [`${TAG}N`, '<TAG>'],
      [`${TAG} E`, '<TAG>'], [`${TAG} N`, '<TAG>'],
      [TAG, '<TAG>'],
      nowStamps(),
      (v) => v.replace(/\b[0-9a-f]{24}\b/g, '<ID>'),
    ];
  };

  const mirror = async (name, fn) => {
    let e, n;
    try { e = await fn(EXPRESS, fx[EXPRESS]); n = await fn(NEST, fx[NEST]); }
    catch (err) { skip(name, err.message); return {}; }
    if (rateLimited(e) || rateLimited(n)) {
      skip(name, `tezlik chegarasi — express=${e.status}, nest=${n.status}`);
      return {};
    }
    if (e.status >= 200 && e.status < 300) R.successes += 1;
    const en = { status: e.status, body: normalize(e.body, subs()) };
    const nn = { status: n.status, body: normalize(n.body, subs()) };
    try { assert.deepEqual(nn, en); ok(`${name} — ${e.status}`); }
    catch {
      bad(name, `express: ${JSON.stringify(en).slice(0, 700)}\n      ` +
                `nest   : ${JSON.stringify(nn).slice(0, 700)}`);
    }
    return { e, n };
  };

  const eq = (n, a, b) => (a === b ? ok(`${n} — ${a}`) : bad(n, `kutilgan ${b}, keldi ${a}`));

  const perStack = async (fn) => {
    for (const [base, tagl] of [[EXPRESS, 'express'], [NEST, 'nest']]) {
      // eslint-disable-next-line no-await-in-loop
      await fn(fx[base], tagl, base);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  section("1) KO'RIB CHIQISH (preview)");
  // ─────────────────────────────────────────────────────────────────

  const p0 = await mirror('POST /preview (owner)', (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupA.id] } }));
  if (p0.e?.body?.data) {
    for (const [res, l] of [[p0.e, 'express'], [p0.n, 'nest']]) {
      const d = res.body.data;
      eq(`jami 3 oluvchi (${l})`, d.total, 3);
      // Bot bog'lanmagan — hech kimga yetkazib bo'lmaydi.
      eq(`yetkazish mumkin 0 (${l})`, d.deliverable, 0);
      eq(`bloklagan 1 (${l})`, d.blocked, 1);
      eq(`botsiz 2 (${l})`, d.noBot, 2);
      eq(`bloklaganlar ro'yxati (${l})`, d.blockedStudents?.length, 1);
      eq(`botsizlar ro'yxati (${l})`, d.noBotStudents?.length, 2);
      eq(`guruh qaytdi (${l})`, d.groups?.length, 1);
    }
  }

  await mirror("preview: guruhlar vergul bilan (satr shakli)", (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: `${f.groupA.id},${f.groupA2.id}` } }));

  await mirror("preview: o'qituvchi O'Z guruhi (musbat)", (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupA.id] }, as: 'teacher1' }));
  await mirror("preview: begona guruh → 403", (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupA2.id] }, as: 'teacher1' }));
  await mirror("preview: bo'sh ro'yxat → 400", (base) =>
    call(base, 'POST', '/api/assignments/preview', { body: { groupIds: [] } }));
  await mirror("preview: noma'lum guruh → 404", (base) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [NO_SUCH_ID] } }));
  await mirror('preview: turli filiallar → 400', (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupA.id, f.groupB.id] } }));
  await mirror("preview: ID formati xato → 400", (base) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: ['xato'] } }));
  await mirror('preview: qabul xodimi → 403', (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupA.id] }, as: 'reception' }));
  await mirror("preview: o'quvchi → 403", (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupA.id] }, as: 's1' }));
  await mirror('preview: autentifikatsiyasiz → 401', (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupA.id] }, noAuth: true }));

  // ── FILIAL AJRATMASI ──
  await mirror("preview: direktor O'Z filiali (musbat)", (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupA.id] }, as: 'director' }));
  await mirror('preview: direktor BEGONA filial → 404', (base, f) =>
    call(base, 'POST', '/api/assignments/preview',
      { body: { groupIds: [f.groupB.id] }, as: 'director' }));

  // ─────────────────────────────────────────────────────────────────
  section('2) VAZIFA YUBORISH (faylsiz)');
  // ─────────────────────────────────────────────────────────────────

  const created = {};
  const c1 = await mirror('POST / (matnli vazifa)', (base, f) =>
    upload(base, {
      as: 'teacher1',
      fields: {
        title: `${TAG} Uy vazifasi`,
        body: `${TAG} 12-mashq`,
        groupIds: f.groupA.id,
        dueDate: DUE_DATE,
      },
    }));
  if (c1.e?.status === 201) {
    created[EXPRESS] = c1.e.body.data._id;
    created[NEST] = c1.n.body.data._id;
    for (const [res, l] of [[c1.e, 'express'], [c1.n, 'nest']]) {
      const d = res.body.data;
      eq(`oluvchilar soni 3 (${l})`, d.recipientsCount, 3);
      eq(`bloklagan 1 (${l})`, d.blockedCount, 1);
      eq(`botsiz 2 (${l})`, d.noBotCount, 2);
      eq(`yetkazilgan 0 (${l})`, d.deliveredCount, 0);
      eq(`fayl yo'q (${l})`, d.file, null);
      eq(`xabar (${l})`, res.body.message, 'Vazifa yuborildi');
    }
    await perStack(async (f, l) => {
      const id = created[l === 'express' ? EXPRESS : NEST];
      const rows = await prisma.assignmentRecipient.findMany({
        where: { assignmentId: id }, select: { studentId: true, status: true } });
      eq(`3 ta oluvchi qatori (${l})`, rows.length, 3);
      const byId = Object.fromEntries(rows.map((r) => [r.studentId, r.status]));
      eq(`bloklagan o'quvchi holati (${l})`, byId[f.s2.id], 'blocked');
      eq(`botsiz o'quvchi holati (${l})`, byId[f.s1.id], 'no_bot');
      eq(`begona o'quvchi yo'q (${l})`, byId[f.s4.id], undefined);
      const doc = await prisma.assignment.findUnique({ where: { id } });
      eq(`yuboruvchi = o'qituvchi (${l})`, String(doc?.senderId), f.teacher1.id);
      eq(`filial biriktirildi (${l})`, String(doc?.branchId), f.branchA.id);
      eq(`muddat saqlandi (${l})`,
        doc?.dueDate?.toISOString().slice(0, 10), DUE_DATE);
    });
  }

  await mirror('POST / (sarlavhasiz → 400)', (base, f) =>
    upload(base, { as: 'teacher1', fields: { groupIds: f.groupA.id } }));
  await mirror("POST / (o'quvchisiz guruh → 400)", (base, f) =>
    upload(base, {
      as: 'teacher1',
      fields: { title: `${TAG} bo'sh`, groupIds: f.empty.id },
    }));
  await mirror('POST / (begona guruh → 403)', (base, f) =>
    upload(base, {
      as: 'teacher1',
      fields: { title: `${TAG} begona`, groupIds: f.groupA2.id },
    }));
  await mirror('POST / (qabul xodimi → 403)', (base, f) =>
    upload(base, {
      as: 'reception',
      fields: { title: `${TAG} rad`, groupIds: f.groupA.id },
    }));
  await mirror('POST / (autentifikatsiyasiz → 401)', (base, f) =>
    upload(base, {
      noAuth: true,
      fields: { title: `${TAG} rad`, groupIds: f.groupA.id },
    }));

  // ─────────────────────────────────────────────────────────────────
  section('3) FAYL BILAN YUBORISH VA UCH QATLAMLI TEKSHIRUV');
  // ─────────────────────────────────────────────────────────────────

  const withFile = {};
  const usedBeforeUpload = await usedBytesNow();
  const c2 = await mirror('POST / (PDF bilan)', (base, f) =>
    upload(base, {
      as: 'teacher1',
      fields: { title: `${TAG} Material`, groupIds: f.groupA.id },
      file: { bytes: PDF_BYTES, name: 'dars.pdf', type: 'application/pdf' },
    }));
  if (c2.e?.status === 201) {
    withFile[EXPRESS] = c2.e.body.data._id;
    withFile[NEST] = c2.n.body.data._id;
    for (const [res, l] of [[c2.e, 'express'], [c2.n, 'nest']]) {
      const file = res.body.data.file;
      eq(`fayl nomi (${l})`, file?.originalName, 'dars.pdf');
      eq(`fayl hajmi (${l})`, file?.size, PDF_BYTES.length);
      eq(`fayl MIME (${l})`, file?.mimeType, 'application/pdf');
    }
    const usedAfter = await usedBytesNow();
    eq('kvota ikki fayl hajmiga oshdi',
      usedAfter, usedBeforeUpload + 2 * PDF_BYTES.length);
  }

  // 1-QATLAM: kengaytma oq ro'yxatda emas.
  await mirror('POST / (.exe → 400)', (base, f) =>
    upload(base, {
      as: 'teacher1',
      fields: { title: `${TAG} exe`, groupIds: f.groupA.id },
      file: { bytes: Buffer.from('MZ'), name: 'virus.exe', type: 'application/octet-stream' },
    }));
  // 2-QATLAM: MIME kengaytmaga ZID.
  await mirror('POST / (.pdf nomi + image/png MIME → 400)', (base, f) =>
    upload(base, {
      as: 'teacher1',
      fields: { title: `${TAG} mime`, groupIds: f.groupA.id },
      file: { bytes: PDF_BYTES, name: 'dars.pdf', type: 'image/png' },
    }));
  // 3-QATLAM: MAZMUN imzosi mos emas (eng muhimi — nom ham, MIME ham
  // yolg'on bo'lishi mumkin).
  await mirror('POST / (.pdf nomi + PDF BO\'LMAGAN mazmun → 400)', (base, f) =>
    upload(base, {
      as: 'teacher1',
      fields: { title: `${TAG} magic`, groupIds: f.groupA.id },
      file: {
        bytes: Buffer.from('<?php system($_GET["c"]); ?>'),
        name: 'dars.pdf',
        type: 'application/pdf',
      },
    }));
  // Rad etilgan fayllar kvotani YEMAGAN.
  {
    const usedNow = await usedBytesNow();
    eq('rad etilgan fayllar kvotani oshirmadi',
      usedNow, usedBeforeUpload + 2 * PDF_BYTES.length);
  }

  // ─────────────────────────────────────────────────────────────────
  section("4) RO'YXAT VA BITTA VAZIFA");
  // ─────────────────────────────────────────────────────────────────

  await mirror("GET / (o'qituvchi — faqat O'ZINIKI)", (base) =>
    call(base, 'GET', '/api/assignments?limit=100', { as: 'teacher1' }));
  const lt2 = await mirror('GET / (boshqa o\'qituvchi — bo\'sh)', (base) =>
    call(base, 'GET', '/api/assignments?limit=100', { as: 'teacher2' }));
  if (lt2.e?.body) {
    await perStack(async (f, l, base) => {
      const res = base === EXPRESS ? lt2.e : lt2.n;
      const ids = (res.body.data || []).map((a) => String(a._id));
      eq(`begona vazifa ro'yxatda YO'Q (${l})`,
        ids.includes(created[base]), false);
    });
  }
  await mirror('GET /?groupId=<guruh>', (base, f) =>
    call(base, 'GET', `/api/assignments?groupId=${f.groupA.id}&limit=100`,
      { as: 'teacher1' }));
  await mirror('GET / (qabul xodimi → 403)', (base) =>
    call(base, 'GET', '/api/assignments', { as: 'reception' }));

  await mirror('GET /:id (owner)', (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}`));
  await mirror('GET /:id (yuboruvchi o\'qituvchi)', (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}`, { as: 'teacher1' }));
  await mirror('GET /:id (begona o\'qituvchi → 403)', (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}`, { as: 'teacher2' }));
  await mirror('GET /:id (BEGONA FILIAL direktori → 404)', (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}`, { as: 'directorB' }));
  await mirror("GET /:id (o'z filiali direktori → 200)", (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}`, { as: 'director' }));
  await mirror('GET /<yo\'q> → 404', (base) =>
    call(base, 'GET', `/api/assignments/${NO_SUCH_ID}`));
  await mirror('GET /<ID formati xato> → 400', (base) =>
    call(base, 'GET', '/api/assignments/xato'));

  // ─────────────────────────────────────────────────────────────────
  section('5) OLUVCHILAR JADVALI');
  // ─────────────────────────────────────────────────────────────────

  const rl = await mirror('GET /:id/recipients', (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}/recipients?limit=50`));
  if (rl.e?.body?.data) {
    for (const [res, l] of [[rl.e, 'express'], [rl.n, 'nest']]) {
      eq(`3 ta oluvchi (${l})`, res.body.data.length, 3);
      eq(`meta.total (${l})`, res.body.meta?.total, 3);
      // `status asc` — enum e'lon tartibi: pending, delivered,
      // BLOCKED, NO_BOT, failed. Ya'ni bloklagan TEPADA.
      eq(`bloklagan tepada (${l})`, res.body.data[0]?.status, 'blocked');
    }
  }
  await mirror('GET /:id/recipients?status=blocked', (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}/recipients?status=blocked`));
  await mirror('GET /:id/recipients?status=xato → 400', (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}/recipients?status=xato`));
  await mirror('GET /:id/recipients (begona o\'qituvchi → 403)', (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}/recipients`,
      { as: 'teacher2' }));

  // ─────────────────────────────────────────────────────────────────
  section('6) FAYL YUKLAB OLISH');
  // ─────────────────────────────────────────────────────────────────

  if (withFile[EXPRESS]) {
    const de = await raw(EXPRESS, `/api/assignments/${withFile[EXPRESS]}/file`, {});
    const dn = await raw(NEST, `/api/assignments/${withFile[NEST]}/file`, {});
    eq('fayl yuklab olindi (express)', de.status, 200);
    eq('fayl yuklab olindi (nest)', dn.status, 200);
    eq('baytlar aynan bir xil', de.buf.equals(dn.buf) && de.buf.equals(PDF_BYTES), true);
    for (const [d, l] of [[de, 'express'], [dn, 'nest']]) {
      // ⚠ Content-Type SAQLANGAN MIME dan emas, KENGAYTMADAN.
      eq(`Content-Type kengaytmadan (${l})`, d.headers['content-type'], 'application/pdf');
      eq(`nosniff (${l})`, d.headers['x-content-type-options'], 'nosniff');
      eq(`Content-Disposition attachment (${l})`,
        String(d.headers['content-disposition']).startsWith('attachment; filename="dars.pdf"'),
        true);
      eq(`Content-Length (${l})`,
        Number(d.headers['content-length']), PDF_BYTES.length);
    }

    // EGALIK: oluvchi o'quvchi oladi, boshqa o'quvchi OLMAYDI.
    const s1e = await raw(EXPRESS, `/api/assignments/${withFile[EXPRESS]}/file`, { as: 's1' });
    const s1n = await raw(NEST, `/api/assignments/${withFile[NEST]}/file`, { as: 's1' });
    eq("oluvchi o'quvchi faylni oladi (express)", s1e.status, 200);
    eq("oluvchi o'quvchi faylni oladi (nest)", s1n.status, 200);
    const s4e = await raw(EXPRESS, `/api/assignments/${withFile[EXPRESS]}/file`, { as: 's4' });
    const s4n = await raw(NEST, `/api/assignments/${withFile[NEST]}/file`, { as: 's4' });
    eq("begona o'quvchi → 403 (express)", s4e.status, 403);
    eq("begona o'quvchi → 403 (nest)", s4n.status, 403);
    // ⚠ O'QITUVCHIDA `assignments.read` BOR, lekin bu YETARLI EMAS:
    // u faqat O'ZI yuborgan vazifaning faylini oladi.
    const t2e = await raw(EXPRESS, `/api/assignments/${withFile[EXPRESS]}/file`, { as: 'teacher2' });
    const t2n = await raw(NEST, `/api/assignments/${withFile[NEST]}/file`, { as: 'teacher2' });
    eq("begona o'qituvchi → 403 (express)", t2e.status, 403);
    eq("begona o'qituvchi → 403 (nest)", t2n.status, 403);
    // Xodim `assignments.read` bilan oladi.
    const dire = await raw(EXPRESS, `/api/assignments/${withFile[EXPRESS]}/file`, { as: 'director' });
    const dirn = await raw(NEST, `/api/assignments/${withFile[NEST]}/file`, { as: 'director' });
    eq('xodim (assignments.read) oladi (express)', dire.status, 200);
    eq('xodim (assignments.read) oladi (nest)', dirn.status, 200);
    const nae = await raw(EXPRESS, `/api/assignments/${withFile[EXPRESS]}/file`, { noAuth: true });
    const nan = await raw(NEST, `/api/assignments/${withFile[NEST]}/file`, { noAuth: true });
    eq('autentifikatsiyasiz → 401 (express)', nae.status, 401);
    eq('autentifikatsiyasiz → 401 (nest)', nan.status, 401);
  }
  await mirror("GET /:id/file (faylsiz vazifa → 404)", (base) =>
    call(base, 'GET', `/api/assignments/${created[base]}/file`));

  // ─────────────────────────────────────────────────────────────────
  section("7) O'QUVCHI YUZASI");
  // ─────────────────────────────────────────────────────────────────

  const my = await mirror('GET /my', (base) =>
    call(base, 'GET', '/api/assignments/my?limit=50', { as: 's1' }));
  if (my.e?.body?.data) {
    eq("o'quvchida 2 ta vazifa (express)", my.e.body.data.length, 2);
    eq("o'quvchida 2 ta vazifa (nest)", my.n.body.data.length, 2);
  }
  const uc0 = await mirror('GET /my/unread-count', (base) =>
    call(base, 'GET', '/api/assignments/my/unread-count', { as: 's1' }));
  if (uc0.e?.body?.data) {
    eq("o'qilmagan 2 (express)", uc0.e.body.data.count, 2);
    eq("o'qilmagan 2 (nest)", uc0.n.body.data.count, 2);
  }
  await mirror("GET /my (o'qituvchi → 403)", (base) =>
    call(base, 'GET', '/api/assignments/my', { as: 'teacher1' }));
  await mirror('GET /my/unread-count (owner → 403)', (base) =>
    call(base, 'GET', '/api/assignments/my/unread-count'));
  await mirror('GET /my (autentifikatsiyasiz → 401)', (base) =>
    call(base, 'GET', '/api/assignments/my', { noAuth: true }));

  // O'QILDI deb belgilash
  const recIdOf = async (base) => {
    const r = await prisma.assignmentRecipient.findFirst({
      where: { assignmentId: created[base], studentId: fx[base].s1.id },
      select: { id: true } });
    return r?.id;
  };
  const recIds = { [EXPRESS]: await recIdOf(EXPRESS), [NEST]: await recIdOf(NEST) };

  await mirror('POST /my/:id/read', (base) =>
    call(base, 'POST', `/api/assignments/my/${recIds[base]}/read`, { as: 's1' }));
  await perStack(async (f, l, base) => {
    const row = await prisma.assignmentRecipient.findUnique({
      where: { id: recIds[base] } });
    eq(`readAt to'ldirildi (${l})`, row?.readAt !== null, true);
  });
  const uc1 = await mirror("GET /my/unread-count (o'qilgandan keyin)", (base) =>
    call(base, 'GET', '/api/assignments/my/unread-count', { as: 's1' }));
  if (uc1.e?.body?.data) {
    eq("o'qilmagan 1 ga tushdi (express)", uc1.e.body.data.count, 1);
    eq("o'qilmagan 1 ga tushdi (nest)", uc1.n.body.data.count, 1);
  }
  // Ikkinchi marta: `updateMany` sharti mos kelmaydi → `data: null`.
  const rr = await mirror("POST /my/:id/read (ikkinchi marta → data null)", (base) =>
    call(base, 'POST', `/api/assignments/my/${recIds[base]}/read`, { as: 's1' }));
  if (rr.e?.body) {
    eq('ikkinchi urinishda data=null (express)', rr.e.body.data, null);
    eq('ikkinchi urinishda data=null (nest)', rr.n.body.data, null);
  }
  // BEGONA o'quvchi: shart `studentId` ga ham bog'langan → jimgina null.
  await mirror("POST /my/:id/read (begona o'quvchi → data null)", (base) =>
    call(base, 'POST', `/api/assignments/my/${recIds[base]}/read`, { as: 's3' }));
  await perStack(async (f, l, base) => {
    const row = await prisma.assignmentRecipient.findUnique({
      where: { id: recIds[base] } });
    eq(`begona urinish readAt ni o'zgartirmadi (${l})`,
      row?.studentId, fx[base].s1.id);
  });

  // ─────────────────────────────────────────────────────────────────
  section("8) O'CHIRISH VA KVOTANI BO'SHATISH");
  // ─────────────────────────────────────────────────────────────────

  await mirror("DELETE /:id (begona o'qituvchi → 403)", (base) =>
    call(base, 'DELETE', `/api/assignments/${withFile[base]}`, { as: 'teacher2' }));
  await mirror('DELETE /:id (qabul xodimi → 403)', (base) =>
    call(base, 'DELETE', `/api/assignments/${withFile[base]}`, { as: 'reception' }));

  const usedBeforeDelete = await usedBytesNow();
  await mirror("DELETE /:id (yuboruvchi o'qituvchi)", (base) =>
    call(base, 'DELETE', `/api/assignments/${withFile[base]}`, { as: 'teacher1' }));
  await perStack(async (f, l, base) => {
    const doc = await prisma.assignment.findUnique({ where: { id: withFile[base] } });
    eq(`vazifa arxivlandi (${l})`, doc?.isDeleted, true);
    eq(`o'chirgan foydalanuvchi (${l})`, String(doc?.deletedBy), f.teacher1.id);
    const file = await prisma.storedFile.findUnique({ where: { id: doc.fileId } });
    eq(`fayl arxivlandi (${l})`, file?.isDeleted, true);
    // ⚠ Telegram keshi NOLLANADI — o'chirilgan fayl keshdan qayta
    // yuborilmasin.
    eq(`telegramFileId tozalandi (${l})`, file?.telegramFileId, null);
  });
  {
    const usedAfterDelete = await usedBytesNow();
    eq("kvota ikki fayl hajmiga bo'shadi",
      usedAfterDelete, usedBeforeDelete - 2 * PDF_BYTES.length);
  }
  await mirror("DELETE /:id (ikkinchi marta → 404)", (base) =>
    call(base, 'DELETE', `/api/assignments/${withFile[base]}`, { as: 'teacher1' }));

  // O'chirilgan vazifa o'quvchi ro'yxatidan CHIQADI.
  const my2 = await mirror("GET /my (o'chirilgandan keyin)", (base) =>
    call(base, 'GET', '/api/assignments/my?limit=50', { as: 's1' }));
  if (my2.e?.body?.data) {
    eq("o'quvchida 1 ta vazifa qoldi (express)", my2.e.body.data.length, 1);
    eq("o'quvchida 1 ta vazifa qoldi (nest)", my2.n.body.data.length, 1);
  }

  // Matnli vazifani ham o'chiramiz — qoldiq qolmasin.
  await mirror("DELETE /:id (matnli vazifa)", (base) =>
    call(base, 'DELETE', `/api/assignments/${created[base]}`, { as: 'teacher1' }));

  // ── DREYF ──
  {
    const usedEnd = await usedBytesNow();
    eq("band joy boshlang'ich holatga qaytdi", usedEnd, usedBytesBefore);
  }
};

run()
  .catch((err) => { console.error('\x1b[31mTEST YIQILDI:\x1b[0m', err); R.fail += 1; })
  .finally(async () => {
    // ⚠ `process.exit()` FAQAT `finally` DA — `run()` ichida chaqirilsa
    // tozalash o'tkazib yuborilib, fikstura bazada qolardi.
    await cleanup();
    await prisma.$disconnect().catch(() => {});
    process.exit(finish());
  });
