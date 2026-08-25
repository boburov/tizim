import {
  PERMISSIONS,
  PERMISSION_LABELS,
  splitPermissionKey,
  getModuleMeta,
  ALL_ROLES,
  ROLES,
  ROLE_TYPES,
  SYSTEM_ROLE_META,
} from '../common/constants/permissions.js';
import { BRANCH_LOCAL_PERMISSIONS } from '../common/constants/permission-scope.js';
import {
  COIN_PERMISSIONS,
  COIN_PERMISSION_LABELS,
  COIN_BRANCH_LOCAL_PERMISSIONS,
  COIN_MODULE_META,
} from '../common/constants/coin.js';
import { runSeed } from './seed-runner.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KATALOG = ASOSIY REYESTR + BO'LIM REYESTRLARI.
 *
 * `PERMISSIONS` MUZLATILGAN Express oracle'i bilan solishtiriladi
 * (`test/constants-parity.test.mjs`), shuning uchun undan KEYIN qo'shilgan
 * bo'limlar o'z ro'yxatini olib yuradi va u SHU YERDA qo'shiladi.
 * Batafsil sabab: `common/constants/coin.ts` sarlavhasi.
 *
 * ⚠ `ALL_KEYS` ni yangi bo'lim uchun kengaytirishni UNUTMANG. Pastdagi
 * "eskirgan ruxsatni tozalash" bosqichi AYNAN shu ro'yxatga tayanadi:
 * kalit unda bo'lmasa, seed uni har yurishda BAZADAN O'CHIRIB tashlaydi
 * va ruxsat jimgina yo'qoladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const EXTRA_PERMISSIONS: Record<string, string> = { ...COIN_PERMISSIONS };
const EXTRA_LABELS: Record<string, { label: string; group: string }> = {
  ...COIN_PERMISSION_LABELS,
};
const EXTRA_MODULE_META: Record<string, { label: string; order: number }> = {
  ...COIN_MODULE_META,
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RUXSAT KATALOGI VA TIZIM ROLLARI — `server_legacy/src/seeds/permissions.seed.js`
 * dan ko'chirilgan.
 *
 * ⚠ BUSIZ TOZA BAZA ISHLAMAYDI. `roles.service.ts` ruxsat matritsasini
 * `Permission` JADVALIDAN quradi (`p.label`, `p.moduleLabel`) — jadval
 * bo'sh bo'lsa matritsa ham bo'sh, ya'ni owner hech kimga hech narsa
 * bera olmaydi. Owner rolining ruxsatlari ham shu yerda biriktiriladi.
 *
 * IDEMPOTENT: hamma yozuv `upsert` orqali. Ikkinchi yurishda yangi qator
 * PAYDO BO'LMAYDI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
void runSeed('permissions', async ({ prisma, logger }) => {
  // ── 1) RUXSAT KATALOGI ──
  //
  // DIQQAT: module/action MAJBURIY maydon — eski yozuvlarda ular yo'q,
  // shuning uchun har seedda kalitdan QAYTA hisoblanadi (migratsiya).
  const ALL_KEYS: string[] = [
    ...Object.values(PERMISSIONS),
    ...Object.values(EXTRA_PERMISSIONS),
  ];

  const permIds: Record<string, string> = {};
  for (const key of ALL_KEYS) {
    const meta =
      PERMISSION_LABELS[key] || EXTRA_LABELS[key] || { label: key, group: 'general' };
    const { module, action } = splitPermissionKey(key);
    // Yangi bo'limning modul sarlavhasi asosiy reyestrda yo'q —
    // `getModuleMeta` esa u yerdan qidiradi va `{ label: "coin",
    // order: 999 }` qaytarardi, ya'ni matritsada ustun "coin" deb
    // ko'rinib, ro'yxat oxiriga tushib qolardi.
    const moduleMeta = EXTRA_MODULE_META[module] || getModuleMeta(module);

    const fields = {
      label: meta.label,
      group: meta.group,
      module,
      action,
      moduleLabel: moduleMeta.label,
      moduleOrder: moduleMeta.order,
    };

    const doc = await prisma.permission.upsert({
      where: { key },
      update: fields,
      create: { key, ...fields },
    });
    permIds[key] = doc.id;
  }
  logger.log(`Ruxsatlar seed qilindi: ${Object.keys(permIds).length}`);

  // Kod bazasidan olib tashlangan ruxsatlar bazada QOLIB KETMASIN —
  // aks holda ular matritsada "o'lik katak" bo'lib turadi.
  const stale = await prisma.permission.deleteMany({
    where: { key: { notIn: ALL_KEYS } },
  });
  if (stale.count) logger.log(`Eskirgan ruxsat o'chirildi: ${stale.count}`);

  // ── 2) TIZIM ROLLARI ──
  //
  // isSystem=true — UI'dan o'chirib/muzlatib bo'lmaydi.
  const labels: Record<string, string> = {
    owner: 'Egasi',
    teacher: "O'qituvchi",
    student: "O'quvchi",
  };

  for (const value of ALL_ROLES) {
    const roleMeta = SYSTEM_ROLE_META[value];
    // DIQQAT: `defaultPath` ham `update` ICHIDA — faqat-yaratishda
    // qo'yilsa MAVJUD rollarda u `undefined` bo'lib qolardi.
    const systemFields = {
      isSystem: true,
      isFrozen: false,
      roleType: roleMeta.roleType,
      defaultPath: roleMeta.defaultPath,
    };

    if (value === ROLES.OWNER) {
      // `set` — BARCHA ruxsatni QAYTA biriktiradi: yangi qo'shilgan
      // ruxsat kalitlari owner'ga avtomatik tushishi kerak.
      const allPerms = Object.values(permIds).map((id) => ({ id }));
      await prisma.role.upsert({
        where: { value },
        update: { ...systemFields, permissions: { set: allPerms } },
        create: {
          value,
          label: labels[value],
          ...systemFields,
          permissions: { connect: allPerms },
        },
      });
      continue;
    }

    // O'qituvchi va o'quvchi: standart ruxsatlar har seedda QO'SHILADI,
    // mavjudlari BUZILMAYDI (`connect` — `$addToSet` ekvivalenti).
    // Owner qo'lda bergan qo'shimcha ruxsatlar shu sabab saqlanadi.
    const defaults =
      value === ROLES.TEACHER
        ? [
            PERMISSIONS.GROUPS_READ,
            PERMISSIONS.USERS_READ,
            PERMISSIONS.ATTENDANCE_READ,
            PERMISSIONS.ATTENDANCE_RECORD,
            PERMISSIONS.GRADES_READ,
            PERMISSIONS.GRADES_RECORD,
            PERMISSIONS.RATING_READ,
            PERMISSIONS.NOTIFICATIONS_SEND,
            PERMISSIONS.ASSIGNMENTS_READ,
            PERMISSIONS.ASSIGNMENTS_SEND,
          ]
        : // O'quvchi: faqat reytingni ko'radi.
          [PERMISSIONS.RATING_READ];

    const connectDefaults = defaults
      .map((k) => permIds[k])
      .filter(Boolean)
      .map((id) => ({ id }));

    await prisma.role.upsert({
      where: { value },
      update: { ...systemFields, permissions: { connect: connectDefaults } },
      create: {
        value,
        label: labels[value],
        ...systemFields,
        permissions: { connect: connectDefaults },
      },
    });
  }
  logger.log('Tizim rollari seed qilindi');

  // ── 3) DIREKTOR (filial administratori) ──
  //
  // Filial rahbari O'Z FILIALIDA hamma narsani qila oladi; faqat GLOBAL
  // va FILIALLARARO ishlar owner'da qoladi. Ro'yxat QO'LDA yozilmaydi —
  // `constants/permission-scope.ts` dan hisoblanadi ("hammasi minus
  // owner-only istisnolar"), ya'ni yangi ruxsat avtomatik tushadi.
  //
  // NEGA QO'LDA RO'YXAT TASHLANGAN: ilgari 35 ta kalit sanalgan edi va
  // shablonga yangi kalit qo'shish ESDAN CHIQARDI — direktor davomat
  // belgilay olardi, lekin baho qo'ya olmasdi (`grades.record`).
  //
  // isFrozen=false BO'LISHI SHART: isFrozen "bu roldagilar tizimga KIRA
  // OLMAYDI" degani — muzlatilgan holda yaratilsa tayinlangan direktor
  // darhol qulflangan bo'lardi.
  //
  // `update: {}` — BO'SH, ATAYLAB: rol allaqachon bor bo'lsa unga
  // TEGILMAYDI, chunki owner uning ruxsatlarini o'zgartirgan bo'lishi
  // mumkin va seed uni tiklab yubormasligi kerak.
  const directorPermIds = [
    ...BRANCH_LOCAL_PERMISSIONS,
    // Yangi bo'limlarning filial ichi kalitlari. `coin.settings`
    // ATAYLAB YO'Q: u butun markazni o'chirib qo'yadigan tugma
    // (`COIN_OWNER_ONLY_PERMISSIONS`).
    ...COIN_BRANCH_LOCAL_PERMISSIONS,
  ]
    .map((k) => permIds[k])
    .filter(Boolean);

  await prisma.role.upsert({
    where: { value: 'director' },
    update: {},
    create: {
      value: 'director',
      label: 'Filial direktori',
      description: "Filial administratori - o'z filiali doirasida ishlaydi",
      isSystem: false,
      isFrozen: false,
      roleType: ROLE_TYPES.STAFF,
      defaultPath: '/owner',
      permissions: { connect: directorPermIds.map((id) => ({ id })) },
    },
  });
  logger.log(`Direktor roli tayyor (${directorPermIds.length} ruxsat)`);

  // ── 4) RESEPSHIN (qabul xodimi) ──
  //
  // Eng TOR rol: telefonga javob beradi, lid yozadi va u bilan ishlaydi.
  //
  // `leads.manage` ATAYLAB YO'Q — u o'quvchiga AYLANTIRISH va O'CHIRISH
  // demak. Aylantirish = guruhga yozish = moliyaviy majburiyat yaratish;
  // bu resepshin qarori emas. O'chirish esa yo'qotish statistikasini yo'q
  // qiladi. Lid tayyor bo'lsa resepshin statusni siljitadi, qarorni
  // direktor/owner qabul qiladi.
  const receptionPermIds = [
    PERMISSIONS.LEADS_READ,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_UPDATE,
  ]
    .map((k) => permIds[k])
    .filter(Boolean);

  await prisma.role.upsert({
    where: { value: 'reception' },
    update: {},
    create: {
      value: 'reception',
      label: 'Resepshin',
      description: "Qabul xodimi - lid qabul qiladi va ular bilan ishlaydi",
      isSystem: false,
      isFrozen: false,
      roleType: ROLE_TYPES.STAFF,
      // Kirgach darhol lidlar sahifasi ochiladi — uning yagona ish joyi.
      // "/owner" bo'lsa bo'sh dashboard'ga tushib qolardi.
      defaultPath: '/owner/leads',
      permissions: { connect: receptionPermIds.map((id) => ({ id })) },
    },
  });
  logger.log('Resepshin roli tayyor');
});
