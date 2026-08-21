import type { Response, Request } from 'express';

/**
 * `server/src/helpers/cookie.helper.js` ning aynan ko'chirmasi.
 *
 * ⚠ SHARTNOMA O'ZGARMASLIGI SHART — klient shu cookie'ga tayanadi:
 *   nom `refreshToken` · httpOnly · SIGNED · path `/api/auth`
 *   sameSite: prod'da "none", dev'da "lax" · domain env'dan · 7 kun
 *
 * `path: "/api/auth"` MUHIM: cookie faqat auth marshrutlariga yuboriladi,
 * ya'ni qolgan 380+ so'rovda tarmoqqa chiqmaydi.
 */
const REFRESH_COOKIE = 'refreshToken';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 kun

export interface CookieSettings {
  isProd: boolean;
  domain: string;
}

export const setRefreshCookie = (
  res: Response,
  token: string,
  s: CookieSettings,
): void => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: s.isProd,
    sameSite: s.isProd ? 'none' : 'lax',
    domain: s.domain,
    path: '/api/auth',
    maxAge: REFRESH_MAX_AGE,
    signed: true,
  });
};

export const clearRefreshCookie = (res: Response, s: CookieSettings): void => {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: s.isProd,
    sameSite: s.isProd ? 'none' : 'lax',
    domain: s.domain,
    path: '/api/auth',
    signed: true,
  });
};

export const getRefreshFromCookies = (req: Request): string | null =>
  (req.signedCookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] || null;
