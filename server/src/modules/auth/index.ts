/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTH MODULINING OMMAVIY API'SI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Boshqa modullar auth'ga FAQAT shu fayl orqali kiradi
 * (`scripts/arch-scan.mjs` R1 — chuqur import taqiqlanadi).
 *
 * ── NIMA CHIQARILADI VA NEGA ──
 *
 *   `AuthModule`        — Nest bog'lash uchun.
 *   `UserProfileService`— `/auth/me` javobini yig'adi; `users` moduli
 *                         ham o'sha shaklni qaytarishi kerak.
 *   cookie yordamchilari— `bot-auth` AYNI cookie'ni qo'yadi: bot orqali
 *                         kirgan odam ham veb sessiyani oladi. Ikki
 *                         nusxa bo'lsa `sameSite`/`secure` sozlamalari
 *                         ajralib ketardi va bittasi jimgina ishlamay
 *                         qolardi.
 *
 *   `AuthService`       — ⚠ ATAYLAB chiqarilgan, garchi u asosan ichki
 *                         bo'lsa ham. Sabab amaliy: HISOB YARATISH
 *                         (`registerUser`) to'rt joyda kerak —
 *                         `bot-auth`, `leads` (lid o'quvchiga aylanganda)
 *                         va import qiluvchilar (o'quvchi/o'qituvchi
 *                         importi). Parol siyosati, login noyobligi va
 *                         boshlang'ich rol qoidasi BITTA joyda turishi
 *                         kerak; har modul o'zi `user.create` qilsa
 *                         ular to'rt xil bo'lib ketardi.
 *
 * ── NIMA CHIQARILMAYDI ──
 * `hash-token`, `cookie` ning ichki qismlari, validatorlar va token
 * yasash — ular AUTH ICHKI ishi. Boshqa modul token imzolashi kerak
 * bo'lsa, savolning o'zi noto'g'ri.
 *
 * ⚠ MODUL KLASSI BU YERDA YO'Q — ATAYLAB.
 * Uni re-eksport qilish ish vaqtida SIKL yaratardi: servisni olish
 * uchun `*.module.ts` ham yuklanardi, u esa boshqa modullarni
 * import qiladi ("Cannot access 'XModule' before initialization").
 * Modul klassi `<modul>/<modul>.module.js` dan olinadi — u ham
 * ommaviy kirish nuqtasi.
 */
export { UserProfileService } from './user-profile.service.js';
export {
  setRefreshCookie,
  clearRefreshCookie,
  type CookieSettings,
} from './cookie.js';
export { AuthService } from './auth.service.js';
