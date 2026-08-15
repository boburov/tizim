import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import Permission from "../models/permission.model.js";
import Role from "../models/role.model.js";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  splitPermissionKey,
  getModuleMeta,
} from "../constants/permissions.js";
import {
  ALL_ROLES,
  ROLES,
  ROLE_TYPES,
  SYSTEM_ROLE_META,
} from "../constants/roles.js";
import { BRANCH_LOCAL_PERMISSIONS } from "../constants/permissionScope.js";
import logger from "../config/logger.js";

const seed = async () => {
  await connectDB();

  // Permissions upsert.
  // DIQQAT: module/action endi majburiy maydon - eski hujjatlarda ular yo'q,
  // shuning uchun har seedda key'dan qayta hisoblab $set qilamiz (migratsiya).
  const permIds = {};
  for (const key of Object.values(PERMISSIONS)) {
    const meta = PERMISSION_LABELS[key] || { label: key, group: "general" };
    const { module, action } = splitPermissionKey(key);
    const moduleMeta = getModuleMeta(module);

    const doc = await Permission.findOneAndUpdate(
      { key },
      {
        $set: {
          label: meta.label,
          group: meta.group,
          module,
          action,
          moduleLabel: moduleMeta.label,
          moduleOrder: moduleMeta.order,
        },
      },
      { upsert: true, new: true },
    );
    permIds[key] = doc._id;
  }
  logger.info(`Permissions seed qilindi: ${Object.keys(permIds).length}`);

  // Kod bazasidan olib tashlangan permission'lar DB'da qolib ketmasin -
  // aks holda ular matritsada "o'lik katak" bo'lib turadi.
  const stale = await Permission.deleteMany({
    key: { $nin: Object.values(PERMISSIONS) },
  });
  if (stale.deletedCount) {
    logger.info(`Eskirgan permission o'chirildi: ${stale.deletedCount}`);
  }

  // Built-in rollar. isSystem=true - UI'dan o'chirib/muzlatib bo'lmaydi.
  // Owner permissions are reset on every seed so newly added permission keys
  // are automatically attached.
  const labels = { owner: "Egasi", teacher: "O'qituvchi", student: "O'quvchi" };
  for (const value of ALL_ROLES) {
    const roleMeta = SYSTEM_ROLE_META[value];
    // DIQQAT: defaultPath ham $set ichida - $setOnInsert MAVJUD hujjatga
    // ta'sir qilmaydi, ya'ni eski rollarda u undefined bo'lib qolardi.
    const systemFields = {
      isSystem: true,
      isFrozen: false,
      roleType: roleMeta.roleType,
      defaultPath: roleMeta.defaultPath,
    };

    if (value === ROLES.OWNER) {
      await Role.findOneAndUpdate(
        { value },
        {
          $setOnInsert: { value, label: labels[value] },
          $set: { ...systemFields, permissions: Object.values(permIds) },
        },
        { upsert: true, new: true },
      );
    } else if (value === ROLES.TEACHER) {
      // Teacher: default permissionlarni har seedda qo'shamiz (mavjudlarini buzmaymiz)
      const teacherDefaults = [
        permIds[PERMISSIONS.GROUPS_READ],
        permIds[PERMISSIONS.USERS_READ],
        permIds[PERMISSIONS.ATTENDANCE_READ],
        permIds[PERMISSIONS.ATTENDANCE_RECORD],
        permIds[PERMISSIONS.GRADES_READ],
        permIds[PERMISSIONS.GRADES_RECORD],
        permIds[PERMISSIONS.RATING_READ],
        permIds[PERMISSIONS.NOTIFICATIONS_SEND],
        permIds[PERMISSIONS.ASSIGNMENTS_READ],
        permIds[PERMISSIONS.ASSIGNMENTS_SEND],
      ].filter(Boolean);
      await Role.findOneAndUpdate(
        { value },
        {
          $setOnInsert: { value, label: labels[value] },
          $set: systemFields,
          $addToSet: { permissions: { $each: teacherDefaults } },
        },
        { upsert: true, new: true },
      );
    } else {
      // Student: reytingni ko'rishi mumkin (faqat o'qish). Har seedda qo'shamiz.
      const studentDefaults = [permIds[PERMISSIONS.RATING_READ]].filter(Boolean);
      await Role.findOneAndUpdate(
        { value },
        {
          $setOnInsert: { value, label: labels[value] },
          $set: systemFields,
          $addToSet: { permissions: { $each: studentDefaults } },
        },
        { upsert: true, new: true },
      );
    }
  }
  logger.info("Rollar seed qilindi");

  // --- DIREKTOR (filial administratori) roli ---
  // Filial direktori uchun tayyor shablon. isSystem=false: owner uni
  // matritsada erkin tahrirlay oladi va kerak bo'lsa o'chira oladi.
  //
  // DIQQAT: isFrozen=false bo'lishi SHART. isFrozen "bu roldagilar tizimga
  // KIRA OLMAYDI" degani - muzlatilgan holda yaratilsa, tayinlangan direktor
  // darhol qulflangan bo'lardi.
  //
  // ── ASOSIY PRINSIP (owner qarori) ──
  // Filial rahbari O'Z FILIALIDA hamma narsani qila oladi. Faqat GLOBAL
  // va FILIALLARARO ishlar owner'da qoladi.
  //
  // Ro'yxat QO'LDA yozilmaydi - constants/permissionScope.js dan
  // hisoblanadi: "hamma ruxsat minus owner-only istisnolar". Shuning
  // uchun yangi ruxsat qo'shilganda u avtomatik ravishda direktorga
  // tushadi.
  //
  // NEGA QO'LDA RO'YXAT TASHLANDI: ilgari bu yerda 35 ta kalit sanalgan
  // edi va shablonga yangi kalit qo'shish ESDAN CHIQARDI. Natijada
  // direktor davomat belgilay olardi, lekin baho qo'ya olmasdi
  // (grades.record) - va buni tuzatish uchun alohida migratsiya
  // yozishga to'g'ri kelgan. Endi bunday og'ish mumkin emas.
  //
  // ── NIMA BERILMAYDI VA NEGA ──
  // To'liq ro'yxat va sabablari: constants/permissionScope.js.
  // Eng muhimlari:
  //   system.admin_access     - owner-ga tenglashtiradi
  //   branches.view_all       - boshqa filialni ko'radi
  //   branches.update         - o'ziga qo'yilgan cheklovni o'zi olib tashlaydi
  //   approvals.decide_config } matritsani BUTUNLAY chetlab o'tadi, ya'ni
  //   finance.approve         } owner biror amalni "tasdiqqa" qaytara olmasdi
  //
  // ── TASDIQ ZANJIRI QAYERGA KETDI ──
  // Endi u ruxsatga emas, FILIAL matritsasiga bog'langan
  // (Branch.delegation, qarang constants/delegation.js). Standart holat -
  // `auto`: direktor o'zi bajaradi. Owner istagan turni istagan filialda
  // `threshold` yoki `approval` ga qaytara oladi.
  //
  // O'ziga o'zi maosh belgilash esa ALOHIDA to'siq bilan yopilgan
  // (helpers/selfSalary.guard.js) - u rejimdan ham, ruxsatdan ham
  // qat'i nazar ishlaydi.
  const directorPermKeys = BRANCH_LOCAL_PERMISSIONS;

  const directorPermIds = directorPermKeys.map((k) => permIds[k]).filter(Boolean);

  await Role.findOneAndUpdate(
    { value: "director" },
    {
      // $setOnInsert: mavjud rolning ruxsatlarini QAYTA YOZMAYMIZ - owner
      // uni o'zgartirgan bo'lsa, keyingi seed uni tiklab yubormasin.
      $setOnInsert: {
        value: "director",
        label: "Filial direktori",
        description: "Filial administratori - o'z filiali doirasida ishlaydi",
        isSystem: false,
        isFrozen: false,
        roleType: ROLE_TYPES.STAFF,
        defaultPath: "/owner",
        permissions: directorPermIds,
      },
    },
    { upsert: true, new: true },
  );
  logger.info("Direktor roli tayyor");

  // --- RESEPSHIN (qabul xodimi) roli ---
  //
  // Eng TOR rol: telefonga javob beradi, lid yozadi va u bilan ishlaydi.
  //
  // NIMA QILA OLADI:
  //   leads.read    - lidlar ro'yxati va statistikasi
  //   leads.create  - yangi lid qo'shish (asosiy ishi)
  //   leads.update  - status siljitish, eslatma qo'yish, izoh yozish
  //
  // NIMA QILA OLMAYDI (ATAYLAB):
  //   leads.manage  - o'quvchiga AYLANTIRISH va O'CHIRISH.
  //     Aylantirish = guruhga yozish = moliyaviy majburiyat yaratish.
  //     Bu resepshin qarori emas. O'chirish esa yo'qotish statistikasini
  //     yo'q qiladi - lid o'chirilsa "nega kelmadi" tahlili ham yo'qoladi.
  //   users.read    - butun foydalanuvchilar bazasi kerak emas.
  //   finance.*     - pulga umuman aloqasi yo'q.
  //
  // Lid o'quvchiga aylantirilishi kerak bo'lsa, resepshin statusni
  // "Sinovda qatnashdi" ga qo'yadi va direktor/owner qabul qiladi.
  const receptionPermKeys = [
    PERMISSIONS.LEADS_READ,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_UPDATE,
  ];
  const receptionPermIds = receptionPermKeys.map((k) => permIds[k]).filter(Boolean);

  await Role.findOneAndUpdate(
    { value: "reception" },
    {
      // $setOnInsert - direktor rolidagi bilan bir xil sabab: owner
      // ruxsatlarni o'zgartirgan bo'lsa, keyingi seed uni tiklamasin.
      $setOnInsert: {
        value: "reception",
        label: "Resepshin",
        description: "Qabul xodimi - lid qabul qiladi va ular bilan ishlaydi",
        isSystem: false,
        isFrozen: false,
        roleType: ROLE_TYPES.STAFF,
        // Kirgach darhol lidlar sahifasi ochiladi - uning yagona ish joyi.
        // "/owner" bo'lsa u bo'sh dashboard'ga tushib, qayerga borishni
        // izlab yurardi.
        defaultPath: "/owner/leads",
        permissions: receptionPermIds,
      },
    },
    { upsert: true, new: true },
  );
  logger.info("Resepshin roli tayyor");

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Seed xato");
  process.exit(1);
});
