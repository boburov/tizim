import mongoose from "mongoose";
import env from "./env.js";
import logger from "./logger.js";

mongoose.set("strictQuery", true);

// BotUser kolleksiyasidagi ESKIRGAN unique indekslarni o'chiradi.
// Bitta Telegram endi bir nechta userga bog'lana oladi, shuning uchun quyidagilar
// E11000 berib yangi userni bog'lashga to'sqinlik qiladi - ularni olib tashlaymiz:
//   - user_1        : eski "bitta user -> bitta telegram" unique indeksi
//   - telegramId_1  : eski "bitta telegram -> bitta user" unique indeksi
// Mongoose autoIndex eski indeksni O'CHIRMAYDI - shu sabab har ishga tushishda
// bir marta tekshirib, eskirgan unique indekslarni olib tashlaymiz.
// Kolleksiyadagi ESKIRGAN unique indeksni o'chiradi (agar u haqiqatan
// unique bo'lsa - bir xil nomli oddiy indeksga tegilmaydi).
// Mongoose autoIndex eski indeksni O'CHIRMAYDI, shu sabab har ishga
// tushishda bir marta tekshiriladi.
const dropStaleUniqueIndexes = async (collectionName, indexNames, label) => {
  try {
    const coll = mongoose.connection.collection(collectionName);
    const indexes = await coll.indexes();
    for (const name of indexNames) {
      const stale = indexes.find((i) => i.name === name && i.unique === true);
      if (stale) {
        await coll.dropIndex(name);
        logger.warn({ index: name }, `Eskirgan ${label} unique indeks o'chirildi (boot tozalash)`);
      }
    }
  } catch (err) {
    // Kolleksiya hali yo'q yoki indeks topilmadi - e'tiborsiz, server ishlashda davom etsin
    logger.info({ msg: err?.message }, `${label} indeks tozalash o'tkazib yuborildi`);
  }
};

// BotUser: bitta Telegram endi bir nechta userga bog'lana oladi, eski
// unique indekslar (user_1 / telegramId_1) E11000 berib yangi bog'lanishga
// to'sqinlik qiladi.
//
// User: telefon takrorlanishi ruxsat etilgan (qarang: user.model.js phone
// izohi), lekin eski `phone_1` unique indeks bazada qolib ketadi va
// takroriy raqamli ikkinchi foydalanuvchi E11000 bilan yiqilardi -
// ya'ni kod o'zgargani bilan xulq-atvor o'zgarmasdi. `username_1` unique
// bo'lib QOLADI (u autentifikatsiya kaliti) - ro'yxatda yo'q.
const cleanupStaleIndexes = async () => {
  await dropStaleUniqueIndexes("botusers", ["user_1", "telegramId_1"], "BotUser");
  await dropStaleUniqueIndexes("users", ["phone_1"], "User telefon");
};

// ─────────────────────────────────────────────────────────────────────────
// StudentPayment: unique indeksga `isOpening` qo'shildi.
//
// NEGA MIGRATSIYA KERAK (oddiy schema o'zgarishi YETARLI EMAS):
//
//  1) Mongoose autoIndex ESKI indeksni o'chirmaydi. Eski
//     {student,group,year,month} unique indeksi qolib ketsa, boshlang'ich
//     qarz qatorini oddiy plan bilan bir oyga yozib bo'lmasdi (E11000).
//
//  2) Yangi indeks yaratilishidan OLDIN barcha eski hujjatlarga
//     isOpening=false yozilishi SHART. MongoDB yo'q maydonni `null` deb
//     indekslaydi, ya'ni eski hujjat {...,null} kaliti bilan, yangi
//     hujjat esa {...,false} kaliti bilan tushardi - IKKALASI ham
//     o'tib ketardi va bitta o'quvchiga bir oyda IKKITA plan yozilardi.
//     Bu to'g'ridan-to'g'ri IKKI BARAVAR HISOB degani.
//
// Tartib qat'iy: to'ldirish → eski indeksni o'chirish → yangisini yaratish.
// Har bosqich idempotent, ikkinchi ishga tushishda hech nima qilmaydi.
const LEGACY_SP_INDEX = "student_1_group_1_year_1_month_1";

const migrateStudentPaymentOpeningIndex = async () => {
  const coll = mongoose.connection.collection("studentpayments");

  // Kolleksiya hali yo'q (toza baza) - migratsiya kerak emas.
  const exists = await mongoose.connection.db
    .listCollections({ name: "studentpayments" })
    .hasNext();
  if (!exists) return;

  // 1) TO'LDIRISH. Indeksga tegishdan oldin - tartib buzilsa yuqoridagi
  //    null/false teshigi ochilib qoladi.
  const filled = await coll.updateMany(
    { isOpening: { $exists: false } },
    { $set: { isOpening: false } },
  );
  if (filled.modifiedCount) {
    logger.warn(
      { modified: filled.modifiedCount },
      "StudentPayment: eski hujjatlarga isOpening=false yozildi",
    );
  }

  // 2) ESKI INDEKSNI O'CHIRISH.
  const indexes = await coll.indexes();
  const legacy = indexes.find((i) => i.name === LEGACY_SP_INDEX);
  if (legacy) {
    await coll.dropIndex(LEGACY_SP_INDEX);
    logger.warn(
      { index: LEGACY_SP_INDEX },
      "StudentPayment: eskirgan unique indeks o'chirildi (isOpening bilan almashtirildi)",
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────
// TeacherSalary: eski {teacher,group,year,month} unique indeksi.
//
// Model uni ALLAQACHON ikkita PARTIAL indeksga bo'lgan (guruh qatorlari
// alohida, markaz qatorlari alohida), lekin ESKISI bazada qolib ketgan -
// mongoose autoIndex hech qachon indeks o'chirmaydi. Natijada
// teacherSalary.model.js dagi izohda TUZATILDI deb yozilgan xato
// amalda hamon kuchda:
//
//   `group: null` bo'lgan hujjatlar oddiy (partial bo'lmagan) unique
//   indeksda BIR-BIRIGA to'qnashadi, chunki MongoDB null'ni oddiy
//   qiymat deb sanaydi. Ya'ni bitta o'qituvchida bir oyda fiksa (base)
//   qatori bilan mukofot (bonus) qatori BIRGA TURA OLMAYDI - ikkinchisi
//   E11000 bilan rad etiladi va maosh JIMGINA kam hisoblanadi.
//
// Boshlang'ich qoldiqning guruhsiz qatori ham aynan shu to'siqqa uriladi.
//
// Backfill KERAK EMAS (StudentPayment migratsiyasidan farqi shu): yangi
// indekslarning ikkalasi ham partial va `kind` bo'yicha ochiq filtrlangan,
// ya'ni "yo'q maydon null bo'lib indekslanadi" teshigi bu yerda yo'q.
const LEGACY_TS_INDEX = "teacher_1_group_1_year_1_month_1";

const migrateTeacherSalaryIndex = async () => {
  const exists = await mongoose.connection.db
    .listCollections({ name: "teachersalaries" })
    .hasNext();
  if (!exists) return;

  const coll = mongoose.connection.collection("teachersalaries");
  const indexes = await coll.indexes();

  // Nomi bo'yicha emas, SHAKLI bo'yicha ham tekshiramiz: yangi partial
  // indeks nomi boshqacha (`..._kind_1`), shuning uchun adashib uni
  // o'chirib yuborish xavfi yo'q - lekin `partialFilterExpression`
  // yo'qligini ham talab qilamiz, bu ikkinchi qulf.
  const legacy = indexes.find(
    (i) => i.name === LEGACY_TS_INDEX && i.unique === true && !i.partialFilterExpression,
  );
  if (!legacy) return;

  await coll.dropIndex(LEGACY_TS_INDEX);
  logger.warn(
    { index: LEGACY_TS_INDEX },
    "TeacherSalary: eskirgan unique indeks o'chirildi (partial indekslar bilan almashtirildi)",
  );
};

export const connectDB = async () => {
  await mongoose.connect(env.MONGO_URL);
  logger.info("MongoDB ulandi");
  await cleanupStaleIndexes();

  // MIGRATSIYA XATOSI SERVERNI TO'XTATADI - ataylab.
  //
  // Yuqoridagi cleanupStaleIndexes() xatoni yutadi, chunki u faqat
  // qulaylik uchun. Bu esa boshqa: indeks yarim holatda qolsa (eski
  // o'chgan, yangisi yaratilmagan) tizim o'quvchiga bir oyda IKKITA
  // plan yozib, JIMGINA ikki baravar hisoblab ketardi. Bunday xatoni
  // keyin topib, orqaga qaytarish deyarli imkonsiz - shuning uchun
  // server umuman ko'tarilmagani xavfsizroq.
  await migrateStudentPaymentOpeningIndex();
  await migrateTeacherSalaryIndex();

  // 3) YANGI INDEKSNI YARATISH. Model schema'sidagi barcha indekslarni
  //    yaratadi (mavjudlariga tegmaydi). Ochiq chaqiriladi - autoIndex
  //    fon rejimida ishlaydi va uning tugashini kutib bo'lmaydi, ya'ni
  //    birinchi so'rov himoyasiz oynaga tushishi mumkin edi.
  const { default: StudentPayment } = await import(
    "../models/studentPayment.model.js"
  );
  await StudentPayment.createIndexes();

  const { default: TeacherSalary } = await import("../models/teacherSalary.model.js");
  await TeacherSalary.createIndexes();
};

export const disconnectDB = async () => {
  await mongoose.disconnect();
  logger.info("MongoDB uzildi");
};
