// Icons
import { PlugZap } from "lucide-react";

// Components
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";

// Utils
import { cn } from "@/shared/utils/cn";

// Contract
import { DATA_STATUS } from "./dataStatus";

/** Holat -> qisqa o'zbekcha matn. IKKALA variant ham shundan oziqlanadi. */
export const STATUS_TEXT = Object.freeze({
  [DATA_STATUS.EMPTY]: {
    title: "Ma'lumot yo'q",
    hint: "Tanlangan davr uchun yozuv topilmadi.",
  },
  [DATA_STATUS.NOT_CONNECTED]: {
    title: "Manba ulanmagan",
    hint: "Bu ko'rsatkich ma'lumot manbai ulangach chiqadi.",
  },
  [DATA_STATUS.IDLE]: {
    title: "Tanlov kutilmoqda",
    hint: "Ko'rsatish uchun davr yoki filialni tanlang.",
  },
  [DATA_STATUS.ERROR]: {
    title: "Yuklab bo'lmadi",
    hint: "Tarmoq yoki server xatosi.",
  },
});

const messageOf = (error) =>
  error?.response?.data?.message || error?.message || undefined;

/**
 * MA'LUMOT HOLATI QOBIG'I.
 *
 * `children` FUNKSIYA sifatida beriladi va u FAQAT `ready` holatida
 * chaqiriladi. Bu ataylab: oddiy JSX bola bo'lganida React uni holatdan
 * qat'i nazar hisoblab qo'yardi va ichidagi `data.total` `undefined`
 * ga tegib yiqilardi - yoki yomoni, `|| 0` bilan yopilib, yolg'on
 * raqam chiqarardi.
 *
 * Render-prop bilan esa "ma'lumotsiz ko'rsatish" TEXNIK JIHATDAN
 * mumkin emas: `data` faqat funksiya argumenti sifatida mavjud.
 *
 *   <DataState status={status} data={data} onRetry={refetch}>
 *     {(d) => <p>{d.total}</p>}
 *   </DataState>
 */
const DataState = ({
  status,
  data,
  error,
  onRetry,
  children,

  /**
   * `block`  - to'liq kartalar (EmptyState / ErrorState). Bo'lim va
   *            grafik uchun.
   * `inline` - bir qatorlik matn. KPI plitasi ichida to'liq karta
   *            plitaning o'zidan kattaroq bo'lib ketardi.
   *
   * IKKALA VARIANT BIR XIL MANTIQQA tayanadi - farqi faqat ko'rinishda.
   * Shu sababli holat matnlari yuqorida BITTA joyda turadi: aks holda
   * plitada "Manba ulanmagan", bo'limda "Ulanmagan" deb yozilib,
   * foydalanuvchi ularni ikki xil holat deb o'ylardi.
   */
  variant = "block",

  // Har holat uchun moslash
  skeleton,
  skeletonClassName = "h-32",
  emptyTitle,
  emptyHint,
  emptyIcon,
  emptyAction,
  errorTitle,
  idleTitle,
  idleHint,
  notConnectedTitle,
  notConnectedHint,

  compact = false,
  className = "",
}) => {
  // READY birinchi - eng tez-tez uchraydigan yo'l.
  if (status === DATA_STATUS.READY) {
    return typeof children === "function" ? children(data) : children;
  }

  if (status === DATA_STATUS.LOADING) {
    if (skeleton) return skeleton;
    return (
      <Skeleton
        className={cn(
          variant === "inline" ? "h-8 w-2/3" : skeletonClassName,
          className,
        )}
      />
    );
  }

  const preset = STATUS_TEXT[status] || STATUS_TEXT[DATA_STATUS.EMPTY];
  const override = {
    [DATA_STATUS.EMPTY]: { title: emptyTitle, hint: emptyHint },
    [DATA_STATUS.NOT_CONNECTED]: { title: notConnectedTitle, hint: notConnectedHint },
    [DATA_STATUS.IDLE]: { title: idleTitle, hint: idleHint },
    [DATA_STATUS.ERROR]: { title: errorTitle, hint: messageOf(error) },
  }[status] || {};

  const title = override.title ?? preset.title;
  const hint = override.hint ?? preset.hint;

  // ── INLINE ──────────────────────────────────────────────────────
  if (variant === "inline") {
    return (
      <div className={className}>
        <p className="text-xl font-semibold tracking-tight text-muted-foreground">
          {title}
        </p>
        {status === DATA_STATUS.ERROR && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-0.5 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Qaytadan urinish
          </button>
        )}
      </div>
    );
  }

  // ── BLOCK ───────────────────────────────────────────────────────
  if (status === DATA_STATUS.ERROR) {
    return (
      <ErrorState
        title={title}
        message={hint}
        onRetry={onRetry}
        compact={compact}
        className={className}
      />
    );
  }

  // ULANMAGAN — BO'SHDAN ALOHIDA.
  //
  // "Bu oy to'lov bo'lmagan" va "to'lovlar moduli hali ko'chirilmagan"
  // bir xil ko'rinsa, owner texnik holatni biznes fakti deb o'qiydi va
  // yo'q muammoni tekshira boshlaydi.
  return (
    <EmptyState
      icon={status === DATA_STATUS.NOT_CONNECTED ? PlugZap : emptyIcon}
      title={title}
      description={hint}
      action={status === DATA_STATUS.EMPTY ? emptyAction : null}
      compact={compact}
      className={cn(
        status === DATA_STATUS.NOT_CONNECTED && "border-dashed",
        className,
      )}
    />
  );
};

export default DataState;
