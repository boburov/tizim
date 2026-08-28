/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `Content-Disposition` SARLAVHASI — YUKLAB OLISH UCHUN.
 *
 * Fayl nomi sarlavhada IKKI XIL ko'rinishda ketadi: ASCII (eski
 * brauzerlar) va UTF-8 (kirill/o'zbek harflari saqlanib qolishi
 * uchun).
 *
 * ── NEGA UMUMIY FAYLDA ──
 * Bu naqsh uch joyda kerak bo'ldi: vazifa ilovasi
 * (`assignments/:id/file`), chiqim cheki (`expenses/receipt/:id`) va
 * Excel eksporti (`utils/send-xlsx.ts`). Uchta nusxa ular orasida
 * jimgina ajralib ketardi — masalan bittasida `attachment` `inline`
 * ga aylansa, o'sha yo'l brauzerda fayl OCHADIGAN bo'lib qolardi.
 *
 * ⚠ HAR DOIM `attachment`: fayl brauzerda hech qachon ochilmaydi.
 * `X-Content-Type-Options: nosniff` bilan birga bu saqlangan XSS ga
 * qarshi ikkinchi qatlam.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const contentDisposition = (name: unknown): string => {
  // eslint-disable-next-line no-control-regex
  const ascii = String(name).replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(String(name))}`;
};
