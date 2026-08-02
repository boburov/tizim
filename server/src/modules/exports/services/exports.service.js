import ApiError from "../../../utils/ApiError.js";
import { buildWorkbook } from "./xlsxWriter.service.js";

// 1-BOSQICH CHEGARASI. Sinxron eksport shu qatordan oshmaydi.
//
// NEGA chegara bor: butun jadval xotirada yig'iladi va bitta HTTP
// javobida yuboriladi. Chegarasiz katta filial bir so'rov bilan
// serverni xotiradan chiqarib yubora olardi. Oshib ketsa foydalanuvchiga
// filtrni toraytirish taklif qilinadi (xato xabari aniq bo'lishi shart -
// "xatolik yuz berdi" foydasiz).
export const MAX_SYNC_ROWS = 5000;

// Servislarga beriladigan sahifa hajmi. 500 - so'rovlar soni bilan
// xotira o'rtasidagi muvozanat (5000 qator = 10 ta so'rov).
const PAGE_SIZE = 500;

/**
 * Dataset'ni sahifama-sahifa aylanib, barcha qatorlarni yig'adi.
 *
 * DIQQAT: fetchPage mavjud list servisini chaqiradi, ya'ni filial
 * filtri va soft-delete shartlari avtomatik qo'llanadi. Bu funksiya
 * hech qanday qo'shimcha filtr QO'SHMAYDI va OLIB TASHLAMAYDI.
 */
export const collectRows = async (dataset, filters) => {
  const rows = [];
  let page = 1;

  for (;;) {
    const result = await dataset.fetchPage({ filters, page, limit: PAGE_SIZE });
    const items = result?.items || [];
    const total = Number(result?.total ?? 0);

    // Chegarani BIRINCHI sahifadayoq tekshiramiz: 40 000 qatorni yig'ib
    // bo'lgach xato berish ma'nosiz - server allaqachon xotirani yegan.
    if (page === 1 && total > MAX_SYNC_ROWS) {
      throw new ApiError(
        413,
        `Juda ko'p ma'lumot (${total.toLocaleString("uz-UZ")} qator). ` +
          `Bir martada ${MAX_SYNC_ROWS.toLocaleString("uz-UZ")} qatorgacha yuklab olish mumkin. ` +
          `Filtrlarni toraytiring (oy, guruh yoki holat tanlang).`,
        { code: "EXPORT_TOO_LARGE" },
      );
    }

    for (const item of items) rows.push(dataset.mapRow(item));

    if (items.length < PAGE_SIZE || rows.length >= total) break;
    page += 1;

    // Xavfsizlik to'sig'i: total noto'g'ri hisoblansa ham cheksiz
    // halqaga tushmaymiz.
    if (rows.length >= MAX_SYNC_ROWS) break;
  }

  return rows;
};

/**
 * To'liq eksport oqimi: qatorlarni yig'ish -> XLSX qurish.
 *
 * @returns {Promise<{buffer: Buffer, rowCount: number}>}
 */
export const generateXlsx = async ({ dataset, columns, filters, meta }) => {
  if (!columns.length) {
    throw new ApiError(400, "Kamida bitta ustun tanlang");
  }

  const rows = await collectRows(dataset, filters);
  const buffer = await buildWorkbook({ dataset, columns, rows, meta });
  return { buffer, rowCount: rows.length };
};
