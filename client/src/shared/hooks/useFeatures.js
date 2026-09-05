// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TARIF IMKONIYATLARI — KLIENT TOMONI
 * ══════════════════════════════════════════════════════════════════════
 *
 * "Bu bo'lim shu loyihada UMUMAN bormi" degan savolning yagona manbai.
 * `useCoinConfig` ning umumlashtirilgani: o'sha naqsh, lekin bitta
 * bo'lim uchun emas, reyestrdagi hammasi uchun.
 *
 * ── UCHTA ORTOGONAL DARVOZA ──
 *   1. RUXSAT   (`usePermissions`) — menda shu ishga HAQ bormi (rol).
 *   2. IMKONIYAT (shu hook)        — bu bo'lim sotib olinganmi (tarif).
 *   3. KO'LAM   (filial)           — qaysi filial ma'lumoti.
 * Ular BIR-BIRINI ALMASHTIRMAYDI: to'liq huquqli ega ham tarifda
 * bo'lmagan bo'limni ko'rmaydi.
 *
 * ── NEGA `/auth/me` GA QO'SHILMADI ──
 * `me` klientda 5 daqiqa (`staleTime`) va serverda ham 5 daqiqa
 * (`roleCache`) keshlanadi. Ikkisi ustma-ust tushib, dev panelda
 * yoqilgan modul mijozga 10 daqiqagacha ko'rinmasdi — "darhol yoqish"
 * shu yerda o'lardi.
 *
 * ── ⚠ XATO HOLATIDA YOPIQ ──
 * So'rov yiqilsa hamma bo'lim O'CHIQ deb hisoblanadi — `useCoinConfig`
 * dagi `FALLBACK.enabled = false` bilan bir xil qaror. Ochiq qoldirish
 * menyuni chizib, keyin har bosishda 402 berardi; yopiq holat esa eng
 * yomon holatda yozuvni vaqtincha yashiradi.
 *
 * Server ham aynan shunday yiqiladi (`ModuleFeaturesService` — 72 soatlik
 * muhlatdan keyin yopiq), ya'ni ikki tomon BIR XIL yo'nalishda xato
 * qiladi. Bu muhim: qarama-qarshi yiqilsalar menyu ko'rinib, bosilganda
 * xato beradigan holat tug'ilardi.
 */
const EMPTY = Object.freeze({});

const useFeatures = () => {
  const { role } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.features.all(),
    queryFn: () => http.get(ENDPOINTS.features.base).then((r) => r.data),
    // Login qilmaganda so'ramaymiz — 401 olardi va `AuthGuard`
    // baribir login sahifasiga olib chiqadi.
    enabled: Boolean(role),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const features = data?.features || EMPTY;

  /**
   * Bo'lim ochiqmi.
   *
   * ⚠ NOMA'LUM KALIT — YOPIQ. Bu xato bosib ketishning oldini oladi:
   * `has("improts")` (xato yozilgan) `false` beradi va bo'lim
   * ko'rinmaydi. Teskarisi bo'lganda xato kalit JIMGINA "hammasi
   * ochiq" degani bo'lardi.
   */
  const has = (key) => {
    if (!key) return true;
    if (isLoading || isError) return false;
    return features[key] === true;
  };

  return {
    features,
    has,
    /**
     * TELEGRAM BOT TEXNIK JIHATDAN ISHLAYAPTIMI.
     *
     * ⚠ Bu `has("notifications")` DAN BOSHQA narsa:
     *   • `has(...)` — bo'lim SOTIB OLINGANMI (tarif qarori);
     *   • `botEnabled` — tenant `.env` da bot yoqilgan va TOKEN bormi.
     *
     * Tarifda bor, lekin token qo'yilmagan holat juda ko'p uchraydi
     * (mijoz hali botini ochmagan). Shunda "Telegram orqali yuborish"
     * tanlovi ko'rinib turardi va bosilganda JIMGINA hech narsa
     * qilmasdi — xabar yuborildi deb ko'rsatilib, hech kimga yetmasdi.
     *
     * ⚠ Standart `false` (yopiq) — fayl boshidagi "xato holatida yopiq"
     * qarori bilan bir xil yo'nalish.
     */
    botEnabled: data?.bot?.enabled === true,
    /** Server bilan aloqa uzilganmi — qo'llab-quvvatlash uchun. */
    stale: Boolean(data?.stale),
    planKey: data?.planKey ?? null,
    isLoading,
    isError,
  };
};

export default useFeatures;
