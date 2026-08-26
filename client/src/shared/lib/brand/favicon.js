// Constants
import { APP_LOGO } from "@/shared/constants/app";

/**
 * Brauzer yorlig'idagi belgini (favicon) `.env` dagi logo manzilidan
 * ish vaqtida o'rnatadi.
 *
 * ── NEGA BUILD VAQTIDA EMAS ──
 * `index.html` da `%VITE_APP_LOGO%` yozuvi Vite tomonidan FAQAT build
 * paytida almashtiriladi. Bu ikki muammo tug'diradi:
 *
 *   1. Tenantning logotipi masofaviy manzil bo'lsa (admin panel uni
 *      `VITE_APP_LOGO=https://.../logo.png` ko'rinishida yozadi), uni
 *      o'zgartirish uchun har safar qaytadan build qilish kerak edi.
 *   2. O'zgaruvchi umuman berilmasa, Vite yozuvni O'RNIDA qoldiradi va
 *      brauzer `/%VITE_APP_LOGO%` manzilini so'rab 404 oladi — ya'ni
 *      belgi butunlay yo'qoladi.
 *
 * Shuning uchun `index.html` da har doim mavjud bo'lgan mahalliy fayl
 * (`/logo.svg`) turadi, bu funksiya esa uning ustiga `.env` dagi
 * qiymatni qo'yadi.
 *
 * ── NEGA AVVAL YUKLAB KO'RAMIZ ──
 * `href` ni to'g'ridan-to'g'ri almashtirish xavfli: manzil buzuq bo'lsa
 * (CDN o'chgan, fayl deploy'da ko'chirilmagan) brauzer ISHLAYOTGAN
 * belgini bo'sh varaqqa almashtiradi. Rasm muvaffaqiyatli yuklangandan
 * KEYIN almashtirsak, eng yomon holatda `index.html` dagi zaxira belgi
 * joyida qoladi.
 */

/** Kengaytmadan MIME turi. Noma'lum bo'lsa - `type` umuman yozilmaydi. */
const MIME_BY_EXTENSION = {
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const mimeTypeOf = (url) => {
  // So'rov (`?v=2`) va fragment (`#icon`) qismlarini tashlab yuboramiz -
  // aks holda "png?v=2" hech qanday turga mos kelmaydi.
  const path = url.split(/[?#]/)[0];
  const extension = path.split(".").pop()?.toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? null;
};

/** `<link rel="icon">` ni topadi, bo'lmasa yaratadi. */
const iconLink = () => {
  const existing = document.querySelector('link[rel~="icon"]');
  if (existing) return existing;

  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
};

export const applyAppFavicon = () => {
  if (typeof document === "undefined") return;

  const url = APP_LOGO?.trim();
  if (!url) return;

  const link = iconLink();

  // Manzil allaqachon o'sha bo'lsa - rasmni bekorga yuklamaymiz.
  if (link.getAttribute("href") === url) return;

  const probe = new Image();
  probe.onload = () => {
    const type = mimeTypeOf(url);
    if (type) link.type = type;
    else link.removeAttribute("type");

    link.href = url;
  };
  probe.src = url;
};

export default applyAppFavicon;
