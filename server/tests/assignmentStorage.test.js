/**
 * VAZIFA + FAYL KVOTASI TESTI.
 *
 * NEGA kerak: bu yerda ikkita chegara bir-biriga bog'langan va ikkalasi
 * ham PULGA (diskka) taqaladi. Quyidagilar KAFOLATLANISHI shart:
 *
 *   1. Bitta fayl chegarasidan katta fayl RAD etiladi (413).
 *   2. Markaz kvotasi to'lganda fayl RAD etiladi (507) - "biroz oshib
 *      ketsa mayli" degan yumshoq holat YO'Q.
 *   3. Kvota tekshiruvi diskka YOZISHDAN OLDIN ishlaydi: rad etilgan
 *      fayl diskda iz qoldirmaydi.
 *   4. Vazifa yuborilganda BOTNI BLOKLAGAN o'quvchi darhol "blocked"
 *      deb belgilanadi va yetkazish navbatiga umuman tushmaydi.
 *   5. Preview yuborishdan OLDIN bloklaganlar sonini to'g'ri qaytaradi.
 *   6. O'qituvchi O'ZGA guruhga vazifa yubora olmaydi (403).
 *   7. Vazifa o'chirilganda fayl diskdan ketadi va kvota BO'SHAYDI.
 *   8. Bot holati profil va guruh ro'yxatida QAYTADI (o'qituvchi/admin
 *      xabar yuborishdan oldin kimga yetmasligini ko'radi).
 *   9. BILDIRISHNOMA preview'i ham xuddi shu taqsimotni qaytaradi -
 *      ogohlantirish faqat vazifada emas, oddiy xabarda ham chiqadi.
 *  10. Platforma kanali BOTDAN mustaqil: botni bloklagan o'quvchi ham
 *      vazifani ilovadan ko'radi va o'qilmagan sanog'iga tushadi.
 *
 * O'Z bazasi va O'Z upload papkasida ishlaydi, oxirida ikkalasini ham
 * o'chiradi.
 *
 * ISHLATISH:  npm run test:assignment
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// DIQQAT: env moduli import paytida muzlatiladi (Object.freeze), shuning
// uchun chegaralarni O'ZGARTIRISH uni yuklashdan OLDIN bo'lishi SHART.
// Aks holda test 5 GB kvotani to'ldirishga urinardi.
const TMP_UPLOAD = fs.mkdtempSync(path.join(os.tmpdir(), "lc-upload-test-"));
process.env.UPLOAD_DIR = TMP_UPLOAD;
process.env.STORAGE_QUOTA_GB = String(1 / 1024); // 1 MB kvota
process.env.MAX_UPLOAD_MB = "0.5"; // 512 KB bitta fayl

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * 1) Alohida Mongo bazasi o'rniga prefiksli fixture + kafolatli tozalash.
 *    Yuklash papkasi AVVALGIDEK vaqtinchalik (`os.tmpdir()`) va oxirida
 *    o'chiriladi — u bazadan mustaqil.
 *
 * 2) ⚠ YETKAZISH NAVBATI. Ilgari `process.env.MONGO_URL` test bazasiga
 *    burilardi, shunda Agenda "assignment.deliver" job'larini dev
 *    bazasiga tashlamasdi. pg-boss ayni Postgres'da yashaydi va uni
 *    shunday burib bo'lmaydi.
 *
 *    XAVF YO'Q: `assignments.service.js` da `scheduleDelivery` pg-boss
 *    ishga tushmagan bo'lsa (aynan test holati) xatoni tutadi va
 *    yetkazishni INLINE bajaradi — o'sha yerdagi izoh buni ochiq
 *    aytadi ("pg-boss bo'lmasa (masalan test) - fonda bajaramiz").
 *    Test yakunida navbatda "assignment.deliver" qolmagani ALOHIDA
 *    tekshiriladi.
 *
 * 3) `StoredFile.collection.updateOne` (xom Mongo drayveri) → Prisma
 *    `update`. Sabab o'zgardi: Mongoose `createdAt` ni immutable
 *    qilardi, Prisma esa `@default(now())` bilan oddiy ustun — uni
 *    to'g'ridan-to'g'ri yozish mumkin.
 */
const prisma = (await import("../src/config/prisma.js")).default;
const { createFixtures } = await import("./helpers/prismaFixtures.js");
const fx = createFixtures();
/** Global `StorageSettings` singletonining asl holati (yakunda tiklanadi). */
let storageSettingsBackup = null;
/** Test BOSHLANISHIDAN oldin mavjud bo'lgan fayl qatorlari. */
const storedFileBaseline = new Set();

const { runWithBranchContext } = await import(
  "../src/helpers/branchContext.helper.js"
);

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.failures.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// Xato kutilgan holat: kod va status mos kelishini tekshiradi.
const expectApiError = async (label, fn, { status, code }) => {
  try {
    await fn();
    bad(label, "xato kutilgandi, lekin muvaffaqiyatli o'tdi");
  } catch (err) {
    if (status && err.statusCode !== status) {
      return bad(label, `status ${err.statusCode}, kutilgani ${status}`);
    }
    if (code && err.code !== code) {
      return bad(label, `code "${err.code}", kutilgani "${code}"`);
    }
    ok(label, `${err.statusCode} ${err.code || ""}`);
  }
};

const run = async () => {
  const env = (await import("../src/config/env.js")).default;
  const storage = await import("../src/modules/storage/services/storage.service.js");
  const assignments = await import(
    "../src/modules/assignments/services/assignments.service.js"
  );
  // ⚠ GLOBAL SINGLETON'NI SAQLAB QO'YAMIZ.
  //
  // Test `StorageSettings` (id: "default") ni o'zgartiradi — u butun
  // markazga umumiy sozlama. Tiklanmasa dev muhitida avto-tozalash
  // siyosati JIMGINA o'zgarib qolardi.
  storageSettingsBackup = await prisma.storageSettings
    .findUnique({ where: { id: "default" } })
    .catch(() => null);

  // Bazaviy surat — yuqoridagi tozalash izohiga qarang.
  for (const f of await prisma.storedFile.findMany({ select: { id: true } }).catch(() => [])) {
    storedFileBaseline.add(f.id);
  }

  head("0. Chegaralar .env dan o'qildi");
  if (env.MAX_UPLOAD_BYTES === 512 * 1024) ok("MAX_UPLOAD_MB=0.5 -> 512 KB");
  else bad("MAX_UPLOAD_MB", `${env.MAX_UPLOAD_BYTES} bayt`);
  if (env.STORAGE_QUOTA_BYTES === 1024 * 1024) ok("STORAGE_QUOTA_GB -> 1 MB");
  else bad("STORAGE_QUOTA_GB", `${env.STORAGE_QUOTA_BYTES} bayt`);

  // --- Ma'lumot tayyorlash ---
  const teacher = await fx.user("olim_t", {
    firstName: "Olim",
    lastName: "Olimov",
    phone: "998900000001",
    role: "teacher",
    passwordHash: "x",
  });
  const otherTeacher = await fx.user("salim_t", {
    firstName: "Salim",
    lastName: "Salimov",
    phone: "998900000002",
    role: "teacher",
    passwordHash: "x",
  });

  const mkStudent = async (i) =>
    fx.user(`student_${i}`, {
      firstName: `O'quvchi${i}`,
      lastName: "Test",
      phone: `99890000010${i}`,
      role: "student",
      passwordHash: "x",
    });

  const s1 = await mkStudent(1); // botga kirgan, faol
  const s2 = await mkStudent(2); // botni BLOKLAGAN
  const s3 = await mkStudent(3); // botga umuman kirmagan

  const branch = await fx.branch("Asosiy-filial-asg");

  const group = await fx.group("Ingliz-A1", branch.id, {
    teachers: { connect: [{ id: teacher.id }] },
    isActive: true,
  });
  const foreignGroup = await fx.group("Matematika-B2", branch.id, {
    teachers: { connect: [{ id: otherTeacher.id }] },
    isActive: true,
  });

  for (const st of [s1, s2, s3]) {
    await fx.membership(group.id, st.id);
  }

  // ⚠ Telegram ID'lari ATAYLAB SOXTA (111/222): haqiqiy chat'ga xabar
  // ketmasligi uchun. Yetkazish urinishi Telegram tomonidan rad etiladi.
  const bu1 = await prisma.botUser.create({
    data: { telegramId: 111, chatId: 111, userId: s1.id, isBlocked: false },
  });
  fx.track("botUser", bu1.id);
  const bu2 = await prisma.botUser.create({
    data: { telegramId: 222, chatId: 222, userId: s2.id, isBlocked: true },
  });
  fx.track("botUser", bu2.id);
  // s3 uchun BotUser YO'Q - "botga kirmagan" holati.

  const ctx = {
    branchId: null,
    allowedBranchIds: [],
    canSeeAllBranches: true,
    userId: String(teacher.id),
  };
  const inCtx = (fn) => runWithBranchContext(ctx, fn);

  // ============================================================
  head("1. Bitta fayl chegarasi (MAX_UPLOAD_MB)");
  await expectApiError(
    "600 KB fayl rad etiladi (chegara 512 KB)",
    () =>
      storage.saveBuffer({
        buffer: Buffer.alloc(600 * 1024),
        originalName: "katta.pdf",
        mimeType: "application/pdf",
        userId: teacher.id,
      }),
    { status: 413, code: "FILE_TOO_LARGE" },
  );

  const filesOnDisk = () =>
    fs
      .readdirSync(TMP_UPLOAD, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile()).length;

  if (filesOnDisk() === 0) ok("Rad etilgan fayl diskda iz qoldirmadi");
  else bad("Diskda iz", `${filesOnDisk()} ta fayl qoldi`);

  // ============================================================
  head("2. Markaz kvotasi (STORAGE_QUOTA_GB)");
  const f1 = await storage.saveBuffer({
    buffer: Buffer.alloc(400 * 1024),
    originalName: "birinchi.pdf",
    mimeType: "application/pdf",
    userId: teacher.id,
  });
  const f2 = await storage.saveBuffer({
    buffer: Buffer.alloc(400 * 1024),
    originalName: "ikkinchi.pdf",
    mimeType: "application/pdf",
    userId: teacher.id,
  });
  ok("2 x 400 KB yuklandi (800 KB / 1 MB)");

  let usage = await storage.getUsage();
  if (usage.usedBytes === 800 * 1024) ok("Kvota hisobi to'g'ri", "800 KB");
  else bad("Kvota hisobi", `${usage.usedBytes} bayt`);

  await expectApiError(
    "Uchinchi 400 KB fayl kvotaga sig'maydi",
    () =>
      storage.saveBuffer({
        buffer: Buffer.alloc(400 * 1024),
        originalName: "uchinchi.pdf",
        mimeType: "application/pdf",
        userId: teacher.id,
      }),
    { status: 507, code: "STORAGE_QUOTA_EXCEEDED" },
  );

  if (filesOnDisk() === 2) ok("Rad etilgan uchinchi fayl diskka yozilmadi");
  else bad("Diskda ortiqcha fayl", `${filesOnDisk()} ta`);

  // isFull: bo'sh joy (224 KB) bitta fayl chegarasidan (512 KB) kichik.
  usage = await storage.getUsage();
  if (usage.isFull) ok("isFull=true - UI fayl tanlashni bloklaydi");
  else bad("isFull", "false qaytdi, true kutilgandi");

  // Joyni bo'shatamiz - keyingi bosqichda vazifaga fayl kerak.
  await storage.removeFile(f1, teacher.id);
  await storage.removeFile(f2, teacher.id);
  usage = await storage.getUsage();
  if (usage.usedBytes === 0) ok("O'chirilgandan keyin kvota bo'shadi");
  else bad("Kvota bo'shamadi", `${usage.usedBytes} bayt`);
  if (filesOnDisk() === 0) ok("Fayllar diskdan ham o'chdi");
  else bad("Fayl diskda qoldi", `${filesOnDisk()} ta`);

  // ============================================================
  head("2b. PARALLEL yuklashlar kvotadan oshira olmaydi (TOCTOU)");
  //
  // Eng muhim tekshiruv: kvota "o'qi -> qaror qil -> yoz" bo'lsa, bir
  // vaqtda kelgan so'rovlarning HAMMASI "joy bor" javobini oladi va
  // chegara oshib ketadi. Shuning uchun 5 ta 300 KB fayl BIR VAQTDA
  // yuboriladi - 1 MB kvotaga faqat 3 tasi sig'ishi kerak.
  const parallelResults = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      storage.saveBuffer({
        buffer: Buffer.alloc(300 * 1024),
        originalName: `parallel-${i}.bin`,
        mimeType: "application/octet-stream",
        userId: teacher.id,
      }),
    ),
  );
  const accepted = parallelResults.filter((r) => r.status === "fulfilled");
  const rejected = parallelResults.filter((r) => r.status === "rejected");

  if (accepted.length === 3) ok("Aynan 3 tasi qabul qilindi (3 x 300 KB)");
  else bad("Qabul qilinganlar", `${accepted.length} ta, kutilgani 3`);
  if (rejected.every((r) => r.reason?.code === "STORAGE_QUOTA_EXCEEDED"))
    ok("Qolganlari 507 STORAGE_QUOTA_EXCEEDED bilan rad etildi");
  else bad("Rad etish sababi", rejected.map((r) => r.reason?.code).join(", "));

  usage = await storage.getUsage();
  if (usage.usedBytes <= usage.quotaBytes)
    ok("Kvota OSHMADI", `${usage.usedBytes} <= ${usage.quotaBytes}`);
  else bad("Kvota oshib ketdi", `${usage.usedBytes} > ${usage.quotaBytes}`);

  const onDisk = filesOnDisk();
  if (onDisk === accepted.length)
    ok("Diskda aynan qabul qilinganlar bor", `${onDisk} ta`);
  else bad("Diskdagi fayl soni", `${onDisk}, kutilgani ${accepted.length}`);

  // Hisoblagich HAQIQAT bilan mos - drift yo'q.
  const rc = await storage.reconcile();
  if (rc.drift === 0) ok("Hisoblagich diskdagi fayllar bilan mos (drift=0)");
  else bad("Drift", `${rc.drift} bayt`);

  for (const r of accepted) await storage.removeFile(r.value, teacher.id);
  usage = await storage.getUsage();
  if (usage.usedBytes === 0) ok("Hammasi o'chirilgach kvota nolga qaytdi");
  else bad("Kvota", `${usage.usedBytes} bayt qoldi`);

  // ============================================================
  head("2bb. Yiqilishdan qolgan 'band' bayt tekislanadi (reconcile)");
  // Jarayon joyni band qilib, faylni yozishdan oldin yiqilsa hisoblagichda
  // egasiz bayt qoladi. Buni qo'lda taqlid qilamiz.
  await prisma.storageUsage.update({
    where: { key: "global" },
    data: { usedBytes: { increment: 700 * 1024 } },
  });
  const leaked = await storage.getUsage();
  if (leaked.usedBytes === 700 * 1024) ok("Egasiz 700 KB hisoblagichda turibdi");
  else bad("Taqlid", `${leaked.usedBytes} bayt`);

  const healed = await storage.reconcile();
  if (healed.drift === 700 * 1024) ok("Drift aniqlandi", `${healed.drift} bayt`);
  else bad("Drift aniqlanmadi", `${healed.drift}`);
  const afterHeal = await storage.getUsage();
  if (afterHeal.usedBytes === 0) ok("Server ishga tushganda kvota tiklanadi");
  else bad("Tekislashdan keyin", `${afterHeal.usedBytes} bayt`);

  // ============================================================
  head("2c. Ikki marta o'chirish joyni ikki marta bo'shatmaydi");
  const dbl = await storage.saveBuffer({
    buffer: Buffer.alloc(200 * 1024),
    originalName: "double.bin",
    mimeType: "application/octet-stream",
    userId: teacher.id,
  });
  await storage.removeFile(dbl, teacher.id);
  await storage.removeFile(dbl, teacher.id); // takroriy chaqiruv
  usage = await storage.getUsage();
  if (usage.usedBytes === 0) ok("Hisob buzilmadi (0 bayt)");
  else bad("Takroriy o'chirish", `${usage.usedBytes} bayt`);

  // ============================================================
  head("3. Yuborishdan oldingi ko'rib chiqish (preview)");
  const pv = await inCtx(() =>
    assignments.preview({ groupIds: [String(group.id)] }, teacher),
  );
  if (pv.total === 3) ok("Jami 3 ta o'quvchi");
  else bad("Jami", `${pv.total}`);
  if (pv.deliverable === 1) ok("1 tasiga yetkaziladi");
  else bad("deliverable", `${pv.deliverable}`);
  if (pv.blocked === 1) ok("1 tasi botni BLOKLAGAN deb ogohlantiriladi");
  else bad("blocked", `${pv.blocked}`);
  if (pv.noBot === 1) ok("1 tasi botga kirmagan");
  else bad("noBot", `${pv.noBot}`);
  if (pv.blockedStudents[0]?.firstName === "O'quvchi2")
    ok("Bloklagan o'quvchining ISMI qaytadi", pv.blockedStudents[0].firstName);
  else bad("blockedStudents", JSON.stringify(pv.blockedStudents));

  // ============================================================
  head("4. Egalik: o'zga guruhga yuborib bo'lmaydi");
  await expectApiError(
    "O'qituvchi begona guruhga vazifa yubora olmaydi",
    () =>
      inCtx(() =>
        assignments.preview({ groupIds: [String(foreignGroup.id)] }, teacher),
      ),
    { status: 403 },
  );

  // CUSTOM ROL teshigi: rol NOMI "teacher" emas, lekin TIPI "teacher".
  // Faqat nom bo'yicha tekshirilsa bunday foydalanuvchi cheklovga
  // TUSHMASDI va istalgan guruhga yuboraverardi.
  const customTeacher = {
    _id: otherTeacher.id,
    role: "katta_oqituvchi",
    roleType: "teacher",
  };
  await expectApiError(
    "Custom rol (roleType=teacher) ham cheklovga tushadi",
    () =>
      inCtx(() =>
        assignments.preview({ groupIds: [String(group.id)] }, customTeacher),
      ),
    { status: 403 },
  );
  // O'z guruhi esa ochiq qolishi kerak - cheklov haddan tashqari qattiq
  // bo'lib qolmasin.
  const ownPreview = await inCtx(() =>
    assignments.preview({ groupIds: [String(foreignGroup.id)] }, customTeacher),
  );
  if (ownPreview.total >= 0) ok("Custom rol O'Z guruhiga yubora oladi");
  else bad("Custom rol o'z guruhi", "rad etildi");

  // ============================================================
  head("5. Vazifa yaratish");
  const created = await inCtx(() =>
    assignments.create({
      body: {
        title: "Uy vazifasi 1",
        body: "12-mashqni bajaring",
        groupIds: [String(group.id)],
        dueDate: null,
      },
      file: {
        buffer: Buffer.alloc(100 * 1024),
        originalname: "vazifa.pdf",
        mimetype: "application/pdf",
      },
      currentUser: teacher,
    }),
  );

  if (created.recipientsCount === 3) ok("3 ta oluvchi yozildi");
  else bad("recipientsCount", `${created.recipientsCount}`);
  if (created.blockedCount === 1) ok("blockedCount=1 (bloklagan darhol belgilandi)");
  else bad("blockedCount", `${created.blockedCount}`);
  if (created.noBotCount === 1) ok("noBotCount=1");
  else bad("noBotCount", `${created.noBotCount}`);
  if (created.file?.originalName === "vazifa.pdf") ok("Fayl biriktirildi");
  else bad("Fayl", JSON.stringify(created.file));

  const recips = await prisma.assignmentRecipient.findMany({
    where: { assignmentId: created.id },
  });
  const statusOf = (sid) =>
    recips.find((r) => String(r.studentId) === String(sid))?.status;
  if (statusOf(s1.id) === "pending") ok("s1 -> pending (yuborish navbatida)");
  else bad("s1 status", statusOf(s1.id));
  if (statusOf(s2.id) === "blocked") ok("s2 -> blocked (botni bloklagan)");
  else bad("s2 status", statusOf(s2.id));
  if (statusOf(s3.id) === "no_bot") ok("s3 -> no_bot (botga kirmagan)");
  else bad("s3 status", statusOf(s3.id));

  usage = await storage.getUsage();
  if (usage.usedBytes === 100 * 1024) ok("Kvota vazifa faylini hisobga oldi");
  else bad("Kvota", `${usage.usedBytes} bayt`);

  // ============================================================
  head("6. Kvota to'lganda vazifa RAD etiladi (jimgina faylsiz ketmaydi)");
  // Kvotani to'ldiramiz: 100 KB band, 1 MB dan 924 KB qoldi.
  const filler = await storage.saveBuffer({
    buffer: Buffer.alloc(500 * 1024),
    originalName: "filler1.bin",
    mimeType: "application/octet-stream",
    userId: teacher.id,
  });
  const filler2 = await storage.saveBuffer({
    buffer: Buffer.alloc(400 * 1024),
    originalName: "filler2.bin",
    mimeType: "application/octet-stream",
    userId: teacher.id,
  });

  const beforeCount = await prisma.assignment.count({ where: { senderId: teacher.id } });
  await expectApiError(
    "Joy yo'qligida butun vazifa rad etiladi",
    () =>
      inCtx(() =>
        assignments.create({
          body: {
            title: "Sig'maydigan vazifa",
            body: "",
            groupIds: [String(group.id)],
            dueDate: null,
          },
          file: {
            buffer: Buffer.alloc(200 * 1024),
            originalname: "katta2.pdf",
            mimetype: "application/pdf",
          },
          currentUser: teacher,
        }),
      ),
    { status: 507, code: "STORAGE_QUOTA_EXCEEDED" },
  );
  const afterCount = await prisma.assignment.count({ where: { senderId: teacher.id } });
  if (beforeCount === afterCount) ok("Yarim yaratilgan vazifa qolmadi");
  else bad("Yarim yozuv", `${afterCount - beforeCount} ta qo'shildi`);

  // Faylsiz vazifa esa kvota to'lgan bo'lsa ham o'tishi kerak.
  const textOnly = await inCtx(() =>
    assignments.create({
      body: {
        title: "Faqat matnli vazifa",
        body: "Kitobning 40-betini o'qing",
        groupIds: [String(group.id)],
        dueDate: null,
      },
      file: null,
      currentUser: teacher,
    }),
  );
  if (textOnly?.id) ok("Kvota to'lgan bo'lsa ham MATNLI vazifa ketaveradi");
  else bad("Matnli vazifa", "yaratilmadi");

  await storage.removeFile(filler, teacher.id);
  await storage.removeFile(filler2, teacher.id);

  // ============================================================
  head("7. Vazifani o'chirish joyni bo'shatadi");
  const before = (await storage.getUsage()).usedBytes;
  await inCtx(() => assignments.remove(created.id, teacher));
  const after = (await storage.getUsage()).usedBytes;
  if (before - after === 100 * 1024) ok("100 KB bo'shadi", `${before} -> ${after}`);
  else bad("Bo'shagan hajm", `${before} -> ${after}`);

  const stillOnDisk = await prisma.storedFile.findUnique({
    where: { id: created.file.id },
  });
  if (stillOnDisk?.isDeleted) ok("StoredFile arxivlandi (tarix saqlanadi)");
  else bad("StoredFile", "isDeleted=false");
  if (filesOnDisk() === 0) ok("Fayl diskdan butunlay o'chdi");
  else bad("Diskda qoldi", `${filesOnDisk()} ta`);

  // O'chirilgan vazifa o'quvchi ro'yxatida ko'rinmasligi kerak.
  const mine = await assignments.listForStudent(s1.id, {
    page: 1,
    limit: 20,
    skip: 0,
  });
  const titles = mine.items.map((i) => i.assignment.title);
  if (!titles.includes("Uy vazifasi 1"))
    ok("O'chirilgan vazifa o'quvchi ro'yxatidan ketdi");
  else bad("O'quvchi ro'yxati", titles.join(", "));
  if (titles.includes("Faqat matnli vazifa"))
    ok("Faol vazifa o'quvchi ro'yxatida turibdi");
  else bad("O'quvchi ro'yxati", titles.join(", "));

  // ============================================================
  head("8. Bot holati profil va guruh ro'yxatida ko'rinadi");
  const { buildUserProfile } = await import(
    "../src/helpers/userProfile.helper.js"
  );
  const groupsService = await import(
    "../src/modules/groups/services/groups.service.js"
  );

  const p1 = await buildUserProfile(s1.id);
  const p2 = await buildUserProfile(s2.id);
  const p3 = await buildUserProfile(s3.id);

  if (p1.botStatus === "linked") ok("s1 profili -> linked");
  else bad("s1 botStatus", p1.botStatus);
  if (p2.botStatus === "blocked") ok("s2 profili -> blocked (BLOKLAGAN)");
  else bad("s2 botStatus", p2.botStatus);
  if (p3.botStatus === "not_linked") ok("s3 profili -> not_linked");
  else bad("s3 botStatus", p3.botStatus);
  if (p2.telegram?.isBlocked === true)
    ok("Telegram kartasi uchun isBlocked qaytadi");
  else bad("telegram.isBlocked", JSON.stringify(p2.telegram));

  const groupDetail = await inCtx(() => groupsService.getById(group.id));
  const byId = new Map(
    (groupDetail.students || []).map((s) => [String(s.id), s]),
  );
  if (byId.get(String(s2.id))?.botStatus === "blocked")
    ok("Guruh ro'yxatida ham bloklagan o'quvchi belgilanadi");
  else bad("Guruh ro'yxati", byId.get(String(s2.id))?.botStatus);

  // ============================================================
  head("9. Bildirishnoma preview'i ham ogohlantiradi");
  const notifications = await import(
    "../src/modules/notifications/services/notifications.service.js"
  );
  const notifPreview = await inCtx(() =>
    notifications.previewAudience(
      { type: "groups", groupIds: [String(group.id)] },
      teacher,
    ),
  );
  if (notifPreview.count === 3) ok("count eski nom bilan qaytadi (3)");
  else bad("count", `${notifPreview.count}`);
  if (notifPreview.deliverable === 1) ok("Telegram orqali 1 tasiga yetadi");
  else bad("deliverable", `${notifPreview.deliverable}`);
  if (notifPreview.blocked === 1) ok("1 tasi botni bloklagan");
  else bad("blocked", `${notifPreview.blocked}`);
  if (notifPreview.noBot === 1) ok("1 tasi botga kirmagan");
  else bad("noBot", `${notifPreview.noBot}`);
  if (notifPreview.blockedStudents.length === 1)
    ok("Bloklaganlarning ismi ro'yxati keladi");
  else bad("blockedStudents", JSON.stringify(notifPreview.blockedStudents));

  // ============================================================
  head("10. Platforma kanali botdan mustaqil");
  // s2 botni BLOKLAGAN - unga bot orqali yetmagan, lekin ilovada ko'rinishi
  // va o'qilmagan sanog'iga tushishi SHART.
  const blockedStudentInbox = await assignments.listForStudent(s2.id, {
    page: 1,
    limit: 20,
    skip: 0,
  });
  const blockedTitles = blockedStudentInbox.items.map((i) => i.assignment.title);
  if (blockedTitles.includes("Faqat matnli vazifa"))
    ok("Botni bloklagan o'quvchi vazifani ILOVADA ko'radi");
  else bad("Bloklagan o'quvchi inbox", blockedTitles.join(", ") || "bo'sh");

  const unread = await assignments.unreadCountForStudent(s2.id);
  if (unread.count === blockedTitles.length)
    ok(`O'qilmagan sanog'i to'g'ri (${unread.count})`);
  else bad("unreadCount", `${unread.count}, kutilgani ${blockedTitles.length}`);

  const recipientRow = blockedStudentInbox.items[0];
  // ⚠ `_id` ATAYLAB: `listForStudent` javob SHARTNOMASIDA qatorni `_id`
  // bilan qaytaradi (klient shunga tayanadi) — bu Prisma qatorining
  // `id` maydoni EMAS. Ko'chirishda uni `id` ga aylantirish
  // `markRead(undefined)` ga olib kelardi va sanoq kamaymasdi.
  await assignments.markRead(recipientRow._id, s2.id);
  const unreadAfter = await assignments.unreadCountForStudent(s2.id);
  if (unreadAfter.count === unread.count - 1)
    ok("O'qilgandan keyin sanoq kamayadi");
  else bad("unreadCount o'qilgandan keyin", `${unreadAfter.count}`);

  // ============================================================
  head("11. Admin tozalash boshqaruvi");
  const admin = await import(
    "../src/modules/storage/services/storageAdmin.service.js"
  );

  // Uch xil yoshdagi fayl: 400, 100 va 5 kunlik.
  const mkAged = async (days, bytes, name) => {
    const f = await storage.saveBuffer({
      buffer: Buffer.alloc(bytes),
      originalName: name,
      mimeType: "application/octet-stream",
      userId: teacher.id,
    });
    // createdAt'ni orqaga suramiz. XOM drayver ishlatiladi: Mongoose
    // timestamps'dan kelgan `createdAt`ni IMMUTABLE qiladi va oddiy
    // updateOne o'zgarishni jimgina tashlab yuboradi.
    await prisma.storedFile.update({
      where: { id: f.id },
      data: { createdAt: new Date(Date.now() - days * 86400000) },
    });
    return f;
  };

  const old400 = await mkAged(400, 100 * 1024, "eski-400.bin");
  const old100 = await mkAged(100, 100 * 1024, "eski-100.bin");
  const fresh = await mkAged(5, 100 * 1024, "yangi-5.bin");

  const pv365 = await admin.previewCleanup({ olderThanDays: 365 });
  if (pv365.files === 1 && pv365.bytes === 100 * 1024)
    ok("Preview: 1 yildan eski - 1 ta fayl, 100 KB");
  else bad("previewCleanup(365)", JSON.stringify(pv365));

  const pv90 = await admin.previewCleanup({ olderThanDays: 90 });
  if (pv90.files === 2) ok("Preview: 90 kundan eski - 2 ta fayl");
  else bad("previewCleanup(90)", JSON.stringify(pv90));

  const pvAll = await admin.previewCleanup({ all: true });
  if (pvAll.files === 3) ok("Preview: hammasi - 3 ta fayl");
  else bad("previewCleanup(all)", JSON.stringify(pvAll));

  // Filtrsiz chaqiruv "hammasini o'chir"ga aylanib ketmasligi kerak.
  await expectApiError(
    "Filtrsiz tozalash rad etiladi",
    () => admin.previewCleanup({}),
    { status: 400 },
  );

  const usedBefore = (await storage.getUsage()).usedBytes;
  const run365 = await admin.runCleanup({
    olderThanDays: 365,
    userId: teacher.id,
  });
  if (run365.deleted === 1 && run365.freedBytes === 100 * 1024)
    ok("Tozalash: 1 ta fayl o'chdi, 100 KB bo'shadi");
  else bad("runCleanup(365)", JSON.stringify(run365));

  const usedAfter = (await storage.getUsage()).usedBytes;
  if (usedBefore - usedAfter === 100 * 1024) ok("Kvota aynan shuncha bo'shadi");
  else bad("Kvota", `${usedBefore} -> ${usedAfter}`);

  const stillThere = await prisma.storedFile.findUnique({ where: { id: fresh.id } });
  if (!stillThere.isDeleted) ok("Yangi fayl TEGILMADI");
  else bad("Yangi fayl", "o'chirilgan");

  // Vazifa havolasi uzilishi - ishlamaydigan "Yuklab olish" qolmasin.
  const asgWithFile = await inCtx(() =>
    assignments.create({
      body: {
        title: "Tozalanadigan vazifa",
        body: "",
        groupIds: [String(group.id)],
        dueDate: null,
      },
      file: {
        buffer: Buffer.alloc(50 * 1024),
        originalname: "tozalanadi.pdf",
        mimetype: "application/pdf",
      },
      currentUser: teacher,
    }),
  );
  await admin.runCleanup({ all: true, userId: teacher.id });
  const afterClean = await prisma.assignment.findUnique({ where: { id: asgWithFile.id } });
  if (!afterClean.file && afterClean.fileRemovedAt)
    ok("Vazifadagi fayl havolasi uzildi, izi qoldi (fileRemovedAt)");
  else bad("Vazifa havolasi", JSON.stringify({ file: afterClean.file }));

  const emptied = await storage.getUsage();
  if (emptied.usedBytes === 0) ok("To'liq tozalashdan keyin kvota 0");
  else bad("To'liq tozalash", `${emptied.usedBytes} bayt qoldi`);
  if (filesOnDisk() === 0) ok("Disk ham bo'shadi");
  else bad("Diskda qoldi", `${filesOnDisk()} ta`);

  // ============================================================
  head("12. Avto-tozalash faqat vaqti kelganda yuradi");
  const s1st = await admin.updateSettings({
    autoCleanupEnabled: true,
    frequency: "weekly",
    olderThanDays: 30,
  });
  if (s1st.autoCleanupEnabled && s1st.frequency === "weekly")
    ok("Siyosat saqlandi (haftalik, 30 kun)");
  else bad("updateSettings", JSON.stringify(s1st));

  // ⚠ `lastRunAt` NOLGA QAYTARILADI — "birinchi yurish" shartini test
  // O'ZI o'rnatadi.
  //
  // `StorageSettings` GLOBAL SINGLETON (`id: "default"`). Bo'sh Mongo
  // bazasida u har safar yangi edi; haqiqiy bazada esa oldingi yurishdan
  // qolgan `lastRunAt` tufayli tozalash O'TKAZIB YUBORILARDI va test
  // o'zining oldingi izi sababli yiqilardi.
  await prisma.storageSettings.update({
    where: { id: "default" },
    data: { lastRunAt: null },
  });

  const first = await admin.runScheduledCleanup();
  if (!first.skipped) ok("Birinchi yurish darhol bajarildi");
  else bad("Birinchi yurish", "o'tkazib yuborildi");

  const second = await admin.runScheduledCleanup();
  if (second.skipped) ok("Ikkinchi yurish o'tkazib yuborildi (vaqti kelmagan)");
  else bad("Ikkinchi yurish", "yana bajarildi");

  await expectApiError(
    "Noto'g'ri chastota rad etiladi",
    () => admin.updateSettings({ frequency: "hourly" }),
    { status: 400 },
  );
  await expectApiError(
    "Chegaradan tashqari muddat rad etiladi",
    () => admin.updateSettings({ olderThanDays: 0 }),
    { status: 400 },
  );

  // ============================================================
  head("13. Fayl turi filtri (VPS himoyasi)");
  //
  // Bu bo'lim yuklash MIDDLEWARE'ini tekshiradi - servis emas. Sabab:
  // himoyaning butun ma'nosi zararli fayl servisga YETIB BORMASLIGIDA.
  const {
    contentMatchesExtension,
    canonicalMimeOf,
    allowedExtensions,
  } = await import("../src/middleware/uploadAttachment.js");

  const PDF = Buffer.from("%PDF-1.7\n...", "binary");
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const PHP = Buffer.from("<?php system($_GET['c']); ?>", "utf8");

  const allowed = allowedExtensions();
  const mustBeBlocked = [
    ".php", ".phtml", ".cgi", ".pl", ".py", ".jsp", ".asp", ".aspx",
    ".html", ".htm", ".svg", ".xhtml",
    ".exe", ".bat", ".sh", ".ps1", ".jar", ".apk", ".hta", ".jse",
    ".wsf", ".msc", ".cpl", ".reg", ".lnk", ".scf", ".url", ".iso",
  ];
  const slipped = mustBeBlocked.filter((e) => allowed.includes(e));
  if (slipped.length === 0)
    ok(`Xavfli kengaytmalar oq ro'yxatda yo'q (${mustBeBlocked.length} ta tekshirildi)`);
  else bad("Oq ro'yxatga sizib kirgan", slipped.join(", "));

  if (!allowed.includes("")) ok("Kengaytmasiz fayl o'tmaydi");
  else bad("Kengaytmasiz fayl", "ruxsat etilgan");

  // Mazmun tekshiruvi: nomni almashtirish yetarli emas.
  if (!contentMatchesExtension(PHP, ".pdf"))
    ok("`.pdf` deb nomlangan PHP skripti RAD etiladi (imzo mos emas)");
  else bad("Imzo tekshiruvi", "PHP skript pdf sifatida o'tdi");

  if (!contentMatchesExtension(PHP, ".png"))
    ok("`.png` deb nomlangan skript RAD etiladi");
  else bad("Imzo tekshiruvi", "skript png sifatida o'tdi");

  if (contentMatchesExtension(PDF, ".pdf")) ok("Haqiqiy PDF o'tadi");
  else bad("Imzo tekshiruvi", "haqiqiy PDF rad etildi");

  if (contentMatchesExtension(PNG, ".png")) ok("Haqiqiy PNG o'tadi");
  else bad("Imzo tekshiruvi", "haqiqiy PNG rad etildi");

  if (!contentMatchesExtension(Buffer.alloc(0), ".pdf"))
    ok("Bo'sh bufer imzo tekshiruvidan o'tmaydi");
  else bad("Imzo tekshiruvi", "bo'sh bufer o'tdi");

  // Yuklab olishda Content-Type SAQLANGAN qiymatdan olinmaydi.
  if (canonicalMimeOf("dars.pdf") === "application/pdf")
    ok("Yuklab olishda MIME kengaytmadan olinadi");
  else bad("canonicalMimeOf", canonicalMimeOf("dars.pdf"));

  if (canonicalMimeOf("eski.html") === "application/octet-stream")
    ok("Notanish/xavfli kengaytma -> octet-stream (brauzer ochmaydi)");
  else bad("canonicalMimeOf(html)", canonicalMimeOf("eski.html"));

  // ============================================================
};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    // ── Servis yaratgan qatorlar ──
    const uids = [...(fx.registry.get("user") || [])];
    const gids = [...(fx.registry.get("group") || [])];
    const asgs = await prisma.assignment
      .findMany({ where: { senderId: { in: uids } }, select: { id: true } })
      .catch(() => []);
    for (const a of asgs) fx.track("assignment", a.id);
    if (asgs.length) {
      const recips = await prisma.assignmentRecipient
        .findMany({ where: { assignmentId: { in: asgs.map((a) => a.id) } }, select: { id: true } })
        .catch(() => []);
      for (const r of recips) fx.track("assignmentRecipient", r.id);
    }
    // ⚠ FAYLLARNI EGASI BO'YICHA TOPIB BO'LMAYDI.
    //
    // `StoredFile` da `userId` YO'Q — `uploadedById` bor, va tozalash
    // oqimi uni NULL ga tushiradi (yumshoq o'chirilgan fayl egasiz
    // qoladi). Shuning uchun ular EGA bo'yicha emas, BAZAVIY SURAT
    // bo'yicha aniqlanadi: test boshlanishidan oldin mavjud bo'lmagan
    // har bir qator — shu testniki.
    const files = await prisma.storedFile
      .findMany({ select: { id: true } })
      .catch(() => []);
    for (const f of files) {
      if (!storedFileBaseline.has(f.id)) fx.track("storedFile", f.id);
    }

    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    // ⚠ KVOTA HISOBLAGICHI GLOBAL SINGLETON — nolga qaytarilishi shart,
    // aks holda keyingi yurish (va dev muhiti) noto'g'ri band hajm
    // ko'rsatardi.
    await prisma.storageUsage
      .update({ where: { key: "global" }, data: { usedBytes: 0, reconciledAt: new Date() } })
      .catch(() => {});

    // ⚠ SOZLAMA SINGLETONI TIKLANADI (yuqoridagi izohga qarang).
    if (storageSettingsBackup) {
      await prisma.storageSettings
        .update({
          where: { id: "default" },
          data: {
            autoCleanupEnabled: storageSettingsBackup.autoCleanupEnabled,
            frequency: storageSettingsBackup.frequency,
            olderThanDays: storageSettingsBackup.olderThanDays,
            lastRunAt: storageSettingsBackup.lastRunAt,
            lastRunDeleted: storageSettingsBackup.lastRunDeleted,
            lastRunFreedBytes: storageSettingsBackup.lastRunFreedBytes,
          },
        })
        .catch(() => {});
      ok("global saqlash sozlamalari tiklandi");
    }

    // ⚠ NAVBAT TEKSHIRUVI: yetkazish job'i dev navbatiga tushmaganini
    // isbotlaymiz (fayl boshidagi izohga qarang).
    try {
      const [q] = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS n FROM pgboss.job
        WHERE name = 'assignment.deliver' AND created_on > now() - interval '10 minutes'
      `;
      if ((q?.n ?? 0) === 0) ok("yetkazish job'i navbatga tushmadi (inline bajarildi)");
      else bad("navbatga job tushdi", `${q.n} ta 'assignment.deliver'`);
    } catch {
      ok("yetkazish navbati tekshirildi (pgboss.job jadvali yo'q)");
    }

    fs.rmSync(TMP_UPLOAD, { recursive: true, force: true });

    console.log(
      `\n\x1b[1mNatija:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
        `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
    );
    if (R.fail) R.failures.forEach((f) => console.log(`  \x1b[31m- ${f}\x1b[0m`));
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
