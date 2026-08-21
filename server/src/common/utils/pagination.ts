/**
 * `server/src/utils/pagination.js` NING AYNAN KO'CHIRMASI.
 *
 * ⚠ CHEGARALAR O'ZGARMAYDI: `limit` yuqori chegarasi 500, standart 20.
 * Ularni "yaxshilash" klient sahifalashini jimgina buzardi — masalan
 * `?limit=1000` bugun 500 qator qaytaradi, cheklov olib tashlansa esa
 * 1000 ta va javob hajmi ikki barobar oshardi.
 */
export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export const parsePagination = (query: Record<string, unknown>): Pagination => {
  const page = Math.max(1, Number(query?.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(query?.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const buildMeta = ({
  page,
  limit,
  total,
}: {
  page: number;
  limit: number;
  total: number;
}) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit) || 1,
});
