import {
  Check,
  X,
  Clock,
  AlertTriangle,
  Ban,
  Wallet,
  Landmark,
  Percent,
  Tags,
  UserPlus,
  SlidersHorizontal,
} from "lucide-react";

// Polling oralig'i - "realtime" oqimning yagona manbasi.
// Bir joyda turadi: badge, bildirishnoma toast'i va drawer bir xil ritmda
// yangilanadi, aks holda badge 12 ta deb turib ro'yxatda 11 ta chiqardi.
export const POLL_MS = 15 * 1000;

// "all" - SENTINEL, bo'sh satr emas. Radix Tabs bo'sh `value` ni qabul
// qilmaydi (trigger tanlanmay qoladi), shuning uchun so'rovga uzatishdan
// oldin `statusParam()` uni bo'shga aylantiradi.
export const STATUS_ALL = "all";

export const STATUS_TABS = [
  { value: "pending", label: "Kutilmoqda" },
  { value: "executed", label: "Bajarilgan" },
  { value: "rejected", label: "Rad etilgan" },
  { value: "failed", label: "Xato" },
  { value: STATUS_ALL, label: "Barchasi" },
];

export const CATEGORY_OPTIONS = [
  { value: "", label: "Barcha kategoriyalar" },
  { value: "financial", label: "Chiqimlar" },
  { value: "configuration", label: "Sozlamalar" },
];

export const KIND_OPTIONS = [
  { value: "", label: "Barcha turlar" },
  { value: "salary_payment", label: "O'qituvchi maoshi" },
  { value: "deposit_withdraw", label: "Depozitdan yechish" },
  { value: "salary_terms", label: "Maosh stavkasi" },
  { value: "discount_set", label: "O'quvchi chegirmasi" },
  { value: "group_fee_set", label: "Guruh oylik narxi" },
  { value: "staff_hire", label: "Ishga olish" },
];

export const SORT_OPTIONS = [
  { value: "-createdAt", label: "Avval yangilari" },
  { value: "createdAt", label: "Avval eskilari" },
  { value: "-amount", label: "Katta summa" },
  { value: "amount", label: "Kichik summa" },
];

export const KIND_LABELS = {
  salary_payment: "O'qituvchi maoshi",
  deposit_withdraw: "Depozitdan yechish",
  salary_terms: "Maosh stavkasi",
  discount_set: "O'quvchi chegirmasi",
  group_fee_set: "Guruh oylik narxi",
  staff_hire: "Ishga olish",
};

// Tur -> ikonka va rang. Jadvalning birinchi ustunida, toast'da va
// drawer'da BIR XIL ko'rinishi uchun shu yerda saqlanadi.
export const KIND_META = {
  salary_payment: { icon: Wallet, cls: "bg-violet-100 text-violet-600" },
  deposit_withdraw: { icon: Landmark, cls: "bg-sky-100 text-sky-600" },
  salary_terms: { icon: SlidersHorizontal, cls: "bg-indigo-100 text-indigo-600" },
  discount_set: { icon: Percent, cls: "bg-teal-100 text-teal-600" },
  group_fee_set: { icon: Tags, cls: "bg-cyan-100 text-cyan-600" },
  staff_hire: { icon: UserPlus, cls: "bg-fuchsia-100 text-fuchsia-600" },
};

export const CATEGORY_LABELS = {
  financial: "Chiqim",
  configuration: "Sozlama",
};

export const STATUS_META = {
  pending: {
    label: "Kutilmoqda",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
  },
  approved: {
    label: "Tasdiqlandi",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
    icon: Check,
  },
  executed: {
    label: "Bajarildi",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: Check,
  },
  rejected: {
    label: "Rad etildi",
    cls: "bg-red-50 text-red-700 border-red-200",
    icon: X,
  },
  canceled: {
    label: "Bekor qilindi",
    cls: "bg-zinc-100 text-zinc-600 border-zinc-200",
    icon: Ban,
  },
  failed: {
    label: "Xato",
    cls: "bg-red-50 text-red-700 border-red-200",
    icon: AlertTriangle,
  },
};
