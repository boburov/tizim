/**
 * ══════════════════════════════════════════════════════════════════════
 * TAHLIL MARKAZI MANZILLARI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BU HOOK BOR EDI ──
 * Ilgari ilovada IKKITA qobiq bor edi va tahlil sahifalari
 * IKKALASIDA ham mount qilingandi: `/owner/ai*` va `/admin/tahlil*`.
 * Sahifadagi ichki havola qat'iy yozilgan bo'lsa, rahbariyat
 * qobig'ida turgan odam bosilgan havoladan BOSHQA qobiqqa otib
 * ketardi — 404 emas, shuning uchun hech qanday xato ko'rinmasdi,
 * u shunchaki boshqa ilovaga tushgandek bo'lardi.
 *
 * ── NEGA ENDI SODDA ──
 * Qobiq BITTA qoldi (ish makoni), `/admin/tahlil*` esa shu yerga
 * yo'naltiriladi (`app/routes.jsx`). Ya'ni tanlanadigan prefiks yo'q.
 *
 * Hook o'chirilmadi va manzillar sahifalarga qaytarilmadi: ular
 * TO'RTTA fayldan chaqiriladi va bitta joyda turgani marshrut
 * o'zgarganda tekshiriladigan joyni ham bitta qoldiradi.
 */
const BASE = "/owner/ai";

export const AI_PATHS = Object.freeze({
  home: BASE,
  tasks: `${BASE}/tasks`,
  reports: `${BASE}/reports`,
  report: (id) => `${BASE}/reports/${id}`,
});

const useAiPaths = () => AI_PATHS;

export default useAiPaths;
