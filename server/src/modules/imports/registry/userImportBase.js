import prisma from "../../../config/prisma.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { hasPermission } from "../../../helpers/permission.helper.js";
import { normalizePhone } from "../../../utils/phone.js";
import {
  baseUsername,
  generatePassword,
  nextUsernameCandidate,
} from "../../../utils/credentials.js";
import {
  toUtcMidnight,
  localTodayMidnight,
} from "../../../helpers/attendance.helper.js";
import {
  getActiveBranchId,
  getAllowedBranchIds,
  canSeeAllBranches,
  branchFilter,
  userBranchCondition,
} from "../../../helpers/branchContext.helper.js";
import { OPENING_MAX_AMOUNT } from "../../../constants/openingBalance.js";
import * as openingBalanceService from "../../openingBalance/services/openingBalance.service.js";
import { OPENING_WARN_AMOUNT } from "../../openingBalance/services/openingBalance.service.js";
import { ROW_STATUS } from "../services/importEngine.service.js";
import { asText, asNumber, asDate, isBlank } from "../services/coerce.service.js";

// ─────────────────────────── USTUNLAR ───────────────────────────

const col = (key, header, extra = {}) => ({ key, header, width: 18, ...extra });

export const IDENTITY_COLUMNS = [
  col("firstName", "Ism", {
    width: 16,
    required: true,
    primary: true,
    slot: "name",
    example: "Ali",
    note: "Majburiy.",
  }),
  col("lastName", "Familiya", {
    width: 18,
    required: true,
    primary: true,
    slot: "name",
    example: "Valiyev",
    note: "Majburiy.",
  }),
  col("phone", "Telefon", {
    width: 16,
    primary: true,
    example: "998901234567",
    note:
      "Ixtiyoriy. Takrorlanishi MUMKIN - bitta raqamdan aka-uka yoki " +
      "ona-farzand foydalanishi odatiy hol.",
  }),
  col("username", "Login", {
    width: 20,
    primary: true,
    slot: "sub",
    example: "ali.valiyev",
    note: "Bo'sh qoldiring - tizim ism-familyadan avtomatik yasaydi. Tahrirlash mumkin.",
  }),
  col("password", "Parol", {
    width: 14,
    primary: true,
    example: "kfa2846",
    note: "Bo'sh qoldiring - tizim avtomatik yasaydi. Kamida 6 belgi.",
  }),
  col("birthDate", "Tug'ilgan sana", {
    width: 16,
    example: "2005-04-12",
    note: "Ixtiyoriy. Format: 2005-04-12 yoki 12.04.2005",
  }),
  col("branchName", "Filial", {
    width: 18,
    optionsKey: "branches",
    example: "Asosiy filial",
    note: "Bo'sh qoldirilsa joriy tanlangan filial ishlatiladi.",
  }),
];

export const OPENING_COLUMN = col("openingBalance", "Boshlang'ich summa", {
  width: 22,
  primary: true,
  example: "+300000",
  note:
    "Ixtiyoriy. ISHORA MUHIM va BARCHA rollar uchun BIR XIL: " +
    "(+) markaz shu odamga qarzdor, (-) odam markazga qarzdor. " +
    "Masalan o'quvchi -300000 = u markazga 300 000 qarz; +300000 = avans. " +
    "O'qituvchi/xodim +300000 = markaz unga 300 000 qarzdor (to'lanadi); " +
    "-300000 = u markazga qarz (oylikdan ushlanadi).",
});

export const NOTE_COLUMN = col("note", "Izoh", {
  width: 24,
  note: "Ixtiyoriy. Boshlang'ich qoldiq yozuviga biriktiriladi.",
});

// ─────────────────────────── YORDAMCHILAR ───────────────────────────

const norm = (v) => String(v ?? "").trim().toLowerCase();

const pushErr = (errors, field, message) => errors.push({ field, message });

/** Ommaviy qidiruvlar - har qator uchun DB'ga bormaslik uchun bir marta. */
export const prepareUserContext = async (rawRows, { role, actor = {} }) => {
  const groupNames = [
    ...new Set(rawRows.map((r) => norm(r.groupName)).filter(Boolean)),
  ];
  const branchNames = [
    ...new Set(rawRows.map((r) => norm(r.branchName)).filter(Boolean)),
  ];
  const phones = [
    ...new Set(rawRows.map((r) => normalizePhone(r.phone)).filter(Boolean)),
  ];
  const usernames = [
    ...new Set(rawRows.map((r) => norm(r.username)).filter(Boolean)),
  ];

  const branchCond = userBranchCondition();
  
  const [groups, branches, byPhone, byUsername, roles] = await Promise.all([
    groupNames.length
      ? prisma.group.findMany({
          where: { isDeleted: false, ...branchFilter() },
          select: { id: true, name: true, startDate: true, createdAt: true, branchId: true, isActive: true, endDate: true },
        })
      : [],
    prisma.branch.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, isActive: true },
    }),
    phones.length
      ? prisma.user.findMany({
          where: {
            phone: { in: phones },
            isDeleted: false,
            ...(branchCond ? { AND: [branchCond] } : {}),
          },
          select: { id: true, phone: true, firstName: true, lastName: true, role: true, username: true },
        })
      : [],
    usernames.length
      ? prisma.user.findMany({
          where: { username: { in: usernames } },
          select: { username: true },
        })
      : [],
    role === "staff"
      ? prisma.role.findMany({ select: { value: true, label: true } })
      : [],
  ]);

  const groupByName = new Map();
  for (const g of groups) {
    g._id = g.id; // moslik
    groupByName.set(norm(g.name), g);
  }

  const branchByName = new Map();
  for (const b of branches) {
    b._id = b.id; // moslik
    branchByName.set(norm(b.name), b);
  }

  const usersByPhone = new Map();
  for (const u of byPhone) {
    const list = usersByPhone.get(u.phone) || [];
    list.push(u);
    usersByPhone.set(u.phone, list);
  }

  const nameConditions = rawRows
    .filter((r) => norm(r.firstName) && norm(r.lastName))
    .map((r) => ({
      firstName: { equals: String(r.firstName).trim(), mode: "insensitive" },
      lastName: { equals: String(r.lastName).trim(), mode: "insensitive" },
    }))
    .slice(0, 200);

  const nameFilter = (extra = {}) => {
    const base = { isDeleted: false, ...extra };
    if (!nameConditions.length) return { ...base, id: { in: [] } }; // bo'sh qidiruv bo'lmasligi uchun

    if (branchCond) {
      return { ...base, AND: [{ OR: nameConditions }, branchCond] };
    }
    return { ...base, OR: nameConditions };
  };

  const sameName = nameConditions.length
    ? await prisma.user.findMany({
        where: nameFilter(),
        select: { firstName: true, lastName: true, username: true, phone: true },
      })
    : [];
    
  const usersByName = new Map();
  for (const u of sameName) {
    const k = `${norm(u.firstName)}|${norm(u.lastName)}`;
    usersByName.set(k, (usersByName.get(k) || 0) + 1);
  }

  const roleByValue = new Map();
  for (const r of roles) {
    roleByValue.set(norm(r.value), r);
    if (r.label) roleByValue.set(norm(r.label), r);
  }

  return {
    role,
    groupByName,
    branchByName,
    usersByPhone,
    usersByName,
    roleByValue,
    dbUsernames: new Set(byUsername.map((u) => u.username)),
    canWriteOpening: hasPermission(actor.permissions, PERMISSIONS.FINANCE_MANAGE),
    takenUsernames: new Set(byUsername.map((u) => u.username)),
    activeBranchId: getActiveBranchId(),
    allowedBranchIds: getAllowedBranchIds(),
    canSeeAll: canSeeAllBranches(),
    defaultBranch: branches.find((b) => String(b.id) === String(getActiveBranchId())) || null,
  };
};

export const draftUserRow = (raw, ctx, { role }) => {
  const out = { ...raw };

  if (isBlank(out.username)) {
    const base = baseUsername(out.firstName, out.lastName);
    let candidate = base;
    let i = 2;
    while (ctx.takenUsernames.has(candidate)) {
      candidate = `${base}${i}`;
      i += 1;
    }
    out.username = candidate;
  }
  ctx.takenUsernames.add(norm(out.username));

  if (isBlank(out.password)) out.password = generatePassword();

  if (isBlank(out.branchName) && ctx.defaultBranch) {
    out.branchName = ctx.defaultBranch.name;
  }

  if (!isBlank(out.groupName) && !ctx.groupByName.has(norm(out.groupName))) {
    out.groupName = "";
  }

  if (role === ROLES.STUDENT) {
    const group = ctx.groupByName.get(norm(out.groupName));
    const start = group ? toUtcMidnight(group.startDate || group.createdAt) : null;
    if (isBlank(out.joinedAt) && start) out.joinedAt = isoDay(start);
    if (isBlank(out.enrolledAt)) {
      out.enrolledAt = isoDay(start || localTodayMidnight());
    }
  }

  if (role === ROLES.TEACHER && isBlank(out.hiredAt)) {
    out.hiredAt = isoDay(localTodayMidnight());
  }
  if (role === "staff" && isBlank(out.hiredAt)) {
    out.hiredAt = isoDay(localTodayMidnight());
  }

  return out;
};

const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export const validateUserRow = (raw, ctx, { role }) => {
  const errors = [];
  const data = { role };

  const first = asText(raw.firstName, { max: 60 });
  if (!first.ok || !first.value) pushErr(errors, "firstName", "Ism majburiy");
  else data.firstName = first.value;

  const last = asText(raw.lastName, { max: 60 });
  if (!last.ok || !last.value) pushErr(errors, "lastName", "Familiya majburiy");
  else data.lastName = last.value;

  const username = norm(raw.username);
  if (!username) pushErr(errors, "username", "Login majburiy");
  else if (username.length < 3) pushErr(errors, "username", "Login kamida 3 belgi");
  else if (username.length > 40) pushErr(errors, "username", "Login 40 belgidan oshmasin");
  else if (!/^[a-z0-9._-]+$/.test(username)) {
    pushErr(errors, "username", "Loginda faqat lotin harflari, raqam, nuqta va chiziqcha bo'lsin");
  } else data.username = username;

  const password = String(raw.password ?? "").trim();
  if (!password) pushErr(errors, "password", "Parol majburiy");
  else if (password.length < 6) pushErr(errors, "password", "Parol kamida 6 belgi");
  else data.password = password;

  if (!isBlank(raw.phone)) {
    const phone = normalizePhone(raw.phone);
    if (!phone) pushErr(errors, "phone", "Telefon noto'g'ri (masalan 998901234567)");
    else data.phone = phone;
  }

  if (!isBlank(raw.birthDate)) {
    const bd = asDate(raw.birthDate);
    if (!bd.ok) pushErr(errors, "birthDate", bd.error);
    else data.birthDate = bd.value;
  }

  const branchName = norm(raw.branchName);
  const branch = branchName ? ctx.branchByName.get(branchName) : ctx.defaultBranch;
  if (!branch) {
    pushErr(
      errors,
      "branchName",
      branchName ? `"${raw.branchName}" filiali topilmadi` : "Filial tanlanmagan",
    );
  } else if (!ctx.canSeeAll && !ctx.allowedBranchIds.includes(String(branch._id))) {
    pushErr(errors, "branchName", "Bu filialga odam qo'shishga ruxsatingiz yo'q");
  } else {
    data.branchId = String(branch._id);
    data.branchName = branch.name;
  }

  if (!isBlank(raw.openingBalance)) {
    const signed = String(raw.openingBalance).trim().replace(/^\+\s*/, "");
    const amt = asNumber(signed, { integer: true });
    if (!amt.ok) {
      pushErr(errors, "openingBalance", amt.error);
    } else if (amt.value === 0) {
      data.openingBalance = 0;
    } else if (Math.abs(amt.value) > OPENING_MAX_AMOUNT) {
      pushErr(
        errors,
        "openingBalance",
        `Summa ${OPENING_MAX_AMOUNT.toLocaleString("ru-RU")} so'mdan oshmasin`,
      );
    } else if (!ctx.canWriteOpening) {
      pushErr(
        errors,
        "openingBalance",
        "Boshlang'ich qoldiq yozish uchun moliya huquqi (finance.manage) kerak",
      );
    } else {
      data.openingBalance = amt.value;
      if (Math.abs(amt.value) >= OPENING_WARN_AMOUNT) {
        data.openingWarning = `Summa juda katta (${amt.value.toLocaleString("ru-RU")}) - tekshiring`;
      }
    }
  } else {
    data.openingBalance = 0;
  }

  const note = asText(raw.note, { max: 500 });
  data.note = note.ok ? note.value : "";

  const existing = findExistingUser(data, ctx);
  if (!existing && data.username && ctx.dbUsernames?.has(data.username)) {
    pushErr(
      errors,
      "username",
      "Bu login band. Shu odam allaqachon yaratilgan bo'lishi mumkin - " +
        "telefon raqamini qo'shing yoki boshqa login kiriting",
    );
  }

  if (!existing && data.firstName && data.lastName) {
    const count = ctx.usersByName?.get(
      `${norm(data.firstName)}|${norm(data.lastName)}`,
    );
    if (count) {
      data.duplicateNameWarning = `Shu ism-familyali ${count} ta odam allaqachon bor - tekshiring`;
    }
  }

  return { errors, data };
};

export const findExistingUser = (data, ctx) => {
  if (!data.phone) return null;
  const list = ctx.usersByPhone.get(data.phone) || [];
  return (
    list.find(
      (u) =>
        norm(u.firstName) === norm(data.firstName) &&
        norm(u.lastName) === norm(data.lastName),
    ) || null
  );
};

export const createUserWithUniqueLogin = async (createFn, data) => {
  let username = data.username;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await createFn({ ...data, username });
    } catch (err) {
      const isLoginClash =
        err?.code === "P2002" && err.meta?.target?.includes("username");
      const isLoginMessage = err?.statusCode === 409;
      if (!isLoginClash && !isLoginMessage) throw err;
      username = nextUsernameCandidate(username, attempt);
    }
  }
  throw new Error("Bo'sh login topilmadi - loginni qo'lda o'zgartiring");
};

export const applyOpeningBalance = async (
  { user, role, data, groupId, joinedAt },
  { currentUser, importJobId },
) => {
  if (!data.openingBalance) return null;

  const res = await openingBalanceService.create(
    {
      user: String(user.id || user._id),
      role,
      amount: data.openingBalance,
      group: groupId || null,
      branchId: data.branchId || null,
      joinedAt: joinedAt || null,
      note: data.note || "",
    },
    { currentUser, importJob: importJobId },
  );

  return res;
};

export const previewStudentRow = async (data, ctx) => {
  const warn = [data.duplicateNameWarning, data.openingWarning]
    .filter(Boolean)
    .join(". ");

  if (!data?.groupId) {
    return {
      months: 0,
      billed: 0,
      opening: data?.openingBalance || 0,
      finalBalance: data?.openingBalance || 0,
      note: [warn, "Guruh tanlanmagan - oylik to'lov yaratilmaydi"]
        .filter(Boolean)
        .join(". "),
    };
  }

  const group = ctx.groupById?.get(String(data.groupId));
  const start = data.joinedAt
    ? toUtcMidnight(data.joinedAt)
    : toUtcMidnight(group?.startDate || group?.createdAt);
  if (!start) return { months: 0, billed: 0, opening: data.openingBalance || 0 };

  const today = localTodayMidnight();
  const months =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - start.getUTCMonth()) +
    1;

  const fee = ctx.feeByGroup?.get(String(data.groupId)) || 0;
  const billed = fee * Math.max(0, months);
  const opening = data.openingBalance || 0;

  return {
    months: Math.max(0, months),
    monthlyFee: fee,
    billed,
    opening,
    finalBalance: opening - billed,
    approximate: true,
    note: warn || null,
  };
};

export const loadGroupFees = async (groupIds) => {
  if (!groupIds?.length) return new Map();
  const rows = await prisma.groupFee.findMany({
    // ⚠ `isDeleted` FILTRI OLIB TASHLANDI — `GroupFee` da bunday ustun
    // UMUMAN YO'Q (qarang `schema.prisma`). Mongo davridan qolgan qoldiq
    // edi va Prisma uni "Unknown argument" bilan RAD ETARDI, ya'ni
    // `loadGroupFees` har chaqiruvda YIQILARDI — o'quvchi importining
    // qoralama/ko'rib chiqish yo'li ishlamasdi.
    //
    // Guruh narxi HECH QACHON o'chirilmaydi: u faqat `upsert` bilan
    // yangilanadi (`groupFee.service.js`), shuning uchun soft-delete
    // tushunchasi bu yerda ma'noga ega emas. Qolgan 5 ta o'qish joyi
    // ham bu filtrni ishlatmaydi.
    where: { groupId: { in: groupIds } },
    select: { groupId: true, amount: true, year: true, month: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  
  const map = new Map();
  for (const r of rows) {
    const k = String(r.groupId);
    if (!map.has(k)) map.set(k, r.amount || 0);
  }
  return map;
};

// Vaqtinchalik compatibility (boshqa importerlarda ishlatilgan modellar Prisma versiyasiga o'tmaguncha import qilinmasligi ham mumkin, lekin hozircha remove qilmaymiz, chunki ularga reference bo'lishi mumkin)
const StudentPayment = {}; 
const GroupMembership = {};

export {
  ROW_STATUS,
  norm,
  pushErr,
  isoDay,
  StudentPayment, // bular kerakmas, chunki pastdagi import/exportlar refaktoring qilinadi, shunga stub qoldirdim
  GroupMembership,
  logger,
  OPENING_WARN_AMOUNT,
};
