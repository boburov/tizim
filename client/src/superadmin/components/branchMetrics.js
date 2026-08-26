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

/**
 * ══════════════════════════════════════════════════════════════════════
 * DAVR REYESTRI — GRAFIK SARLAVHASIDAGI TANLAGICH
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA KO'RSATKICH TANLAGICHI O'RNIDA ──
 * Sarlavhaning o'ng chetida ilgari KO'RSATKICH tanlagichi turardi. U
 * ORTIQCHA edi: grafik ostidagi oltita kartochka aynan shu vazifani
 * bajaradi (`aria-pressed` bilan) va ular ayni paytda qiymatni ham
 * ko'rsatadi. Bitta narsani ikki joydan boshqarish — foydalanuvchi
 * uchun "ular boshqa-boshqa narsami?" degan ortiqcha savol.
 *
 * DAVR esa hech qayerdan boshqarilmasdi: ekran QOTIB joriy oyni
 * ko'rsatardi va "o'tgan oy qanday edi?" degan eng oddiy savolga
 * javob berish uchun boshqa sahifaga o'tish kerak edi.
 *
 * ── OXIRI DOIM JORIY OY BILAN CHEKLANADI ──
 * "Bu yil" 31-dekabrgacha emas, JORIY OY oxirigacha. Ikki sabab:
 *   1. Server oylik qatorni `to` dan orqaga 12 oy qilib quradi —
 *      31-dekabr berilsa grafik oxirida to'rtta BO'SH oy paydo
 *      bo'lardi va u "daromad tushib ketdi" bo'lib o'qilardi.
 *   2. Kelajakdagi kunni davr oxiri deb ko'rsatish — kassa qoldig'i
 *      "shu sanaga" deb yozilgani uchun ochiqdan-ochiq yolg'on.
 * Ya'ni "Bu chorak" va "Bu yil" — DAVR BOSHIDAN BUGUNGACHA.
 */
/**
 * ⚠ `hint` FAQAT TUSHUNTIRISH KERAK BO'LGANDA. "Bu oy" va "O'tgan oy"
 * o'zini o'zi aytadi va yonida aniq oy ham yozilgan — u yerga yana bir
 * izoh qo'yish sarlavha ostidagi asos qatorini uzaytiradi, xolos.
 * "Bu chorak" esa avgustda ATIGI IKKI oyni qamraydi va bu tushuntirishsiz
 * xatoga o'xshab ko'rinadi.
 */
export const PERIODS = [
  { key: "month", label: "Bu oy", hint: null },
  { key: "prevMonth", label: "O'tgan oy", hint: null },
  { key: "quarter", label: "Bu chorak", hint: "chorak boshidan joriy oygacha" },
  { key: "year", label: "Bu yil", hint: "yil boshidan joriy oygacha" },
];

export const DEFAULT_PERIOD = "month";

export const findPeriod = (key) =>
  PERIODS.find((p) => p.key === key) || PERIODS[0];

const pad2 = (v) => String(v).padStart(2, "0");

/** `YYYY-MM-DD` — server `analyticsFilterSchema` aynan shu shaklni kutadi. */
const ymd = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

/** Oyning oxirgi kuni. `month` — 1 dan boshlanadi. */
const lastDayOf = (year, month) => new Date(year, month, 0).getDate();

/** Davrning boshlanish va tugash OYI (ikkalasi ham 1..12). */
const periodMonths = (key, today) => {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  if (key === "prevMonth") {
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    return { fromYear: y, fromMonth: m, toYear: y, toMonth: m };
  }
  if (key === "quarter") {
    // Chorak boshi: 1, 4, 7 yoki 10-oy.
    const start = Math.floor((month - 1) / 3) * 3 + 1;
    return { fromYear: year, fromMonth: start, toYear: year, toMonth: month };
  }
  if (key === "year") {
    return { fromYear: year, fromMonth: 1, toYear: year, toMonth: month };
  }
  return { fromYear: year, fromMonth: month, toYear: year, toMonth: month };
};

/**
 * Tanlangan davrning server filtri: `{ from, to }`.
 *
 * ⚠ `toISOString()` ISHLATILMAYDI: u sanani UTC ga surib yuboradi va
 * UTC+5 da 1-avgust soat 00:00 "31-iyul" bo'lib ketardi — ya'ni davr
 * bir kunga siljib, oyning birinchi kunidagi to'lovlar tushib qolardi.
 * Shuning uchun sana MAHALLIY qismlardan qo'lda yig'iladi.
 */
export const periodRange = (key, today = new Date()) => {
  const { fromYear, fromMonth, toYear, toMonth } = periodMonths(key, today);
  return {
    from: ymd(fromYear, fromMonth, 1),
    to: ymd(toYear, toMonth, lastDayOf(toYear, toMonth)),
  };
};

/**
 * Davrning ODAM O'QIYDIGAN yozuvi — "Bu yil" o'zi qaysi oylarni
 * qamraganini aytmaydi, shuning uchun ekranda yonida shu turadi.
 */
export const periodRangeLabel = (key, today = new Date()) => {
  const { fromYear, fromMonth, toYear, toMonth } = periodMonths(key, today);
  const start = MONTH_LABELS[fromMonth - 1];
  const end = MONTH_LABELS[toMonth - 1];
  if (fromYear === toYear && fromMonth === toMonth) return `${start} ${toYear}`;
  if (fromYear === toYear) return `${start}–${end} ${toYear}`;
  return `${start} ${fromYear} – ${end} ${toYear}`;
};
