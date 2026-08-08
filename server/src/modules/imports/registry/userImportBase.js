import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import Branch from "../../../models/branch.model.js";
import Role from "../../../models/role.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
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
import { OPENING_MAX_AMOUNT } from "../../../models/openingBalance.model.js";
import * as openingBalanceService from "../../openingBalance/services/openingBalance.service.js";
import { OPENING_WARN_AMOUNT } from "../../openingBalance/services/openingBalance.service.js";
import { ROW_STATUS } from "../services/importEngine.service.js";
import { asText, asNumber, asDate, isBlank } from "../services/coerce.service.js";

/**
 * ODAM IMPORTI UCHUN UMUMIY POYDEVOR (o'quvchi / o'qituvchi / xodim).
 *
 * Uchala importer bir xil ishni qiladi:
 *   1) foydalanuvchi yaratadi (login/parol avtomatik taklif qilinadi),
 *   2) (o'quvchida) guruhga qo'shadi - bu A'ZOLIK SANASIDAN BUGUNGACHA
 *      har oy uchun to'lov qatorini quradi,
 *   3) boshlang'ich qoldiqni materializatsiya qiladi.
 *
 * ─── TARTIB O'ZGARMASLIGI SHART ───
 * Guruhga qo'shish boshlang'ich qoldiqdan OLDIN bo'lishi kerak. Sababi
 * o'quvchining "+" qoldig'i depozitga tushib, avtomatik ravishda MAVJUD
 * qarzlarni eng eskisidan yopadi. Guruh keyin qo'shilsa, qarzlar
 * qoldiqdan KEYIN paydo bo'lardi va 300 000 depozitda yotib qolardi -
 * ya'ni "shu paytgacha bo'lgan to'lovlarni yopishi kerak" talabi
 * bajarilmasdi.
 */

// ─────────────────────────── USTUNLAR ───────────────────────────

const col = (key, header, extra = {}) => ({ key, header, width: 18, ...extra });

export const IDENTITY_COLUMNS = [
  col("firstName", "Ism", {
    width: 16,
    required: true,
    example: "Ali",
    note: "Majburiy.",
  }),
  col("lastName", "Familiya", {
    width: 18,
    required: true,
    example: "Valiyev",
    note: "Majburiy.",
  }),
  col("phone", "Telefon", {
    width: 16,
    example: "998901234567",
    note:
      "Ixtiyoriy. Takrorlanishi MUMKIN - bitta raqamdan aka-uka yoki " +
      "ona-farzand foydalanishi odatiy hol.",
  }),
  col("username", "Login", {
    width: 20,
    example: "ali.valiyev",
    note: "Bo'sh qoldiring - tizim ism-familyadan avtomatik yasaydi. Tahrirlash mumkin.",
  }),
  col("password", "Parol", {
    width: 14,
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
    example: "Asosiy filial",
    note: "Bo'sh qoldirilsa joriy tanlangan filial ishlatiladi.",
  }),
];

export const OPENING_COLUMN = col("openingBalance", "Boshlang'ich summa", {
  width: 22,
  example: "+300000",
  note:
    "Ixtiyoriy. ISHORA MUHIM: (+) ortiqcha to'langan (avans), " +
    "(-) kam to'langan (qarz). O'quvchi +300000 = bizga 300 000 ortiqcha " +
    "bergan; -300000 = bizga 300 000 qarz. O'qituvchi/xodim +300000 = biz " +
    "unga ortiqcha berganmiz (u bizga qarz); -300000 = biz unga qarzmiz.",
});

export const NOTE_COLUMN = col("note", "Izoh", {
  width: 24,
  note: "Ixtiyoriy. Boshlang'ich qoldiq yozuviga biriktiriladi.",
});

// ─────────────────────────── YORDAMCHILAR ───────────────────────────

const norm = (v) => String(v ?? "").trim().toLowerCase();

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

  const [groups, branches, byPhone, byUsername, roles] = await Promise.all([
    // FILIAL FILTRI MAJBURIY.
    //
    // Usiz A filiali direktori faylga B filialidagi guruh nomini yozib,
    // o'z o'quvchisini o'sha guruhga (va uning moliyasiga) ulab
    // yuborardi. Xato keyinroq addStudent -> ensureGroup da chiqardi,
    // lekin o'shanda foydalanuvchi ALLAQACHON yaratilgan bo'lardi.
    // Bu yerda guruh umuman "topilmagan" bo'ladi.
    groupNames.length
      ? Group.find(
          { isDeleted: { $ne: true }, ...branchFilter() },
          { name: 1, startDate: 1, createdAt: 1, branchId: 1, isActive: 1, endDate: 1 },
        ).lean()
      : [],
    Branch.find({ isDeleted: false }, { name: 1, isActive: 1 }).lean(),
    // FILIAL FILTRI: telefon bo'yicha topilgan odam ham o'z ko'lamimizda
    // bo'lishi shart. Usiz A filiali direktori B filialidagi odamni
    // "mavjud" deb topib, uni o'z guruhiga qo'shib yuborardi.
    phones.length
      ? User.find(
          {
            phone: { $in: phones },
            isDeleted: { $ne: true },
            ...(userBranchCondition() || {}),
          },
          { phone: 1, firstName: 1, lastName: 1, role: 1, username: 1 },
        ).lean()
      : [],
    // BAND LOGINLAR: fayldagi loginlar + shu odamlarning mavjudlari.
    // To'liq ro'yxatni yuklamaymiz (10 000 foydalanuvchida ma'nosiz) -
    // yakuniy tekshiruv baribir yozish paytida E11000 bilan bo'ladi.
    usernames.length
      ? User.find({ username: { $in: usernames } }, { username: 1 }).lean()
      : [],
    role === "staff" ? Role.find({}, { value: 1, label: 1 }).lean() : [],
  ]);

  const groupByName = new Map();
  for (const g of groups) groupByName.set(norm(g.name), g);

  const branchByName = new Map();
  for (const b of branches) branchByName.set(norm(b.name), b);

  const usersByPhone = new Map();
  for (const u of byPhone) {
    const list = usersByPhone.get(u.phone) || [];
    list.push(u);
    usersByPhone.set(u.phone, list);
  }

  // ISM-FAMILYA bo'yicha mavjudlar - TAKROR ODAM ogohlantirishi uchun.
  //
  // NEGA OGOHLANTIRISH, XATO EMAS: bir markazda ikkita "Ali Valiyev"
  // bo'lishi mumkin. Lekin ular ko'pincha AYNI odam bo'ladi va fayl
  // ikkinchi marta yuklanayotgan bo'ladi. Ikkinchi nusxa yaratilsa u
  // guruhga qo'shiladi va O'TGAN OYLAR QARZI qaytadan yoziladi - ya'ni
  // hisobotda YO'Q QARZ paydo bo'ladi. Shuning uchun jimgina o'tkazib
  // yubormaymiz, lekin qarorni odamga qoldiramiz.
  // $or SHARTLARI OLDIN QURILADI, keyin uzunligi tekshiriladi.
  //
  // Faqat "nom bo'sh emasmi" bilan tekshirilsa, ism bor lekin familya
  // bo'sh qatorlarda $or BO'SH MASSIV bo'lib qolardi - MongoDB uni
  // xato deb rad etadi va butun import "prepare" bosqichida yiqilardi.
  const nameConditions = rawRows
    .filter((r) => norm(r.firstName) && norm(r.lastName))
    .map((r) => ({
      firstName: new RegExp(`^${escapeRe(String(r.firstName).trim())}$`, "i"),
      lastName: new RegExp(`^${escapeRe(String(r.lastName).trim())}$`, "i"),
    }))
    .slice(0, 200);

  // DIQQAT: userBranchCondition() ning O'ZI ham `$or` qaytaradi. Uni
  // shu obyektga yoysak ikkita `$or` ustma-ust tushib, biri jimgina
  // yo'qolardi - ya'ni yo filial filtri, yo ism filtri ishlamay
  // qolardi. Shuning uchun ikkalasi `$and` ichida turadi.
  const nameFilter = (extra) => {
    const branchCond = userBranchCondition();
    const base = { isDeleted: { $ne: true }, ...extra };
    return branchCond
      ? { ...base, $and: [{ $or: nameConditions }, branchCond] }
      : { ...base, $or: nameConditions };
  };

  const sameName = nameConditions.length
    ? await User.find(nameFilter(), {
        firstName: 1,
        lastName: 1,
        username: 1,
        phone: 1,
      }).lean()
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
    // Bazada BAND loginlar (fayldagi loginlar bo'yicha tekshirilgan).
    // validateRow shu to'plamga qarab "login band" xatosini beradi.
    dbUsernames: new Set(byUsername.map((u) => u.username)),
    // BOSHLANG'ICH QOLDIQ = PUL YOZISH. Odam qo'shish huquqi (masalan
    // resepshinda bor "students.create") buning uchun YETARLI EMAS:
    // aks holda o'quvchi qo'sha oladigan xodim import orqali istalgan
    // summani qarz yoki avans qilib yozib yuborardi. Ruxsat qator
    // darajasida tekshiriladi - qoldiqsiz qatorlar bemalol o'tadi.
    canWriteOpening: hasPermission(actor.permissions, PERMISSIONS.FINANCE_MANAGE),
    // Draft bosqichida login taklif qilishda o'sib boradi (fayl ichidagi
    // to'qnashuvlar uchun) - shuning uchun Set, massiv emas.
    takenUsernames: new Set(byUsername.map((u) => u.username)),
    activeBranchId: getActiveBranchId(),
    allowedBranchIds: getAllowedBranchIds(),
    canSeeAll: canSeeAllBranches(),
    defaultBranch: branches.find((b) => String(b._id) === String(getActiveBranchId())) || null,
  };
};

/**
 * AVTOTO'LDIRISH. Faqat BO'SH maydonlar to'ldiriladi - foydalanuvchi
 * fayldagi qiymatni yozgan bo'lsa unga tegilmaydi.
 */
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
  // Taklif qilingan yoki fayldan kelgan - ikkalasi ham "band" hisoblanadi,
  // aks holda keyingi qator xuddi shu loginni olardi.
  ctx.takenUsernames.add(norm(out.username));

  if (isBlank(out.password)) out.password = generatePassword();

  if (isBlank(out.branchName) && ctx.defaultBranch) {
    out.branchName = ctx.defaultBranch.name;
  }

  // Guruh berilgan bo'lsa - a'zolik sanasi guruh boshlanishidan.
  // BU ENG MUHIM AVTOTO'LDIRISH: necha oylik qarz yaratilishini aynan
  // shu sana belgilaydi (qarang groups.service.js ->
  // ensureFinanceForMembershipRange). Shuning uchun jadvalda ko'rinadi
  // va tahrirlanadi.
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

/**
 * UMUMIY MAYDONLARNI TEKSHIRADI (ism, login, parol, telefon, filial,
 * boshlang'ich summa). Rolga xos qism chaqiruvchi importer'da.
 */
export const validateUserRow = (raw, ctx, { role }) => {
  const errors = [];
  const data = { role };

  const first = asText(raw.firstName, { max: 60 });
  if (!first.ok || !first.value) pushErr(errors, "firstName", "Ism majburiy");
  else data.firstName = first.value;

  const last = asText(raw.lastName, { max: 60 });
  if (!last.ok || !last.value) pushErr(errors, "lastName", "Familiya majburiy");
  else data.lastName = last.value;

  // ── Login ──
  const username = norm(raw.username);
  if (!username) pushErr(errors, "username", "Login majburiy");
  else if (username.length < 3) pushErr(errors, "username", "Login kamida 3 belgi");
  else if (username.length > 40) pushErr(errors, "username", "Login 40 belgidan oshmasin");
  else if (!/^[a-z0-9._-]+$/.test(username)) {
    pushErr(errors, "username", "Loginda faqat lotin harflari, raqam, nuqta va chiziqcha bo'lsin");
  } else data.username = username;

  // ── Parol ──
  const password = String(raw.password ?? "").trim();
  if (!password) pushErr(errors, "password", "Parol majburiy");
  else if (password.length < 6) pushErr(errors, "password", "Parol kamida 6 belgi");
  else data.password = password;

  // ── Telefon (ixtiyoriy, lekin yozilgan bo'lsa to'g'ri bo'lsin) ──
  if (!isBlank(raw.phone)) {
    const phone = normalizePhone(raw.phone);
    if (!phone) pushErr(errors, "phone", "Telefon noto'g'ri (masalan 998901234567)");
    else data.phone = phone;
  }

  // ── Tug'ilgan sana ──
  if (!isBlank(raw.birthDate)) {
    const bd = asDate(raw.birthDate);
    if (!bd.ok) pushErr(errors, "birthDate", bd.error);
    else data.birthDate = bd.value;
  }

  // ── Filial ──
  const branchName = norm(raw.branchName);
  const branch = branchName ? ctx.branchByName.get(branchName) : ctx.defaultBranch;
  if (!branch) {
    pushErr(
      errors,
      "branchName",
      branchName ? `"${raw.branchName}" filiali topilmadi` : "Filial tanlanmagan",
    );
  } else if (!ctx.canSeeAll && !ctx.allowedBranchIds.includes(String(branch._id))) {
    // IMTIYOZ OSHIRISHDAN HIMOYA: bir filial direktori import orqali
    // boshqa filialga odam qo'shib, keyin uning ochiq matndagi parolini
    // o'qib olardi. Bu tekshiruv servis qatlamidagini TAKRORLAYDI -
    // ataylab: bu yerda xato QATOR bo'yicha ko'rinadi, u yerda esa
    // butun importni to'xtatardi.
    pushErr(errors, "branchName", "Bu filialga odam qo'shishga ruxsatingiz yo'q");
  } else {
    data.branchId = String(branch._id);
    data.branchName = branch.name;
  }

  // ── BOSHLANG'ICH SUMMA (ishorali) ──
  if (!isBlank(raw.openingBalance)) {
    // OLDINGI "+" OLIB TASHLANADI.
    //
    // Shablon ham, UI ham "+300000" yozishni ochiq tavsiya qiladi -
    // ishora bu ustunning butun ma'nosi. Umumiy asNumber() esa "+" ni
    // qabul qilmaydi (u pul uchun yozilgan, u yerda ishora yo'q).
    // Tuzatishni shu yerda qilamiz: asNumber'ni o'zgartirish boshqa
    // importerlarda manfiy/ishorali summani jimgina ochib yuborardi.
    const signed = String(raw.openingBalance).trim().replace(/^\+\s*/, "");
    const amt = asNumber(signed, { integer: true });
    if (!amt.ok) {
      pushErr(errors, "openingBalance", amt.error);
    } else if (amt.value === 0) {
      // Nol - "qoldiq yo'q" degani. Xato emas, shunchaki e'tiborsiz.
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
      // OGOHLANTIRISH (xato emas): nol xatosidan himoya. 300 000 o'rniga
      // 300 000 000 yozilsa qator qizil bo'lmaydi, lekin jadvalda sariq
      // belgi chiqadi va odam tasdiqlashdan oldin ko'radi. Bu yozuvni
      // KEYIN o'zgartirib bo'lmaydi, shuning uchun oldini olish yagona yo'l.
      if (Math.abs(amt.value) >= OPENING_WARN_AMOUNT) {
        data.openingWarning = `Summa juda katta (${amt.value.toLocaleString("ru-RU")}) - tekshiring`;
      }
    }
  } else {
    data.openingBalance = 0;
  }

  const note = asText(raw.note, { max: 500 });
  data.note = note.ok ? note.value : "";

  // ─── TAKRORIY YARATISHDAN HIMOYA (eng muhim tekshiruv) ───
  //
  // Ssenariy: fayl yuborildi, brauzer javobni kutmay uzildi,
  // foydalanuvchi "Yaratish"ni QAYTA bosdi. Ikkinchi urinishda:
  //   • telefon bo'lsa - odam topiladi va guruhga qo'shiladi (yaxshi),
  //   • telefonsiz odam esa YANGIDAN yaratilardi. Login band bo'lgani
  //     uchun unga "ali.valiyev2" berilib, IKKINCHI NUSXA paydo
  //     bo'lardi. U ham guruhga qo'shilib, o'tgan oylar qarzi
  //     QAYTADAN yozilardi - hisobotda yo'q qarz.
  //
  // Shuning uchun: mavjud odam topilmagan, LEKIN login band bo'lsa -
  // qator to'xtatiladi. Login avtomatik almashtirilmaydi, chunki bu
  // aynan dublikat yaratish yo'li edi.
  const existing = findExistingUser(data, ctx);
  if (!existing && data.username && ctx.dbUsernames?.has(data.username)) {
    pushErr(
      errors,
      "username",
      "Bu login band. Shu odam allaqachon yaratilgan bo'lishi mumkin - " +
        "telefon raqamini qo'shing yoki boshqa login kiriting",
    );
  }

  // Ayni ism-familyali odam bor - OGOHLANTIRISH (xato emas).
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

/**
 * MAVJUD ODAMNI ANIQLASH (telefon bo'yicha).
 *
 * Takror telefon XATO EMAS - bu tizimda ataylab ruxsat etilgan
 * (qarang: user.model.js). Lekin AYNI ism-familya + ayni telefon
 * juftligi deyarli har doim "bu o'sha odam" degani. Shu holatda yangi
 * foydalanuvchi yaratilmaydi: mavjudi guruhga qo'shiladi.
 */
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

/**
 * LOGIN TO'QNASHUVIGA CHIDAMLI YARATISH.
 *
 * `taken` to'plami va check-availability YAKUNIY kafolat emas: draft
 * bilan "Yaratish" orasida boshqa odam o'sha loginni olgan bo'lishi
 * mumkin. Yagona ishonchli to'siq - unique indeks. E11000 kelsa
 * keyingi variant bilan qayta urinamiz.
 *
 * DIQQAT: faqat LOGIN to'qnashuvida qayta urinadi. Boshqa har qanday
 * xato darhol yuqoriga uzatiladi - "qayta urinish" pulga tegadigan
 * amallarda xavfli, chunki birinchi urinish yarim bajarilgan bo'lishi
 * mumkin.
 */
export const createUserWithUniqueLogin = async (createFn, data) => {
  let username = data.username;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await createFn({ ...data, username });
    } catch (err) {
      const isLoginClash =
        err?.code === 11000 && String(err?.message || "").includes("username");
      const isLoginMessage = err?.statusCode === 409;
      if (!isLoginClash && !isLoginMessage) throw err;
      username = nextUsernameCandidate(username, attempt);
    }
  }
  throw new Error("Bo'sh login topilmadi - loginni qo'lda o'zgartiring");
};

/**
 * BOSHLANG'ICH QOLDIQNI YOZADI (ixtiyoriy qadam).
 *
 * Xato bo'lsa foydalanuvchi YARATILGAN holida qoladi va qator "failed"
 * bo'ladi. Bu ataylab: odam allaqachon bazada, uni o'chirib tashlash
 * (rollback) guruh a'zoligi va yaratilgan to'lov qatorlarini ham
 * o'chirishni talab qilardi - ya'ni bitta xato ko'proq zarar keltirardi.
 * Qoldiqni keyin qo'lda kiritish mumkin, odamni qayta yaratish esa yo'q.
 */
export const applyOpeningBalance = async (
  { user, role, data, groupId, joinedAt },
  { currentUser, importJobId },
) => {
  if (!data.openingBalance) return null;

  const res = await openingBalanceService.create(
    {
      user: user._id,
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

/**
 * HISOBLANGAN USTUNLAR - foydalanuvchi "Yaratish"ni bosishdan OLDIN
 * natijani ko'radi.
 *
 * Nega kerak: a'zolik sanasi bir oy orqaga surilsa yana bir oylik qarz
 * paydo bo'ladi. Buni faqat yaratgandan KEYIN ko'rish mumkin bo'lsa,
 * xatoni tuzatish uchun o'nlab qatorni qo'lda tozalash kerak bo'lardi.
 */
export const previewStudentRow = async (data, ctx) => {
  // Ogohlantirishlar (xato emas, lekin ko'rinishi shart).
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

  // Oylik narx - guruh tarifi. Aniq summa proratsiya bilan hisoblanadi
  // (birinchi oy to'liq bo'lmasligi mumkin), shuning uchun bu TAXMIN.
  const fee = ctx.feeByGroup?.get(String(data.groupId)) || 0;
  const billed = fee * Math.max(0, months);
  const opening = data.openingBalance || 0;

  return {
    months: Math.max(0, months),
    monthlyFee: fee,
    billed,
    opening,
    // Yakuniy balans: musbat = avans qoladi, manfiy = qarz.
    finalBalance: opening - billed,
    approximate: true,
    note: warn || null,
  };
};

/** Guruh tarifini (oxirgi amaldagi) ommaviy yuklaydi - preview uchun. */
export const loadGroupFees = async (groupIds) => {
  if (!groupIds?.length) return new Map();
  const { default: GroupFee } = await import("../../../models/groupFee.model.js");
  const rows = await GroupFee.find(
    { group: { $in: groupIds }, isDeleted: { $ne: true } },
    { group: 1, amount: 1, year: 1, month: 1 },
  )
    .sort({ year: -1, month: -1 })
    .lean();
  const map = new Map();
  for (const r of rows) {
    const k = String(r.group);
    if (!map.has(k)) map.set(k, r.amount || 0);
  }
  return map;
};

export {
  ROW_STATUS,
  norm,
  pushErr,
  isoDay,
  StudentPayment,
  GroupMembership,
  logger,
  OPENING_WARN_AMOUNT,
};
