// Router
import { Navigate, Outlet } from "react-router-dom";

// Components
import FeatureUnavailable from "@/shared/components/feedback/FeatureUnavailable";

// Hooks
import useFeatures from "@/shared/hooks/useFeatures";

/**
 * TARIF BO'LIMINING MARSHRUT QO'RIQCHISI.
 *
 * ── NIMA UCHUN `PermissionGuard` DAN ALOHIDA ──
 * `PermissionGuard` — "menda huquq bormi". Bu yerdagi savol boshqa:
 * "bu bo'lim shu loyihada UMUMAN bormi". Tarifda yo'q bo'lsa marshrut
 * hech kimga — to'liq huquqli egaga ham — ochilmasligi kerak.
 *
 * ⚠ JOYLASHUV: `CoinGuard` bilan bir xil — TASHQARIDA turadi,
 * `PermissionGuard` esa ICHKARIDA. Avval "bo'lim bormi", keyin
 * "kirishga haqim bormi".
 *
 *     <FeatureGuard feature="imports">
 *       <PermissionGuard required={...}>
 *
 * ── YUKLANISH PAYTIDA `null` ──
 * `PermissionGuard` bilan bir xil sabab: javob kelmasidan
 * yo'naltirilsa sahifa har yangilanishda bir zumga ochilib, keyin
 * fallback'ga otilardi.
 *
 * ── XAVFSIZLIK EMAS ──
 * Ma'lumotni server qo'riqlaydi: tarifda yo'q bo'lim marshrutlari 402
 * qaytaradi (`FeatureGate`). Bu qo'riqchi odamni bo'sh xato ekraniga
 * emas, tushunarli joyga olib boradi.
 *
 * ── ⚠ STANDART HOLDA YO'NALTIRMAYDI, TUSHUNTIRADI ──
 * `CoinGuard` jim qaytaradi va bu o'sha yerda to'g'ri: bo'limni
 * EGANING O'ZI o'chirgan. Bu yerda esa bo'lim MAVJUD, lekin tarifga
 * kirmagan — jim qaytarish "sayt buzuq" degan taassurot berardi.
 * Chuqur havola bilan kelgan odam nima bo'lganini bilishi kerak.
 *
 * `redirect` bilan eski xulq (jim yo'naltirish) qaytariladi — menyu
 * ichidagi ikkilamchi joylarda kerak bo'lishi mumkin.
 *
 * @param redirect  ekran ko'rsatish o'rniga `fallback` ga yo'naltirsinmi
 */
const FeatureGuard = ({
  feature,
  children,
  redirect = false,
  fallback = "/",
}) => {
  const { has, isLoading } = useFeatures();

  if (isLoading) return null;
  if (!has(feature)) {
    return redirect ? <Navigate to={fallback} replace /> : <FeatureUnavailable />;
  }

  return children || <Outlet />;
};

export default FeatureGuard;
