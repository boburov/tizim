import {
  BRANCH_LOCAL_PERMISSIONS,
  OWNER_ONLY_PERMISSIONS,
} from '../common/constants/permission-scope.js';
import {
  COIN_BRANCH_LOCAL_PERMISSIONS,
  COIN_OWNER_ONLY_PERMISSIONS,
} from '../common/constants/coin.js';
import { runSeed } from './seed-runner.js';

/**
 * KO'LAM REYESTRI IKKI MANBADAN.
 *
 * Asosiy ro'yxat (`permission-scope.ts`) MUZLATILGAN oracle bilan
 * solishtiriladi va o'zgarmaydi; undan keyin qo'shilgan bo'limlar
 * o'z ro'yxatini olib yuradi (sabab: `common/constants/coin.ts`).
 *
 * ⚠ IKKALA TOMONNI HAM QO'SHISH SHART. Faqat "beriladigan" ro'yxat
 * kengaytirilsa, yangi bo'limning owner-only kaliti (`coin.settings`)
 * direktor rolida QOLIB KETARDI — bu skript aynan shunday sizib
 * kirgan kalitlarni tozalash uchun yozilgan.
 */
const GRANT_KEYS: readonly string[] = [
  ...BRANCH_LOCAL_PERMISSIONS,
  ...COIN_BRANCH_LOCAL_PERMISSIONS,
];
const FORBID_KEYS: readonly string[] = [
  ...OWNER_ONLY_PERMISSIONS,
  ...COIN_OWNER_ONLY_PERMISSIONS,
];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRATSIYA: filial direktoriga O'Z FILIALIDA to'liq huquq —
 * `server_legacy/src/seeds/migrateDirectorFullAccess.seed.js` dan ko'chirilgan.
 *
 * IKKI YO'NALISHDA ISHLAYDI:
 *
 *   (+) QO'SHADI — `constants/permission-scope.ts` dagi barcha "filial ichi"
 *                  ruxsatlarini. Ilgari shablon qo'lda yozilgan 35 ta
 *                  kalitdan iborat edi va yangi kalit unga tushmasdi
 *                  (`grades.record` hikoyasi).
 *
 *   (−) OLIB TASHLAYDI — sizib kirgan OWNER-ONLY kalitlarni. Bu nazariy
 *                  emas: jonli bazada direktor rolida `branches.view_all`
 *                  va `system.admin_access` paydo bo'lgan edi va natijada
 *                  A filial direktori B filial o'qituvchisining PAROLINI
 *                  o'qiy olardi. Seed shablonida ular hech qachon
 *                  bo'lmagan — ya'ni ular panel orqali QO'LDA qo'shilgan.
 *
 * NEGA `permissions.seed` YETARLI EMAS: u direktor rolini `update: {}` bilan
 * yozadi — owner ruxsatlarni qo'lda o'zgartirgan bo'lsa keyingi seed uni
 * TIKLAMASLIGI kerak. Shu sababli shablondagi o'zgarish MAVJUD bazaga
 * tushmaydi va uni shu skript olib kiradi.
 *
 * ⚠ BU BIR MARTALIK EMAS. Panel orqali owner-only kalit yana sizib kirsa,
 * skriptni qayta yurgizish uni yana olib tashlaydi.
 *
 * IDEMPOTENT: o'zgarish bo'lmasa bazaga umuman tegilmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const ROLE_VALUE = 'director';

void runSeed('migrate-director-full-access', async ({ prisma, logger }) => {
  const role = await prisma.role.findUnique({
    where: { value: ROLE_VALUE },
    include: { permissions: { select: { id: true } } },
  });

  if (!role) {
    logger.warn(
      `"${ROLE_VALUE}" roli topilmadi — avval "npm run seed:permissions" ni ishga tushiring`,
    );
    return;
  }

  // Kalit → id xaritasi. Katalogda yo'q kalit jimgina tushib qolmaydi —
  // ogohlantiriladi (seed hali yurgizilmagan bo'lishi mumkin).
  const perms = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idByKey = new Map(perms.map((p) => [p.key, p.id]));
  const keyById = new Map(perms.map((p) => [p.id, p.key]));

  const missingInCatalog = GRANT_KEYS.filter((k) => !idByKey.has(k));
  if (missingInCatalog.length) {
    logger.warn(
      `Katalogda yo'q ${missingInCatalog.length} ta kalit o'tkazib yuborildi: ` +
        `${missingInCatalog.join(', ')} — "npm run seed:permissions" ni ishga tushiring`,
    );
  }

  const before = new Set(role.permissions.map((p) => p.id));
  const wanted = new Set(
    GRANT_KEYS.map((k) => idByKey.get(k)).filter((id): id is string => Boolean(id)),
  );
  const forbidden = new Set(
    FORBID_KEYS.map((k) => idByKey.get(k)).filter((id): id is string => Boolean(id)),
  );

  const added = [...wanted].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => forbidden.has(id));

  if (!added.length && !removed.length) {
    logger.log("Direktor roli allaqachon to'g'ri — o'zgarish yo'q");
    return;
  }

  // YAKUNIY RO'YXAT: mavjud + qo'shilgan − taqiqlangan.
  //
  // Owner qo'shgan BOSHQA (owner-only bo'lmagan) kalitlar SAQLANADI —
  // masalan u direktorga alohida bir huquq bergan bo'lsa, migratsiya uni
  // olib tashlamasligi kerak.
  const next = [...new Set([...before, ...wanted])].filter((id) => !forbidden.has(id));

  // `permissionsVersion` oshirilishi MUHIM: `common/rbac/permission.service.ts`
  // keshi shu raqamga qaraydi, aks holda ishlab turgan server eski
  // ruxsatlar bilan qolib ketardi.
  await prisma.role.update({
    where: { id: role.id },
    data: {
      permissions: { set: next.map((id) => ({ id })) },
      permissionsVersion: (role.permissionsVersion || 0) + 1,
    },
  });

  if (added.length) {
    logger.log(`Qo'shildi (${added.length}): ${added.map((id) => keyById.get(id)).join(', ')}`);
  }
  if (removed.length) {
    logger.warn(
      `OLIB TASHLANDI (${removed.length}) — imtiyoz oshirish yo'li edi: ` +
        `${removed.map((id) => keyById.get(id)).join(', ')}`,
    );
  }

  // DIQQAT: rol keshi HAR PROTSESSDA alohida. Bu skript boshqa protsess,
  // shuning uchun ishlab turgan API server eski ruxsatlarni kesh muddati
  // tugaguncha ushlab turadi — darhol kerak bo'lsa serverni qayta ishga
  // tushiring.
  logger.log(
    `Direktor roli yangilandi: jami ${next.length} ta ruxsat. ` +
      `Ishlab turgan server keshini yangilash uchun uni qayta ishga tushiring.`,
  );
});
