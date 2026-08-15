import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import env from "../config/env.js";

export const signAccess = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });

// HAR BIR refresh token NOYOB bo'lishi uchun `jti` qo'shiladi.
//
// NEGA: JWT ichidagi `iat` faqat SEKUND aniqligida. Bir xil payload
// ({sub, role}) bilan bir sekund ichida imzolangan ikkita token BAYT-BAYT
// bir xil chiqadi, ya'ni ularning sha256 xeshi ham bir xil. `tokenHash`
// esa unique - natijada "kirish, so'ng darhol yangilash" oqimi
// unique constraint xatosi bilan yiqilardi.
//
// Bu xato Mongo davridan beri bor edi (u yerda ham tokenHash unique edi),
// lekin odam tezligida kamdan-kam ko'rinardi. `jti` uni butunlay yopadi
// va har bir sessiyaga alohida identifikator beradi.
export const signRefresh = (payload) =>
  jwt.sign({ ...payload, jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  });

export const verifyAccess = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);

export const verifyRefresh = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);
