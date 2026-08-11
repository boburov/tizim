import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import Role from "../models/role.model.js";
import Permission from "../models/permission.model.js";
import { PERMISSIONS } from "../constants/permissions.js";

// BIR MARTALIK MIGRATSIYA: direktorga "Baho qo'yish" (grades.record).
//
// NEGA SEED YETARLI EMAS: permissions.seed.js direktor rolini
// `$setOnInsert` bilan yozadi - owner ruxsatlarni qo'lda o'zgartirgan
// bo'lsa, keyingi seed uni TIKLAMASLIGI kerak. Shu sababli shablonga
// qo'shilgan yangi kalit MAVJUD bazaga tushmaydi - uni shu skript
// qo'shadi.
//
// NIMA UCHUN KERAK: direktorda ATTENDANCE_RECORD bor edi, GRADES_RECORD
// yo'q. Ya'ni o'qituvchi kelmagan darsda davomatni belgilay olardi,
// lekin baho qo'yishga urinsa "Ruxsat etilmagan" (403) olardi.
//
// IDEMPOTENT: kalit allaqachon bo'lsa hech narsa qilmaydi.
// QAYTARISH: panel > Rollar > Filial direktori > "Baho qo'yish" belgisini
// olib tashlash (yoki $pull).
const migrate = async () => {
  await connectDB();

  const perm = await Permission.findOne({ key: PERMISSIONS.GRADES_RECORD }).lean();
  if (!perm) {
    logger.error(
      `"${PERMISSIONS.GRADES_RECORD}" ruxsati katalogda yo'q - avval "npm run seed:permissions" ni ishga tushiring`,
    );
    await disconnectDB();
    process.exit(1);
  }

  const res = await Role.updateOne(
    { value: "director", permissions: { $ne: perm._id } },
    { $addToSet: { permissions: perm._id }, $inc: { permissionsVersion: 1 } },
  );

  if (res.modifiedCount) {
    logger.info(`Direktorga "${PERMISSIONS.GRADES_RECORD}" qo'shildi`);
    // DIQQAT: rol keshi (permission.helper.js) HAR PROTSESSDA alohida va
    // 5 daqiqa yashaydi. Bu skript boshqa protsess, shuning uchun ishlab
    // turgan API server eski ruxsatlarni shuncha vaqt ushlab turadi -
    // darhol kerak bo'lsa serverni qayta ishga tushiring.
    logger.warn("API serverni qayta ishga tushiring (yoki 5 daqiqa kutib turing)");
  } else {
    logger.info("Direktorda bu ruxsat allaqachon bor - o'zgarish yo'q");
  }

  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "Migratsiya xato");
  process.exit(1);
});
