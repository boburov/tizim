/**
 * UMUMIY TAHLIL KOMPONENTLARI.
 *
 * Ilgari `owner/features/financeAnalytics` ichida edi. Ko'chirildi,
 * chunki universal drill-down (shared/drill) ular ustiga quriladi:
 * moliya bo'limining ichki komponentiga tayangan "umumiy" mexanizm
 * aslida umumiy bo'lmaydi.
 *
 * Ular MOLIYAGA XOS EMAS — jadval, raqam, holat va grafik. Shuning
 * uchun ko'chirish nusxa yaratmadi: eski joyda fayl QOLMADI.
 */
export { default as AnalyticsTable } from "./AnalyticsTable";
export { default as MetricValue } from "./MetricValue";
export { default as ComparisonBadge } from "./ComparisonBadge";
export { default as TrendChart } from "./TrendChart";
export {
  LoadingBlock,
  InlineLoading,
  ErrorBlock,
  EmptyBlock,
  DeniedBlock,
  QueryState,
} from "./StateBlock";

export { default as isMissing } from "./isMissing";
