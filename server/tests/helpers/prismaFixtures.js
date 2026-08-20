/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IZOLYATSIYALANGAN TEST FIXTURE'LARI — PostgreSQL (Prisma) uchun.
 *
 * ── NIMANI ALMASHTIRADI ──
 *
 * Mongo davrida testlar ALOHIDA bazaga ulanib, oxirida `dropDatabase()`
 * qilardi:
 *
 *     await mongoose.connect("mongodb://127.0.0.1:27017/lc_priv_test");
 *     await mongoose.connection.dropDatabase();
 *
 * PostgreSQL'da bu naqsh ISHLAMAYDI: alohida baza uchun migratsiyalarni
 * qayta yurgazish kerak va servis kodi `DATABASE_URL` ga qattiq bog'langan
 * yagona `prisma` nusxasini ishlatadi.
 *
 * ── NEGA TRANZAKSIYA + ROLLBACK EMAS ──
 *
 * `prisma.$transaction(tx => ...)` fixture'ni `tx` ichida yaratadi, lekin
 * SINALAYOTGAN SERVIS global `prisma` ni ishlatadi va `tx` ichidagi
 * yozuvni KO'RMAYDI (u hali kommit bo'lmagan). Ya'ni test hech narsani
 * topa olmasdi. Servislarni `tx` qabul qiladigan qilib o'zgartirish esa
 * MIGRATSIYA PAYTIDA ishlab turgan kodni qayta yozish demak — bu testni
 * tuzatish uchun juda katta va xavfli o'zgarish.
 *
 * ── SHUNING UCHUN: PREFIKS + REYESTR + KAFOLATLI TOZALASH ──
 *
 * Bu `tests/usersPrisma.test.js` va `authPrisma.test.js` da allaqachon
 * ishlayotgan naqsh — ular ko'chirishdan omon chiqqan va ishlaydi.
 * Shu yerda umumlashtirildi:
 *
 *   • har yurishda YAGONA belgi (`suffix`) — parallel yurishlar
 *     to'qnashmaydi va qoldiq qaysi yurishdan ekani ko'rinadi;
 *   • yaratilgan HAR BIR qator reyestrga tushadi;
 *   • `cleanup()` ularni TASHQI KALIT TARTIBIDA o'chiradi;
 *   • `assertClean()` tozalash HAQIQATAN tugaganini tekshiradi — aks
 *     holda "tozaladim" degan yolg'on xotirjamlik qolardi.
 *
 * ⚠ MOLIYAVIY MA'LUMOT DOIMIY QOLDIRILMAYDI. Jurnal yozuvlari
 * O'ZGARMAS (`JOURNAL_IMMUTABLE`) — ular umuman yaratilmasligi kerak;
 * to'lov/maosh qatorlari esa reyestr orqali o'chiriladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import prisma from "../../src/config/prisma.js";

/** Har yurish uchun yagona belgi: `t<base36 vaqt><tasodif>`. */
export const newSuffix = () =>
  `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * O'CHIRISH TARTIBI — TASHQI KALITLARGA QARAB.
 *
 * ⚠ TARTIBNI O'ZGARTIRMANG. Ota qator boladan oldin o'chirilsa Postgres
 * `RESTRICT` bilan rad etadi va tozalash YARIM QOLADI — keyingi yurish
 * esa "allaqachon mavjud" xatolariga urilardi.
 *
 * Ro'yxat "eng bola" dan "eng ota" ga qarab boradi.
 */
const DELETE_ORDER = [
  // ── davomat / baho / dars ──
  "attendance", "grade", "lessonCancellation", "attendanceExemption",
  "teacherAttendance", "teacherAbsence",
  // ── vazifa / bildirishnoma / fayl ──
  "assignmentRecipient", "assignment", "notificationRecipient", "notification",
  "systemNotification", "storedFile",
  // ── moliya: bola qatorlar ──
  "paymentTransaction", "debtWriteOffBreakdown", "debtWriteOff",
  "discount", "studentPayment", "groupFee",
  "depositTransaction", "studentDeposit",
  "refund", "budgetLine", "budget",
  "recurringExpenseOccurrence", "recurringExpense", "expense",
  // ── maosh ──
  "salaryTransaction", "teacherSalary", "teacherGroupPeriod", "teacherCompensation",
  "staffPayrollAdjustment", "staffPayrollItem", "staffPayroll",
  "staffSalaryTransaction", "staffKpiAssignment", "kpiRule", "staffCompensation",
  "payrollAuditLog",
  // ── kassa / jurnal ──
  "cashTransfer", "shift", "openingBalance",
  // ── a'zolik va guruh ──
  "groupMembership", "groupScheduleItem", "group",
  // ── lid / tasdiq / audit ──
  "leadRoutingRule", "lead", "leadOption", "approval",
  "archiveLog", "activityLog", "financialAuditLog",
  // ── katalog ──
  "coursePrice", "course", "room", "holiday", "expenseCategory",
  "feedback", "feedbackType", "archiveReason", "importJob",
  // ── AI ──
  "insight", "aiRanking", "aiReport", "aiRun", "aiUsageLog",
  // ── foydalanuvchi va filial (eng oxirida) ──
  "botUser", "refreshToken", "userBranchAssignment", "user",
  "account", "branch", "role",
];

/**
 * Fixture reyestri.
 *
 * `track(model, id)` bilan qo'lda ham qo'shish mumkin — masalan servis
 * O'ZI yaratgan yon qatorni (to'lov, maosh) ro'yxatga olish uchun.
 */
export const createFixtures = () => {
  /** @type {Map<string, Set<string>>} model → id'lar */
  const registry = new Map();

  const track = (model, id) => {
    if (!id) return id;
    if (!registry.has(model)) registry.set(model, new Set());
    registry.get(model).add(String(id));
    return id;
  };

  const suffix = newSuffix();

  // ── Yaratuvchilar ──
  // Hammasi `track` qiladi va Prisma qatorini qaytaradi.

  const branch = async (name, data = {}) =>
    prisma.branch
      .create({ data: { name: `${name}-${suffix}`, ...data } })
      .then((r) => (track("branch", r.id), r));

  const user = async (username, data = {}) =>
    prisma.user
      .create({
        data: {
          firstName: data.firstName ?? "T",
          lastName: data.lastName ?? username,
          username: `${username}-${suffix}`,
          // ⚠ OCHIQ MATN — tizim parollarni shunday saqlaydi
          // (`helpers/password.helper.js`). Bu test soddalashtirishi EMAS.
          passwordHash: data.passwordHash ?? "Sinov12345!",
          role: data.role ?? "student",
          isActive: data.isActive ?? true,
          ...data,
        },
      })
      .then((r) => (track("user", r.id), r));

  /** Foydalanuvchini QO'SHIMCHA filialga biriktiradi. */
  const assignment = async (userId, branchId, role = null) =>
    prisma.userBranchAssignment
      .create({ data: { userId, branchId, role } })
      .then((r) => (track("userBranchAssignment", r.id), r));

  const group = async (name, branchId, data = {}) =>
    prisma.group
      .create({ data: { name: `${name}-${suffix}`, branchId, ...data } })
      .then((r) => (track("group", r.id), r));

  const membership = async (groupId, studentId, data = {}) =>
    prisma.groupMembership
      .create({ data: { groupId, studentId, ...data } })
      .then((r) => (track("groupMembership", r.id), r));

  const groupFee = async (groupId, year, month, amount) =>
    prisma.groupFee
      .create({ data: { groupId, year, month, amount } })
      .then((r) => (track("groupFee", r.id), r));

  const course = async (title, data = {}) =>
    prisma.course
      .create({ data: { title: `${title}-${suffix}`, code: `${title}-${suffix}`.slice(0, 40), ...data } })
      .then((r) => (track("course", r.id), r));

  const room = async (name, branchId, data = {}) =>
    prisma.room
      .create({ data: { name: `${name}-${suffix}`, branchId, ...data } })
      .then((r) => (track("room", r.id), r));

  /**
   * Rol — ruxsat kalitlari bo'yicha.
   *
   * ⚠ Ruxsatlar BAZADAGI katalogdan ulanadi (`connect`), yangi
   * `Permission` YARATILMAYDI: katalog seed bilan boshqariladi va unga
   * test qatori qo'shilsa, u DOIMIY qolib ketardi.
   */
  const role = async (value, permissionKeys = [], data = {}) => {
    const perms = permissionKeys.length
      ? await prisma.permission.findMany({
          where: { key: { in: permissionKeys } },
          select: { id: true, key: true },
        })
      : [];
    const missing = permissionKeys.filter((k) => !perms.some((p) => p.key === k));
    if (missing.length) {
      throw new Error(
        `Ruxsat katalogida yo'q kalit(lar): ${missing.join(", ")}. ` +
          `Avval \`npm run seed:permissions\` ni yurgazing.`,
      );
    }
    const r = await prisma.role.create({
      data: {
        value: `${value}-${suffix}`,
        label: `${value}-${suffix}`,
        roleType: data.roleType ?? "staff",
        defaultPath: data.defaultPath ?? "/owner",
        isSystem: false,
        permissions: { connect: perms.map((p) => ({ id: p.id })) },
        ...data,
      },
    });
    return track("role", r.id), r;
  };

  /**
   * TOZALASH — tashqi kalit tartibida.
   *
   * Xato bo'lsa YUTILMAYDI: qaysi model qolganini bilish shart, aks
   * holda qoldiq keyingi yurishni buzardi.
   */
  const cleanup = async () => {
    const problems = [];
    for (const model of DELETE_ORDER) {
      const ids = registry.get(model);
      if (!ids || ids.size === 0) continue;
      try {
        await prisma[model].deleteMany({ where: { id: { in: [...ids] } } });
      } catch (err) {
        problems.push(`${model}: ${err.message.split("\n")[0]}`);
      }
    }
    // Reyestrda bo'lgan, lekin `DELETE_ORDER` da yo'q model — dasturchi
    // xatosi. JIMGINA o'tkazib yuborilsa qator bazada qolib ketardi.
    for (const model of registry.keys()) {
      if (!DELETE_ORDER.includes(model)) {
        problems.push(`${model}: DELETE_ORDER ro'yxatida yo'q`);
      }
    }
    return problems;
  };

  /**
   * Tozalash HAQIQATAN tugaganini tekshiradi.
   * Qolgan qatorlar ro'yxatini qaytaradi (bo'sh = toza).
   */
  const assertClean = async () => {
    const leftovers = [];
    for (const [model, ids] of registry.entries()) {
      if (!prisma[model]?.findMany) continue;
      const rows = await prisma[model]
        .findMany({ where: { id: { in: [...ids] } }, select: { id: true } })
        .catch(() => []);
      if (rows.length) leftovers.push(`${model}×${rows.length}`);
    }
    return leftovers;
  };

  return {
    suffix,
    track,
    branch,
    user,
    assignment,
    group,
    membership,
    groupFee,
    course,
    room,
    role,
    cleanup,
    assertClean,
    registry,
  };
};

/**
 * Test yakunida chaqiriladigan standart blok.
 *
 * Tozalash MUAMMOLARINI natijaga QO'SHADI: qoldiq qolgan yurish
 * "o'tdi" deb hisoblanmasligi kerak.
 */
export const finishFixtures = async (fx, { ok, bad }) => {
  const problems = await fx.cleanup();
  const leftovers = await fx.assertClean();
  if (problems.length) bad("fixture tozalash", problems.join(" · "));
  else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
  else ok(`fixture tozalandi (${fx.suffix})`);
};
