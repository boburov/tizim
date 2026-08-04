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

const TEST_DB = "mongodb://127.0.0.1:27017/lc_assignment_test";

// Agenda (yetkazish navbati) ham SHU bazaga yozsin: aks holda test
// dev bazasiga "assignment.deliver" job'larini tashlab ketardi.
process.env.MONGO_URL = TEST_DB;

const mongoose = (await import("mongoose")).default;
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
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  const env = (await import("../src/config/env.js")).default;
  const storage = await import("../src/modules/storage/services/storage.service.js");
  const assignments = await import(
    "../src/modules/assignments/services/assignments.service.js"
  );
  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const GroupMembership = (
    await import("../src/models/groupMembership.model.js")
  ).default;
  const BotUser = (await import("../src/models/botUser.model.js")).default;
  const StoredFile = (await import("../src/models/storedFile.model.js")).default;
  const Assignment = (await import("../src/models/assignment.model.js")).default;
  const AssignmentRecipient = (
    await import("../src/models/assignmentRecipient.model.js")
  ).default;

  head("0. Chegaralar .env dan o'qildi");
  if (env.MAX_UPLOAD_BYTES === 512 * 1024) ok("MAX_UPLOAD_MB=0.5 -> 512 KB");
  else bad("MAX_UPLOAD_MB", `${env.MAX_UPLOAD_BYTES} bayt`);
  if (env.STORAGE_QUOTA_BYTES === 1024 * 1024) ok("STORAGE_QUOTA_GB -> 1 MB");
  else bad("STORAGE_QUOTA_GB", `${env.STORAGE_QUOTA_BYTES} bayt`);

  // --- Ma'lumot tayyorlash ---
  const teacher = await User.create({
    firstName: "Olim",
    lastName: "Olimov",
    username: "olim_t",
    phone: "998900000001",
    role: "teacher",
    passwordHash: "x",
  });
  const otherTeacher = await User.create({
    firstName: "Salim",
    lastName: "Salimov",
    username: "salim_t",
    phone: "998900000002",
    role: "teacher",
    passwordHash: "x",
  });

  const mkStudent = async (i) =>
    User.create({
      firstName: `O'quvchi${i}`,
      lastName: "Test",
      username: `student_${i}`,
      phone: `99890000010${i}`,
      role: "student",
      passwordHash: "x",
    });

  const s1 = await mkStudent(1); // botga kirgan, faol
  const s2 = await mkStudent(2); // botni BLOKLAGAN
  const s3 = await mkStudent(3); // botga umuman kirmagan

  const Branch = (await import("../src/models/branch.model.js")).default;
  const branch = await Branch.create({ name: "Asosiy filial", isMain: true });

  const group = await Group.create({
    name: "Ingliz A1",
    branchId: branch._id,
    teachers: [teacher._id],
    isActive: true,
  });
  const foreignGroup = await Group.create({
    name: "Matematika B2",
    branchId: branch._id,
    teachers: [otherTeacher._id],
    isActive: true,
  });

  for (const s of [s1, s2, s3]) {
    await GroupMembership.create({ group: group._id, student: s._id });
  }

  await BotUser.create({
    telegramId: 111,
    chatId: 111,
    user: s1._id,
    isBlocked: false,
  });
  await BotUser.create({
    telegramId: 222,
    chatId: 222,
    user: s2._id,
    isBlocked: true,
  });
  // s3 uchun BotUser YO'Q - "botga kirmagan" holati.

  const ctx = {
    branchId: null,
    allowedBranchIds: [],
    canSeeAllBranches: true,
    userId: String(teacher._id),
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
        userId: teacher._id,
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
    userId: teacher._id,
  });
  const f2 = await storage.saveBuffer({
    buffer: Buffer.alloc(400 * 1024),
    originalName: "ikkinchi.pdf",
    mimeType: "application/pdf",
    userId: teacher._id,
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
        userId: teacher._id,
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
  await storage.removeFile(f1, teacher._id);
  await storage.removeFile(f2, teacher._id);
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
        userId: teacher._id,
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

  for (const r of accepted) await storage.removeFile(r.value, teacher._id);
  usage = await storage.getUsage();
  if (usage.usedBytes === 0) ok("Hammasi o'chirilgach kvota nolga qaytdi");
  else bad("Kvota", `${usage.usedBytes} bayt qoldi`);

  // ============================================================
  head("2bb. Yiqilishdan qolgan 'band' bayt tekislanadi (reconcile)");
  // Jarayon joyni band qilib, faylni yozishdan oldin yiqilsa hisoblagichda
  // egasiz bayt qoladi. Buni qo'lda taqlid qilamiz.
  const StorageUsage = (await import("../src/models/storageUsage.model.js"))
    .default;
  await StorageUsage.updateOne({ key: "global" }, { $inc: { usedBytes: 700 * 1024 } });
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
    userId: teacher._id,
  });
  await storage.removeFile(dbl, teacher._id);
  await storage.removeFile(dbl, teacher._id); // takroriy chaqiruv
  usage = await storage.getUsage();
  if (usage.usedBytes === 0) ok("Hisob buzilmadi (0 bayt)");
  else bad("Takroriy o'chirish", `${usage.usedBytes} bayt`);

  // ============================================================
  head("3. Yuborishdan oldingi ko'rib chiqish (preview)");
  const pv = await inCtx(() =>
    assignments.preview({ groupIds: [String(group._id)] }, teacher),
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
        assignments.preview({ groupIds: [String(foreignGroup._id)] }, teacher),
      ),
    { status: 403 },
  );

  // CUSTOM ROL teshigi: rol NOMI "teacher" emas, lekin TIPI "teacher".
  // Faqat nom bo'yicha tekshirilsa bunday foydalanuvchi cheklovga
  // TUSHMASDI va istalgan guruhga yuboraverardi.
  const customTeacher = {
    _id: otherTeacher._id,
    role: "katta_oqituvchi",
    roleType: "teacher",
  };
  await expectApiError(
    "Custom rol (roleType=teacher) ham cheklovga tushadi",
    () =>
      inCtx(() =>
        assignments.preview({ groupIds: [String(group._id)] }, customTeacher),
      ),
    { status: 403 },
  );
  // O'z guruhi esa ochiq qolishi kerak - cheklov haddan tashqari qattiq
  // bo'lib qolmasin.
  const ownPreview = await inCtx(() =>
    assignments.preview({ groupIds: [String(foreignGroup._id)] }, customTeacher),
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
        groupIds: [String(group._id)],
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

  const recips = await AssignmentRecipient.find({ assignment: created._id }).lean();
  const statusOf = (sid) =>
    recips.find((r) => String(r.student) === String(sid))?.status;
  if (statusOf(s1._id) === "pending") ok("s1 -> pending (yuborish navbatida)");
  else bad("s1 status", statusOf(s1._id));
  if (statusOf(s2._id) === "blocked") ok("s2 -> blocked (botni bloklagan)");
  else bad("s2 status", statusOf(s2._id));
  if (statusOf(s3._id) === "no_bot") ok("s3 -> no_bot (botga kirmagan)");
  else bad("s3 status", statusOf(s3._id));

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
    userId: teacher._id,
  });
  const filler2 = await storage.saveBuffer({
    buffer: Buffer.alloc(400 * 1024),
    originalName: "filler2.bin",
    mimeType: "application/octet-stream",
    userId: teacher._id,
  });

  const beforeCount = await Assignment.countDocuments({});
  await expectApiError(
    "Joy yo'qligida butun vazifa rad etiladi",
    () =>
      inCtx(() =>
        assignments.create({
          body: {
            title: "Sig'maydigan vazifa",
            body: "",
            groupIds: [String(group._id)],
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
  const afterCount = await Assignment.countDocuments({});
  if (beforeCount === afterCount) ok("Yarim yaratilgan vazifa qolmadi");
  else bad("Yarim yozuv", `${afterCount - beforeCount} ta qo'shildi`);

  // Faylsiz vazifa esa kvota to'lgan bo'lsa ham o'tishi kerak.
  const textOnly = await inCtx(() =>
    assignments.create({
      body: {
        title: "Faqat matnli vazifa",
        body: "Kitobning 40-betini o'qing",
        groupIds: [String(group._id)],
        dueDate: null,
      },
      file: null,
      currentUser: teacher,
    }),
  );
  if (textOnly?._id) ok("Kvota to'lgan bo'lsa ham MATNLI vazifa ketaveradi");
  else bad("Matnli vazifa", "yaratilmadi");

  await storage.removeFile(filler, teacher._id);
  await storage.removeFile(filler2, teacher._id);

  // ============================================================
  head("7. Vazifani o'chirish joyni bo'shatadi");
  const before = (await storage.getUsage()).usedBytes;
  await inCtx(() => assignments.remove(created._id, teacher));
  const after = (await storage.getUsage()).usedBytes;
  if (before - after === 100 * 1024) ok("100 KB bo'shadi", `${before} -> ${after}`);
  else bad("Bo'shagan hajm", `${before} -> ${after}`);

  const stillOnDisk = await StoredFile.findById(created.file._id).lean();
  if (stillOnDisk?.isDeleted) ok("StoredFile arxivlandi (tarix saqlanadi)");
  else bad("StoredFile", "isDeleted=false");
  if (filesOnDisk() === 0) ok("Fayl diskdan butunlay o'chdi");
  else bad("Diskda qoldi", `${filesOnDisk()} ta`);

  // O'chirilgan vazifa o'quvchi ro'yxatida ko'rinmasligi kerak.
  const mine = await assignments.listForStudent(s1._id, {
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

  const p1 = await buildUserProfile(s1._id);
  const p2 = await buildUserProfile(s2._id);
  const p3 = await buildUserProfile(s3._id);

  if (p1.botStatus === "linked") ok("s1 profili -> linked");
  else bad("s1 botStatus", p1.botStatus);
  if (p2.botStatus === "blocked") ok("s2 profili -> blocked (BLOKLAGAN)");
  else bad("s2 botStatus", p2.botStatus);
  if (p3.botStatus === "not_linked") ok("s3 profili -> not_linked");
  else bad("s3 botStatus", p3.botStatus);
  if (p2.telegram?.isBlocked === true)
    ok("Telegram kartasi uchun isBlocked qaytadi");
  else bad("telegram.isBlocked", JSON.stringify(p2.telegram));

  const groupDetail = await inCtx(() => groupsService.getById(group._id));
  const byId = new Map(
    (groupDetail.students || []).map((s) => [String(s._id), s]),
  );
  if (byId.get(String(s2._id))?.botStatus === "blocked")
    ok("Guruh ro'yxatida ham bloklagan o'quvchi belgilanadi");
  else bad("Guruh ro'yxati", byId.get(String(s2._id))?.botStatus);

  // ============================================================
  head("9. Bildirishnoma preview'i ham ogohlantiradi");
  const notifications = await import(
    "../src/modules/notifications/services/notifications.service.js"
  );
  const notifPreview = await inCtx(() =>
    notifications.previewAudience(
      { type: "groups", groupIds: [String(group._id)] },
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
  const blockedStudentInbox = await assignments.listForStudent(s2._id, {
    page: 1,
    limit: 20,
    skip: 0,
  });
  const blockedTitles = blockedStudentInbox.items.map((i) => i.assignment.title);
  if (blockedTitles.includes("Faqat matnli vazifa"))
    ok("Botni bloklagan o'quvchi vazifani ILOVADA ko'radi");
  else bad("Bloklagan o'quvchi inbox", blockedTitles.join(", ") || "bo'sh");

  const unread = await assignments.unreadCountForStudent(s2._id);
  if (unread.count === blockedTitles.length)
    ok(`O'qilmagan sanog'i to'g'ri (${unread.count})`);
  else bad("unreadCount", `${unread.count}, kutilgani ${blockedTitles.length}`);

  const recipientRow = blockedStudentInbox.items[0];
  await assignments.markRead(recipientRow._id, s2._id);
  const unreadAfter = await assignments.unreadCountForStudent(s2._id);
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
      userId: teacher._id,
    });
    // createdAt'ni orqaga suramiz. XOM drayver ishlatiladi: Mongoose
    // timestamps'dan kelgan `createdAt`ni IMMUTABLE qiladi va oddiy
    // updateOne o'zgarishni jimgina tashlab yuboradi.
    await StoredFile.collection.updateOne(
      { _id: f._id },
      { $set: { createdAt: new Date(Date.now() - days * 86400000) } },
    );
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
    userId: teacher._id,
  });
  if (run365.deleted === 1 && run365.freedBytes === 100 * 1024)
    ok("Tozalash: 1 ta fayl o'chdi, 100 KB bo'shadi");
  else bad("runCleanup(365)", JSON.stringify(run365));

  const usedAfter = (await storage.getUsage()).usedBytes;
  if (usedBefore - usedAfter === 100 * 1024) ok("Kvota aynan shuncha bo'shadi");
  else bad("Kvota", `${usedBefore} -> ${usedAfter}`);

  const stillThere = await StoredFile.findById(fresh._id).lean();
  if (!stillThere.isDeleted) ok("Yangi fayl TEGILMADI");
  else bad("Yangi fayl", "o'chirilgan");

  // Vazifa havolasi uzilishi - ishlamaydigan "Yuklab olish" qolmasin.
  const asgWithFile = await inCtx(() =>
    assignments.create({
      body: {
        title: "Tozalanadigan vazifa",
        body: "",
        groupIds: [String(group._id)],
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
  await admin.runCleanup({ all: true, userId: teacher._id });
  const afterClean = await Assignment.findById(asgWithFile._id).lean();
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
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  // Agenda O'Z mongo ulanishini ochadi (service yetkazishni navbatga
  // qo'yganda). Yopilmasa jarayon tugamay osilib qolardi.
  const agenda = (await import("../src/config/agenda.js")).default;
  await agenda.stop().catch(() => null);
  await agenda.close({ force: true }).catch(() => null);
  fs.rmSync(TMP_UPLOAD, { recursive: true, force: true });

  console.log(
    `\n\x1b[1mNatija:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.fail) R.failures.forEach((f) => console.log(`  \x1b[31m- ${f}\x1b[0m`));
  process.exit(R.fail ? 1 : 0);
};

run().catch(async (err) => {
  console.error("\x1b[31mTest yiqildi:\x1b[0m", err);
  await mongoose.disconnect().catch(() => null);
  fs.rmSync(TMP_UPLOAD, { recursive: true, force: true });
  process.exit(1);
});
