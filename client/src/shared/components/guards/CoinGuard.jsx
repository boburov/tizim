// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useCoinConfig from "@/shared/hooks/useCoinConfig";

/**
 * TANGA BO'LIMINING MARSHRUT QO'RIQCHISI.
 *
 * ── NIMA UCHUN ALOHIDA QO'RIQCHI ──
 * `PermissionGuard` "menda huquq bormi" degan savolga javob beradi.
 * Bu yerdagi savol boshqa: "bu bo'lim UMUMAN mavjudmi". Ega uni
 * o'chirsa marshrut hech kimga — ruxsati borlarga ham — ochiq
 * bo'lmasligi kerak (talab).
 *
 * ── YUKLANISH PAYTIDA `null` ──
 * `PermissionGuard` bilan bir xil sabab: konfiguratsiya kelmasidan
 * yo'naltirilsa, sahifa har yangilanganda bir zumga ochilib, keyin
 * fallback'ga otilardi.
 *
 * ── XAVFSIZLIK EMAS ──
 * Ma'lumotni server qo'riqlaydi: o'chirilgan bo'limning har bir
 * marshruti 404 qaytaradi (`CoinSwitchGuard`). Bu qo'riqchi faqat
 * odamni bo'sh xato ekraniga emas, tushunarli joyga olib boradi.
 *
 * @param requireMarket  do'kon ham ochiq bo'lishi shartmi
 */
const CoinGuard = ({ requireMarket = false, children, fallback = "/" }) => {
  const { enabled, marketEnabled, isLoading } = useCoinConfig();

  if (isLoading) return null;
  if (!enabled) return <Navigate to={fallback} replace />;
  if (requireMarket && !marketEnabled) return <Navigate to={fallback} replace />;

  return children || <Outlet />;
};

export default CoinGuard;
