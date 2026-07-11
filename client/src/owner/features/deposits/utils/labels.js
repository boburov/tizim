// Depozit ledger turlari uchun yorliq + rang (kirim/chiqim/qoplama/qaytarim)
export const DEPOSIT_KIND = {
  topup: { label: "Kirim", tone: "text-emerald-600", sign: "+" },
  withdraw: { label: "Chiqim", tone: "text-rose-600", sign: "−" },
  apply: { label: "Qoplandi", tone: "text-sky-600", sign: "−" },
  refund: { label: "Qaytarildi", tone: "text-amber-600", sign: "+" },
};

export const kindMeta = (kind) =>
  DEPOSIT_KIND[kind] || { label: kind, tone: "text-foreground", sign: "" };

export const methodLabel = (m) => (m === "card" ? "Karta" : "Naqd");
