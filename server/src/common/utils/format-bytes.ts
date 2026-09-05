/**
 * Baytni odam o'qiydigan ko'rinishga o'giradi ("4.2 MB").
 *
 * ⚠ `modules/storage/storage.service.ts` DAN KO'CHIRILDI. U yerda
 * turganda `common/middleware/upload-attachment.ts` uni import qilib,
 * `common/` → `modules/` bog'liqligini yaratardi — pastki qatlam
 * yuqoriga qarab turardi. Funksiya sof va domensiz, uning o'rni shu.
 */
export const formatBytes = (bytes: unknown): string => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};
