import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import Role from "../models/role.model.js";
import Permission from "../models/permission.model.js";
import {
  BRANCH_LOCAL_PERMISSIONS,
  OWNER_ONLY_PERMISSIONS,
} from "../constants/permissionScope.js";

// MIGRATSIYA: filial direktoriga O'Z FILIALIDA to'liq huquq.
//
// IKKI YO'NALISHDA ISHLAYDI:
//
//   (+) QO'SHADI  - constants/permissionScope.js dagi barcha "filial ichi"
//                   ruxsatlarini. Ilgari shablon qo'lda yozilgan 35 ta
//                   kalitdan iborat edi va yangi kalit qo'shilganda unga
//                   tushmasdi (grades.record hikoyasi).
//
//   (−) OLIB TASHLAYDI - sizib kirgan OWNER-ONLY kalitlarni. Bu tasodifiy
//                   emas: jonli bazadagi direktor rolida `branches.view_all`
//                   va `system.admin_access` paydo bo'lgan edi va natijada
//                   A filial direktori B filial o'qituvchisining PAROLINI
//                   o'qiy olardi (tests/privEscalation.test.js shuni
//                   ko'rsatgan). Seed shablonida ular hech qachon
//                   bo'lmagan - ya'ni ular panel orqali qo'lda qo'shilgan.
//
// NEGA SEED YETARLI EMAS: permissions.seed.js direktor rolini
// `$setOnInsert` bilan yozadi - owner ruxsatlarni qo'lda o'zgartirgan
// bo'lsa keyingi seed uni TIKLAMASLIGI kerak. Shu sababli shablondagi
// o'zgarish MAVJUD bazaga tushmaydi.
//
// IDEMPOTENT: ikkinchi marta ishga tushirilsa hech narsa o'zgarmaydi.
//
// QAYTARISH: panel > Rollar > Filial direktori - ruxsatlarni qo'lda
// tahrirlang. Bu skript kelajakda qayta ishga tushirilsa yana tiklaydi.
//
// ISHLATISH:  npm run migrate:director-full

const ROLE_VALUE = "director";

const migrate = async () => {
  await connectDB();

  const role = await Role.findOne({ value: ROLE_VALUE });
  if (!role) {
    logger.warn(
      `"${ROLE_VALUE}" roli topilmadi - avval "npm run seed:permissions" ni ishga tushiring`,
    );
    await disconnectDB();
    return;
  }

  // Kalit -> ObjectId xaritasi. Katalogda yo'q kalit jimgina tushib
  // qoladi (seed hali yurgizilmagan bo'lishi mumkin).
  const perms = await Permission.find({}).select("_id key").lean();
  const idByKey = new Map(perms.map((p) => [p.key, String(p._id)]));
  const keyById = new Map(perms.map((p) => [String(p._id), p.key]));

  const missingInCatalog = BRANCH_LOCAL_PERMISSIONS.filter((k) => !idByKey.has(k));
  if (missingInCatalog.length) {
    logger.warn(
      `Katalogda yo'q ${missingInCatalog.length} ta kalit o'tkazib yuborildi: ${missingInCatalog.join(", ")} — "npm run seed:permissions" ni ishga tushiring`,
    );
  }

  const before = new Set((role.permissions || []).map(String));

  const wanted = new Set(
    BRANCH_LOCAL_PERMISSIONS.map((k) => idByKey.get(k)).filter(Boolean),
  );
  const forbidden = new Set(
    OWNER_ONLY_PERMISSIONS.map((k) => idByKey.get(k)).filter(Boolean),
  );

  const added = [...wanted].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => forbidden.has(id));

  if (!added.length && !removed.length) {
    logger.info("Direktor roli allaqachon to'g'ri - o'zgarish yo'q");
    await disconnectDB();
    return;
  }

  // YAKUNIY RO'YXAT: mavjud + qo'shilgan − taqiqlangan.
  //
  // Owner qo'shgan BOSHQA (owner-only bo'lmagan) kalitlar SAQLANADI -
  // masalan u direktorga alohida bir huquq bergan bo'lsa, migratsiya uni
  // olib tashlamasligi kerak.
  const next = [...new Set([...before, ...wanted])].filter((id) => !forbidden.has(id));

  role.permissions = next;
  role.permissionsVersion = (role.permissionsVersion || 0) + 1;
  await role.save();

  if (added.length) {
    logger.info(
      `Qo'shildi (${added.length}): ${added.map((id) => keyById.get(id)).join(", ")}`,
    );
  }
  if (removed.length) {
    logger.warn(
      `OLIB TASHLANDI (${removed.length}) - imtiyoz oshirish yo'li edi: ${removed
        .map((id) => keyById.get(id))
        .join(", ")}`,
    );
  }

  // DIQQAT: rol keshi (permission.helper.js) HAR PROTSESSDA alohida va
  // 5 daqiqa yashaydi. Bu skript boshqa protsess, shuning uchun ishlab
  // turgan API server eski ruxsatlarni shuncha vaqt ushlab turadi -
  // darhol kerak bo'lsa serverni qayta ishga tushiring.
  logger.info(
    `Direktor roli yangilandi: jami ${next.length} ta ruxsat. Ishlab turgan server keshini yangilash uchun uni qayta ishga tushiring.`,
  );

  await disconnectDB();
};

migrate().catch(async (err) => {
  logger.error({ err }, "Migratsiya yiqildi");
  try {
    await disconnectDB();
  } catch {
    /* ulanmagan bo'lsa e'tiborsiz */
  }
  process.exit(1);
});
