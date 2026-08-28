import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

const E = ENDPOINTS.expenses;

/**
 * CHIQIMLAR API.
 *
 * Har metod BEVOSITA `modules/expenses` kontrollerining marshrutiga
 * mos keladi. Bu yerda hech qanday hisob-kitob yo'q — chiqim summasi,
 * jami va qoldiq SERVERDA hisoblanadi.
 *
 * ⚠ `create` IKKI XIL MUVAFFAQIYAT STATUSI qaytaradi va ular BOSHQA
 * ma'noga ega:
 *   201 — chiqim YOZILDI, kassa qoldig'i o'zgardi;
 *   202 — summa filial limitidan oshdi, chiqim YOZILMADI, tasdiq
 *         so'rovi ochildi.
 * Shuning uchun mutatsiya javob statusini o'qiydi (useExpenseMutations).
 */
export const expensesAPI = {
  list: (params) => http.get(E.base, { params }),
  one: (id) => http.get(E.byId(id)),
  create: (body) => http.post(E.base, body),
  update: (id, body) => http.patch(E.byId(id), body),
  remove: (id) => http.delete(E.byId(id)),

  summary: (params) => http.get(E.summary, { params }),

  categories: (params) => http.get(E.categories, { params }),
  createCategory: (body) => http.post(E.categories, body),

  /**
   * CHEK YUKLASH — chiqim yozilishidan OLDIN, alohida so'rov.
   *
   * Javob `{ id }` beradi va o'sha ID chiqim tanasidagi `receipt`
   * maydoniga qo'yiladi. Ikki qadam ATAYLAB: chiqim limitdan oshsa
   * hujjat YARATILMAYDI (tasdiq so'rovi ochiladi), ya'ni faylni
   * chiqimga bog'lab yuborish uni yetim qoldirardi. ID esa tasdiq
   * payload'ida bemalol saqlanadi.
   *
   * ⚠ `Content-Type` OCHIQ `undefined`: axios nusxasida u global
   * `application/json` qilib qo'yilgan va u bekor qilinmasa brauzer
   * `multipart/form-data` chegara (boundary) satrini QO'SHMASDI —
   * multer tanani umuman o'qiy olmasdi.
   */
  uploadReceipt: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return http.post(E.receipt, fd, { headers: { "Content-Type": undefined } });
  },

  // Yuklab olish `Authorization` sarlavhasini talab qiladi, ya'ni
  // oddiy `<a href>` ishlamaydi — javob blob sifatida olinadi.
  downloadReceipt: (id) =>
    http.get(E.receiptById(id), { responseType: "blob" }),
};

export default expensesAPI;
