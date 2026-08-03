import { Check, Ban, Clock, UserX, AlertTriangle } from "lucide-react";

/**
 * Yetkazish holatlarining ko'rinishi.
 *
 * "blocked" va "no_bot" ATAYLAB ikki xil: birinchisida o'quvchi botni
 * ochgan-u keyin bloklagan, ikkinchisida umuman kirmagan. O'qituvchi
 * uchun yechim ham har xil - biriga "blokdan chiqar", ikkinchisiga
 * "botga kir" deb aytish kerak.
 *
 * Komponentdan ALOHIDA fayl: bitta modul ham komponent, ham konstanta
 * eksport qilsa Fast Refresh ishlamay qoladi (eslint shuni ushlaydi).
 */
export const DELIVERY_STATUS_META = {
  delivered: { label: "Yetkazildi", tone: "success", icon: Check },
  pending: { label: "Navbatda", tone: "info", icon: Clock },
  blocked: { label: "Botni bloklagan", tone: "danger", icon: Ban },
  no_bot: { label: "Botga kirmagan", tone: "warning", icon: UserX },
  failed: { label: "Xato", tone: "danger", icon: AlertTriangle },
};

export const deliveryStatusMeta = (status) =>
  DELIVERY_STATUS_META[status] || DELIVERY_STATUS_META.pending;
