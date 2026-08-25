// Icons
import {
  Wallet, TrendingDown, PiggyBank, Banknote, HandCoins, GraduationCap,
} from "lucide-react";

// Utils
import { formatMoney, formatMoneyShort } from "@/shared/utils/formatMoney";

/**
 * BOSH EKRAN GRAFIGINING KO'RSATKICH REYESTRI.
 *
 * ── NEGA ALOHIDA FAYL ──
 * Bu ro'yxatni `BranchMetricChart.jsx` ichida qoldirib bo'lmaydi:
 * komponent faylidan konstanta eksport qilinsa Vite'ning fast-refresh
 * mexanizmi buziladi (`react-refresh/only-export-components` qoidasi
 * lint bosqichida ushlaydi) — tahrir qilinganda butun sahifa qaytadan
 * yuklanardi va grafik tanlovi har safar nolga tushardi.
 *
 * ── HAR MAYDON NIMA UCHUN ──
 *   kind      — formatlash: pul / foiz / dona. O'q, tooltip va
 *               kartaning hammasi SHU YERDAN oladi, ya'ni bir joyda
 *               "so'm", boshqa joyda quruq raqam chiqib qolmaydi.
 *   additive  — filiallar yig'indisi ma'noga egami. Marja uchun YO'Q:
 *               ikki filialning foizini qo'shib bo'lmaydi, shuning
 *               uchun unda "jamidagi ulush" ham ko'rsatilmaydi.
 *   hint      — raqamning ASOSI. Foizning maxraji aytilmasa uni
 *               tekshirib bo'lmaydi (kodbaza qoidasi).
 */
export const METRICS = [
  {
    key: "revenue",
    label: "Daromad",
    icon: Wallet,
    kind: "money",
    additive: true,
    hint: "Qaytarimlar ayirilgan · filiallararo o'tkazmalarsiz",
  },
  {
    key: "expense",
    label: "Chiqim",
    icon: TrendingDown,
    kind: "money",
    additive: true,
    hint: "Maosh ham shu yerda",
  },
  {
    key: "profitMarginPercent",
    label: "Foyda marjasi",
    icon: PiggyBank,
    kind: "percent",
    additive: false,
    hint: "Sof natija ÷ daromad · markaz xarajatlari taqsimlanmaydi",
  },
  {
    key: "cashBalance",
    label: "Kassadagi pul",
    icon: Banknote,
    kind: "money",
    additive: true,
    hint: "Davr oxiriga · barcha hisoblar yig'indisi",
  },
  {
    key: "outstanding",
    label: "Qarzdorlik",
    icon: HandCoins,
    kind: "money",
    additive: true,
    hint: "To'lanmagan majburiyat",
  },
  {
    key: "students",
    label: "O'quvchilar",
    icon: GraduationCap,
    kind: "count",
    additive: true,
    hint: "Davr ichida to'lov rejasi bo'lgan o'quvchilar",
  },
];

/**
 * "Barcha filiallar" — SENTINEL, bo'sh satr EMAS.
 *
 * `Select` bo'sh qiymatni "tanlanmagan" deb o'qiydi va placeholder
 * ko'rsatadi. "Barcha filiallar" esa TANLOV: u standart holat va
 * ekranda ochiq yozilib turishi kerak.
 */
export const ALL_BRANCHES_VALUE = "__all__";

export const MONTH_LABELS = [
  "Yan", "Fev", "Mar", "Apr", "May", "Iyn",
  "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek",
];

export const findMetric = (key) =>
  METRICS.find((m) => m.key === key) || METRICS[0];

/**
 * TO'LIQ QIYMAT — sarlavha, tooltip va karta uchun.
 *
 * ⚠ `null` "—" bo'lib chiqadi, `0` EMAS. Daromadsiz filialning
 * marjasi o'lchanmagan, nol emas — bu farq rahbariyat ekranida eng
 * qimmat farq.
 */
export const formatMetric = (value, kind) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (kind === "money") return formatMoney(value);
  if (kind === "percent") return `${value}%`;
  return `${value.toLocaleString("uz-UZ")} ta`;
};

/** QISQA QIYMAT — o'q belgisi va ustun yorlig'i uchun (joy tor). */
export const formatMetricShort = (value, kind) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (kind === "money") return formatMoneyShort(value).replace(" so'm", "");
  if (kind === "percent") return `${value}%`;
  return value.toLocaleString("uz-UZ");
};
