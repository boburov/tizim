// Icons
import { Clock, CheckCircle2, PackageCheck, Truck, XCircle, Ban } from "lucide-react";

// Components
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";

/**
 * BUYURTMA HOLATI.
 *
 * ⚠ KALITLAR SERVER ENUMI BILAN AYNAN BIR XIL
 * (`server/src/common/constants/coin.ts` → `MARKET_ORDER_STATUSES`,
 * u esa Prisma `MarketOrderStatus` bilan bir xil). Bu yerda bittasi
 * yozilmasa badge JIMGINA bo'sh chiqardi va foydalanuvchi buyurtmasi
 * qaysi bosqichda ekanini bilmasdi.
 */
export const ORDER_STATUS_META = Object.freeze({
  pending: { label: "Tasdiq kutilmoqda", tone: "warning", icon: Clock },
  approved: { label: "Tasdiqlandi", tone: "info", icon: CheckCircle2 },
  ready: { label: "Olib ketishga tayyor", tone: "info", icon: PackageCheck },
  delivered: { label: "Topshirildi", tone: "success", icon: Truck },
  rejected: { label: "Rad etildi", tone: "danger", icon: XCircle },
  canceled: { label: "Bekor qilindi", tone: "neutral", icon: Ban },
});

const OrderStatusBadge = ({ status, className }) => {
  const meta = ORDER_STATUS_META[status];
  // Noma'lum holat — kalitning O'ZI ko'rsatiladi. Bo'sh badge
  // "hech narsa bo'lmadi" degan yolg'on taassurot berardi.
  if (!meta) return <StatusBadge tone="neutral" className={className}>{status || "—"}</StatusBadge>;

  return (
    <StatusBadge tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </StatusBadge>
  );
};

export default OrderStatusBadge;
