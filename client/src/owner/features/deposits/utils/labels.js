// Depozit ledger turlari uchun yorliq + rang (kirim/chiqim/qoplama/qaytarim)
export const DEPOSIT_KIND = {
  topup: { label: "Kirim", tone: "text-emerald-600 dark:text-emerald-300", sign: "+" },
  withdraw: { label: "Chiqim", tone: "text-rose-600 dark:text-rose-300", sign: "−" },
  apply: { label: "Qoplandi", tone: "text-sky-600 dark:text-sky-300", sign: "−" },
  refund: { label: "Qaytarildi", tone: "text-amber-600 dark:text-amber-300", sign: "+" },
};

export const kindMeta = (kind) =>
  DEPOSIT_KIND[kind] || { label: kind, tone: "text-foreground", sign: "" };

export const methodLabel = (m) => (m === "card" ? "Karta" : "Naqd");
