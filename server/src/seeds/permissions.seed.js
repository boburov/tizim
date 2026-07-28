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
  // Ruxsatlari ataylab O'QISH ustunlikli: pul chiqarish (finance.pay,
  // salary.pay) bor, lekin tasdiqlash (finance.approve) YO'Q - shuning
  // uchun limitdan oshgan chiqim owner tasdig'ini kutadi.
  const directorPermKeys = [
    PERMISSIONS.ADMIN_DASHBOARD_READ,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.BRANCHES_READ,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_CREATE,
    PERMISSIONS.STUDENTS_UPDATE,
    PERMISSIONS.TEACHERS_READ,
    PERMISSIONS.GROUPS_READ,
    PERMISSIONS.GROUPS_CREATE,
    PERMISSIONS.GROUPS_UPDATE,
    PERMISSIONS.GROUPS_MANAGE_STUDENTS,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_RECORD,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.GRADES_READ,
    PERMISSIONS.RATING_READ,
    PERMISSIONS.LEADS_READ,
    PERMISSIONS.LEADS_MANAGE,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_PAY,
    PERMISSIONS.SALARY_READ,
    PERMISSIONS.SALARY_PAY,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.NOTIFICATIONS_SEND,
    PERMISSIONS.FEEDBACK_READ,
    PERMISSIONS.FEEDBACK_RESPOND,
  ];
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

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Seed xato");
  process.exit(1);
});
