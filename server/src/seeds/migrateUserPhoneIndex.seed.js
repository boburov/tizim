import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import User from "../models/user.model.js";

// Bir martalik migratsiya: User.phone endi UNIQUE emas.
//
// Muammo: bitta telefon raqamdan bir nechta odam foydalanadi - ona ikki
// farzandini bitta raqamdan yozdiradi, aka-uka bitta telefonga ega. Eski
// `phone_1` unique (sparse) indeks ikkinchi odamni E11000 bilan rad etardi
// va resepshin uni umuman kiritmasdan qo'yardi.
//
// Yechim: unique indeks o'rniga oddiy indeks (qidiruv uchun kerak).
// 1) Eski `phone_1` unique indeksni o'chiramiz.
// 2) syncIndexes - schema'dagi oddiy `phone` indeksi yaratiladi.
//
// DIQQAT: `username_1` unique bo'lib QOLADI - u autentifikatsiya kaliti.
//
// Bu skript ISHLATILMASA HAM bo'ladi: connectDB() har ishga tushishda
// eskirgan `phone_1` unique indeksni o'zi o'chiradi (config/db.js).
// Skript qo'lda, aniq bir marta bajarish uchun saqlanadi.
const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  // 1) Eski indeksni o'chirish (connectDB allaqachon o'chirgan bo'lishi
  //    mumkin - o'shanda bu qadam jimgina o'tib ketadi).
  try {
    await User.collection.dropIndex("phone_1");
    logger.info("Eski phone_1 unique indeks o'chirildi");
  } catch (err) {
    logger.info(
      { msg: err?.message },
      "Eski phone_1 indeks topilmadi yoki allaqachon o'chirilgan",
    );
  }

  // 2) Yangi indekslarni yaratish (phone - oddiy indeks)
  await User.syncIndexes();
  logger.info("User indekslari sinxronlandi (phone unique EMAS)");

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`User telefon indeks migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "User telefon indeks migratsiya xato");
  process.exit(1);
});
