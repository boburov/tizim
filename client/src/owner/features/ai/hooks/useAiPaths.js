import { useLocation } from "react-router-dom";

/**
 * TAHLIL MARKAZI SAHIFALARINING MANZILLARI — QOBIQQA QARAB.
 *
 * ═══════════════════════════════════════════════════════════════════
 * MUAMMO: BITTA SAHIFA, IKKI QOBIQ
 *
 * Tahlil markazi sahifalari IKKI joyda mount qilingan:
 *
 *   /owner/ai            /admin/tahlil            (rahbariyat qobig'i)
 *   /owner/ai/tasks      /admin/tahlil/vazifalar
 *   /owner/ai/reports    /admin/tahlil/hisobotlar
 *   /owner/ai/reports/:id  /admin/tahlil/hisobotlar/:id
 *
 * Komponentlar ichidagi havolalar esa `/owner/ai/...` deb QATTIQ
 * yozilgan edi. Natijada rahbariyat qobig'ida turgan foydalanuvchi
 * "Hisobotlar" ni bosishi bilan sidebar'li operatsion panelga
 * OTILIB tushardi - u yerdan qaytish yo'li esa faqat brauzer
 * tugmasi bo'lardi.
 *
 * Bu "404" emas, shuning uchun hech qanday xato ko'rinmasdi -
 * foydalanuvchi shunchaki boshqa ilovaga tushgandek bo'lardi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * MARSHRUTLAR IKKILANTIRILMAYDI, faqat prefiks almashadi. Sahifa
 * komponentlari bitta nusxada qoladi (`owner/features/ai`), qaysi
 * qobiqda ekanini esa MANZILDAN biladi - propdan emas: prop bo'lsa
 * uni har chaqiruvda uzatish kerak bo'lardi va bitta joyda unutilsa
 * xato jimgina qaytardi.
 */
const ADMIN_BASE = "/admin/tahlil";
const OWNER_BASE = "/owner/ai";

export const aiPathsFor = (pathname = "") => {
  const inAdmin = pathname.startsWith(ADMIN_BASE);

  return inAdmin
    ? {
        inAdmin: true,
        home: ADMIN_BASE,
        tasks: `${ADMIN_BASE}/vazifalar`,
        reports: `${ADMIN_BASE}/hisobotlar`,
        report: (id) => `${ADMIN_BASE}/hisobotlar/${id}`,
      }
    : {
        inAdmin: false,
        home: OWNER_BASE,
        tasks: `${OWNER_BASE}/tasks`,
        reports: `${OWNER_BASE}/reports`,
        report: (id) => `${OWNER_BASE}/reports/${id}`,
      };
};

const useAiPaths = () => aiPathsFor(useLocation().pathname);

export default useAiPaths;
