import ApiError from "../utils/ApiError.js";
import { ALL_BRANCHES } from "./branchContext.helper.js";

// FILIAL NIYATI TASDIG'I ("men qaysi filialga yozayotganimni bilaman").
//
// MUAMMO: client `x-branch-id` yuboradi, server esa uni resolveBranchScope()
// orqali HAL QILADI - va bu ikkalasi bir xil bo'lmasligi mumkin. Server
// bir necha holatda JIMGINA boshqa filialga tushadi:
//
//   - foydalanuvchi filialdan chiqarilgan (tab ochiq turganda) -> ko'lam
//     torayadi va so'ralgan filial rad etilib, boshqasi tanlanadi;
//   - filial arxivlangan yoki o'chirilgan;
//   - markazda yagona filial qolgan -> "all" jimgina o'shanga aylanadi
//     (resolveSoleBranchId);
//   - eskirgan localStorage qiymati.
//
// O'QISHDA bu xavfsiz - noto'g'ri filial ma'lumoti ko'rinadi, xolos.
// YOZISHDA esa pul va ma'lumot NOTO'G'RI FILIALGA tushadi va buni hech
// kim sezmaydi: xato ham chiqmaydi, log ham qolmaydi.
//
// YECHIM: client o'zi ISHONGAN filialni alohida `x-branch-context`
// sarlavhasida yuboradi. Server hal qilgan filial undan farq qilsa -
// 409 va "sahifani yangilang". Yozuv umuman bajarilmaydi.
//
// NEGA `x-branch-id` NING O'ZI YETARLI EMAS: u SO'ROV, bu esa TASDIQ.
// Server so'rovni rad etib boshqasini tanlaganini faqat ikkinchisi
// bilan aniqlash mumkin.
//
// NEGA FAQAT MUTATSIYALARDA: o'qish so'rovini 409 bilan to'sish
// foydasiz bezovtalik bo'lardi - u hech narsani buzmaydi va client
// keyingi so'rovda baribir to'g'ri qiymatga o'tadi.
//
// ORQAGA MOSLIK: sarlavha yuborilmasa tekshiruv o'tkazib yuboriladi.
// Eski client, bot, tashqi integratsiya va Agenda job'lar ta'sirlanmaydi.

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export const BRANCH_CONTEXT_HEADER = "x-branch-context";

/**
 * @param {object} req - express so'rovi
 * @param {{branchId: string|null}} scope - resolveBranchScope natijasi
 * @throws {ApiError} 409 - client kutgan filial serverniki bilan mos kelmasa
 */
export const assertBranchIntent = (req, scope) => {
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
