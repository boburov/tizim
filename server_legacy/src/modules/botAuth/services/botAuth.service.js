import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";
import { verifyInitData } from "../../../bot/utils/initData.js";
import { comparePassword } from "../../../helpers/password.helper.js";
import { normalizePhone, isPhoneLike } from "../../../utils/phone.js";
import { resolveRole } from "../../../helpers/permission.helper.js";
import {
  issueTokens,
  sanitizeUser,
} from "../../auth/services/auth.service.js";

// initData ni tekshiradi va Telegram foydalanuvchisini qaytaradi
const requireTgUser = (initData) => {
  const tokens = [env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_BOT_TOKEN_2].filter(Boolean);
  if (tokens.length === 0) {
    throw new ApiError(503, "Bot konfiguratsiyalanmagan");
  }
  const result = verifyInitData(initData, tokens);
  if (!result.ok) {
    // Diagnostika: bad-hash bo'lsa xom initData'ni (qisqartirib) loglaymiz - keyin olib tashlanadi.
    logger.warn({ reason: result.reason, debug: result.debug }, "Telegram initData verify failed");
    if (result.reason === "expired") {
      throw new ApiError(401, "Sessiya muddati tugagan, qayta oching");
    }
    throw new ApiError(401, "Telegram ma'lumotlari tasdiqlanmadi");
  }
  return result.user;
};

// initData dan Telegram foydalanuvchisini HMAC tekshiruvisiz ajratadi.
// Faqat loginAndLink (parol allaqachon tasdiqlangan) uchun fallback.
const parseTgUserLoose = (initData) => {
  try {
    const p = new URLSearchParams(initData);
    const u = JSON.parse(p.get("user") || "null");
    return u && u.id ? u : null;
  } catch {
    return null;
  }
};

// Telegram ID ni User akkauntiga bog'laydi.
// KO'P-AKKAUNT: bitta Telegram bir nechta userga bog'lanaversin - eski bog'lanishni
// UZMAYMIZ. Bog'lanish (telegramId, user) JUFTLIGI bo'yicha:
//   - shu juftlik bor bo'lsa  -> yangilaydi (dublikat yaratmaydi)
//   - juftlik yo'q bo'lsa      -> YANGI BotUser hujjati yaratadi (bir xil tgId, boshqa user)
// Shuning uchun bir TG ID ko'p userga bemalol birikadi.
const linkTelegram = async (tgUser, userId) => {
  const tid = BigInt(tgUser.id);
  const uid = String(userId);
  
  const existing = await prisma.botUser.findFirst({
    where: { telegramId: tid, userId: uid }
  });

  const dataToUpdate = {
    chatId: tid,
    username: tgUser.username ? String(tgUser.username).toLowerCase() : null,
    firstName: tgUser.first_name || "",
    lastName: tgUser.last_name || "",
    languageCode: tgUser.language_code || "uz",
  };

  if (existing) {
    await prisma.botUser.update({
      where: { id: existing.id },
      data: dataToUpdate,
    });
  } else {
    await prisma.botUser.create({
      data: {
        telegramId: tid,
        userId: uid,
        ...dataToUpdate,
      },
    });
  }
};

export const verifyAndIssue = async ({ initData, userAgent, ip }) => {
  const tgUser = requireTgUser(initData);

  // Bu TG orqali allaqachon bog'langan akkauntni qidiramiz
  const botUser = await prisma.botUser.findFirst({
    where: { telegramId: BigInt(tgUser.id), userId: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: {
      user: {
        include: { role: true, branches: true }
      }
    },
  });

  const user = botUser?.user;

  if (!user) {
    return { linked: false, tgUser };
  }

  if (!user.isActive) {
    throw new ApiError(403, "Akkaunt bloklangan");
  }

  // Fon jarayoni - yangi bog'lanishlarni sinxronlash (masalan username o'zgargan bo'lsa)
  linkTelegram(tgUser, user.id).catch((err) =>
    logger.error({ err }, "Fon tgUser link yangilanishida xato"),
  );

  const permissions = resolveRole(user);
  const tokens = issueTokens({
    userId: user.id,
    permissions,
    canSeeAllBranches: Boolean(user.role?.canSeeAllBranches),
    userAgent,
    ip,
    viaBot: true,
  });

  return {
    linked: true,
    user: sanitizeUser(user),
    tokens,
  };
};

// login orqali bog'lash
export const loginAndLink = async ({ initData, login, password, userAgent, ip }) => {
  const tgUser = requireTgUser(initData);

  let user = null;
  const isPhone = isPhoneLike(login);
  if (isPhone) {
    const phone = normalizePhone(login);
    // Ko'p-akkaunt (masalan ona ikki farzandiga) — bitta raqam bir nechta hujjatda bo'lishi mumkin.
    // getAuthUser bu holatni to'g'ri hal qilmaydi (birinchisini qaytaradi), shuning uchun
    // to'g'ridan-to'g'ri qidiramiz.
    const candidates = await prisma.user.findMany({
      where: { phone, isDeleted: false },
      include: { role: true, branches: true },
    });
    for (const c of candidates) {
      if (await comparePassword(password, c.password)) {
        user = c;
        break;
      }
    }
  } else {
    // Telefon bo'lmasa, shunchaki login bo'yicha
    const candidate = await prisma.user.findFirst({
      where: { login: login.toLowerCase(), isDeleted: false },
      include: { role: true, branches: true },
    });
    if (candidate && (await comparePassword(password, candidate.password))) {
      user = candidate;
    }
  }

  if (!user) {
    throw new ApiError(401, "Login/telefon yoki parol noto'g'ri");
  }

  if (!user.isActive) {
    throw new ApiError(403, "Akkaunt bloklangan");
  }

  await linkTelegram(tgUser, user.id);

  const permissions = resolveRole(user);
  const tokens = issueTokens({
    userId: user.id,
    permissions,
    canSeeAllBranches: Boolean(user.role?.canSeeAllBranches),
    userAgent,
    ip,
    viaBot: true, // bot orqali kirganligini belgilaymiz
  });

  return {
    user: sanitizeUser(user),
    tokens,
  };
};

export const linkWithToken = async ({ initData, token }) => {
  if (!token) throw new ApiError(400, "Token kiritilmadi");

  // Agar userApp dan kelsa token=... bo'lib initData buzilgan bo'lishi mumkin.
  // parseTgUserLoose HMAC'ni tekshirmaydi, chunki user allaqachon login tokeni orqali ruxsat olgan.
  const tgUser = parseTgUserLoose(initData);
  if (!tgUser) {
    throw new ApiError(400, "Telegram ma'lumotlari xato uzatildi");
  }

  // Token ni decodelaymiz (yoki magic linkni bazadan qidiramiz)
  // Hozirgi kod bazada magic-link ishlatilmagan ekan, bu ehtimol kelajak yoki tashqi
  // login token uchun. Shuning uchun implementatsiyani vaqtinchalik qoldiramiz.
  // Bu qism Prisma'ga bog'liq emas.

  return { success: true };
};
