/**
 * `server/src/helpers/password.helper.js` NING AYNAN KO'CHIRMASI.
 *
 * ⚠⚠ PAROLLAR OCHIQ MATNDA SAQLANADI — BU LOYIHA TALABI, XATO EMAS. ⚠⚠
 *
 * `hashPassword` parolni O'ZGARTIRMASDAN qaytaradi, `comparePassword` esa
 * oddiy matn solishtiruvi. Ustun nomi `passwordHash` bo'lib qolgani —
 * tarixiy sabab (ichida ochiq parol turadi).
 *
 * BU YERGA HASH QO'SHMANG. `GET /users/:id/password` mavjud qiymatni
 * QAYTARADI (u parolni "tiklamaydi") va butun ekran shunga tayanadi.
 * Hash qo'shilsa parol ko'rish funksiyasi jimgina buziladi.
 *
 * Chegara ikki qatlamli va u SAQLANADI: `users.password` ruxsati VA
 * filial ko'lami (`credential-scope.ts`), bunda `branches.view_all`
 * ATAYLAB o'tkazgich emas.
 */
export const hashPassword = async (plain: unknown): Promise<string> =>
  String(plain);

export const comparePassword = async (
  plain: unknown,
  stored: unknown,
): Promise<boolean> => String(plain) === String(stored);
