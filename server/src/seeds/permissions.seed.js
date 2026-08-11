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
  // ASOSIY PRINSIP: direktor amalni BOSHLAY oladi, lekin TASDIQLAY olmaydi.
  //
  // Shuning uchun bu ro'yxatda tasdiqlash kalitlari ATAYLAB YO'Q:
  //   finance.approve          - limitdan oshgan chiqimni tasdiqlash
  //   approvals.decide_config  - maosh stavkasi / chegirma / ishga olishni
  //                              tasdiqlash
  // Ular yo'qligi sababli direktorning quyidagi amallari owner tasdig'iga
  // tushadi (202 qaytariladi, hech narsa o'zgarmaydi):
  //   groups.update    -> maosh stavkasi belgilash  (salary_terms)
  //   finance.manage   -> chegirma belgilash        (discount_set)
  //   teachers.create  -> ishga olish               (staff_hire)
  //   + roles.update   - ishga olish route'i talab qiladi (rol biriktirish).
  //     Xavfsiz: roles.service.js dagi assertCanGrantPermissions direktorga
  //     O'ZIDA YO'Q ruxsatni bera olmasligini kafolatlaydi, ya'ni u o'ziga
  //     approvals.decide_config qo'sha olmaydi. Owner esa ["*"] bypass
  //     bilan himoyalangan (permission.helper.js).
  //
  // BU RO'YXATGA finance.approve YOKI approvals.decide_config QO'SHMANG -
  // aks holda direktor o'z so'rovini o'zi tasdiqlay oladigan bo'lib qoladi
  // va butun tasdiq zanjiri ma'nosini yo'qotadi. (tests/directorRole.test.js
  // shu invariantni qulflaydi.)
  const directorPermKeys = [
    PERMISSIONS.ADMIN_DASHBOARD_READ,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.BRANCHES_READ,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_CREATE,
    PERMISSIONS.STUDENTS_UPDATE,
    PERMISSIONS.TEACHERS_READ,
    // Ishga olish so'rovini yubora olishi uchun (owner tasdiqlaydi).
    // Route ikkalasini birga talab qiladi: users.routes.js "/staff".
    PERMISSIONS.TEACHERS_CREATE,
    PERMISSIONS.ROLES_UPDATE,
    PERMISSIONS.GROUPS_READ,
    PERMISSIONS.GROUPS_CREATE,
    PERMISSIONS.GROUPS_UPDATE,
    PERMISSIONS.GROUPS_MANAGE_STUDENTS,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_RECORD,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.GRADES_READ,
    // ASIMMETRIYANI TUZATISH: direktorda ATTENDANCE_RECORD bor edi,
    // GRADES_RECORD esa yo'q - ya'ni davomatni belgilay olardi, lekin
    // baho qo'ya olmasdi. Bu ataylab emas, e'tibordan chetda qolgan:
    // ikkalasi ham bir xil ish (o'qituvchi kelmaganda darsni yopish).
    // GRADES_MANAGE ataylab BERILMAGAN - u boshqalarning bahosini
    // o'chirish/tahrirlash demak.
    PERMISSIONS.GRADES_RECORD,
    PERMISSIONS.RATING_READ,
    PERMISSIONS.LEADS_READ,
    PERMISSIONS.LEADS_MANAGE,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_PAY,
    // Chegirma so'rovini yubora olishi uchun (owner tasdiqlaydi).
    // DIQQAT: bu kalit guruh narxini (PUT /finance/group-fees) ham ochadi -
    // u hozircha tasdiqsiz o'zgaradi.
    PERMISSIONS.FINANCE_MANAGE,
    PERMISSIONS.SALARY_READ,
    PERMISSIONS.SALARY_PAY,
    // Xodimlar maoshini KO'RA oladi. PAYROLL_MANAGE/PAY ataylab
    // berilmagan: KPI qoidasini o'zgartirish va pul chiqarish - egasining
    // qarori.
    PERMISSIONS.PAYROLL_READ,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.NOTIFICATIONS_SEND,
    // Vazifalarni KO'RA oladi (kvota kimning fayllari bilan to'layotganini
    // bilishi kerak), lekin ASSIGNMENTS_SEND ataylab berilmagan: yuborish
    // diskni yeydi va u o'qituvchining ishi.
    PERMISSIONS.ASSIGNMENTS_READ,
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
