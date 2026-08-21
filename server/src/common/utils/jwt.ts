import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

/**
 * `server/src/utils/jwt.js` NING KO'CHIRMASI.
 *
 * FARQ: Express modul yuklanayotganda `env` dan o'qiydi; bu yerda
 * sozlamalar CHAQIRUVDA beriladi, chunki NestJS'da ular `ConfigService`
 * orqali keladi. Imzolash mantig'i o'zgarmagan.
 */
export interface JwtSettings {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
}

export interface TokenPayload {
  sub: string;
  role: string;
  [key: string]: unknown;
}

export const signAccess = (payload: TokenPayload, s: JwtSettings): string =>
  jwt.sign(payload, s.accessSecret, { expiresIn: s.accessTtl } as jwt.SignOptions);

/**
 * HAR BIR refresh token NOYOB bo'lishi uchun `jti` qo'shiladi.
 *
 * NEGA: JWT ichidagi `iat` faqat SEKUND aniqligida. Bir xil payload
 * (`{sub, role}`) bilan bir sekund ichida imzolangan ikkita token
 * BAYT-BAYT bir xil chiqadi, ya'ni ularning sha256 xeshi ham bir xil.
 * `tokenHash` esa unique — natijada "kirish, so'ng darhol yangilash"
 * oqimi unique constraint xatosi bilan yiqilardi.
 *
 * ⚠ `jti` NI OLIB TASHLAMANG. Bu xato Mongo davridan beri bor edi va
 * odam tezligida kamdan-kam ko'rinardi — ya'ni regressiya sezilmasdan
 * ishlab tursa ham, poyga holatida qaytadi.
 */
export const signRefresh = (payload: TokenPayload, s: JwtSettings): string =>
  jwt.sign({ ...payload, jti: randomUUID() }, s.refreshSecret, {
    expiresIn: s.refreshTtl,
  } as jwt.SignOptions);

export const verifyAccess = (token: string, s: JwtSettings): TokenPayload =>
  jwt.verify(token, s.accessSecret) as TokenPayload;

export const verifyRefresh = (token: string, s: JwtSettings): TokenPayload =>
  jwt.verify(token, s.refreshSecret) as TokenPayload;
