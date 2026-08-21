import type { Response } from 'express';

/**
 * XLSX buferini YUKLAB OLINADIGAN javob sifatida yuboradi
 * (`utils/sendXlsx.js` KO'CHIRMASI).
 *
 * ⚠ BIR JOYDA: eksport ham, import SHABLONI ham, XATOLIK HISOBOTI ham
 * shu funksiyani ishlatadi — sarlavhalar (ayniqsa CORS expose) bir
 * joyda to'g'ri bo'lsa yetarli.
 *
 * ⚠ `Access-Control-Expose-Headers` SHART: brauzer fetch/axios
 * `Content-Disposition` va `X-Export-Rows` ni FAQAT ochiq (expose)
 * bo'lsa o'qiy oladi — fayl nomi va qatorlar soni shular orqali keladi.
 */
export const sendXlsx = (
  res: Response,
  buffer: ArrayBuffer | Buffer,
  fileName: string,
  extraHeaders: Record<string, unknown> = {},
): void => {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.setHeader('Content-Length', (buffer as ArrayBuffer).byteLength);

  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, String(value));
  }

  res.setHeader(
    'Access-Control-Expose-Headers',
    ['Content-Disposition', 'X-Export-Rows', ...Object.keys(extraHeaders)].join(', '),
  );

  res.end(Buffer.from(buffer as ArrayBuffer));
};
