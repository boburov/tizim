import type { Request } from 'express';
import { ApiError } from '../errors/api-error.js';
import { ALL_BRANCHES } from '../als/branch-context.js';
import type { BranchScope } from './branch-access.service.js';

/**
 * `server/src/helpers/branchIntent.guard.js` NING KO'CHIRMASI.
 *
 * FILIAL NIYATI TASDIG'I ("men qaysi filialga yozayotganimni bilaman").
 *
 * MUAMMO: client `x-branch-id` YUBORADI, server esa uni O'ZI HAL QILADI —
 * va bu ikkalasi bir xil bo'lmasligi mumkin (foydalanuvchi filialdan
 * chiqarilgan, filial arxivlangan, eskirgan localStorage). O'QISHDA bu
 * xavfsiz — noto'g'ri ma'lumot ko'rinadi, xolos. YOZISHDA esa pul
 * NOTO'G'RI FILIALGA tushadi va buni hech kim sezmaydi: xato ham
 * chiqmaydi, log ham qolmaydi.
 *
 * YECHIM: client o'zi ISHONGAN filialni `x-branch-context` sarlavhasida
 * yuboradi. Server hal qilgani undan farq qilsa — 409.
 *
 * NEGA FAQAT MUTATSIYALARDA: o'qishni 409 bilan to'sish foydasiz
 * bezovtalik bo'lardi.
 *
 * ORQAGA MOSLIK: sarlavha yuborilmasa tekshiruv o'tkazib yuboriladi —
 * eski client, bot va joblar ta'sirlanmaydi.
 */

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export const BRANCH_CONTEXT_HEADER = 'x-branch-context';

export const assertBranchIntent = (req: Request, scope: BranchScope): void => {
  if (!MUTATING_METHODS.has(req.method)) return;

  const raw = req.headers[BRANCH_CONTEXT_HEADER];
  if (!raw) return;

  const expected = String(raw).trim();
  if (!expected) return;

  // Server nima hal qildi. branchId yo'q = "barcha filiallar" rejimi.
  const actual = scope?.branchId ? String(scope.branchId) : ALL_BRANCHES;

  if (expected !== actual) {
    throw new ApiError(
      409,
      "Filial almashdi - sahifani yangilang va amalni qaytadan bajaring",
    );
  }
};

export default assertBranchIntent;
