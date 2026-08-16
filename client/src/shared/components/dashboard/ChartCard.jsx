// Router
import { Link } from "react-router-dom";

// Icons
import { ArrowRight } from "lucide-react";

// Components
import DataState from "./DataState";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";

// Utils
import { cn } from "@/shared/utils/cn";

/**
 * GRAFIK QOBIG'I - sarlavha, davr tanlagich, holat va drill-down.
 *
 * GRAFIKNING O'ZI `children` DA. Qobiq recharts haqida ham, ma'lumot
 * shakli haqida ham hech narsa bilmaydi - u faqat "qachon ko'rsatish
 * mumkin"ligini hal qiladi.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA XULOSA RAQAMLARI (`summary`) HAM HOLATGA BO'YSUNADI
 *
 * Mavjud `CashflowChart` da xulosa bloki (Kirim / Chiqim / Sof)
 * grafikdan TASHQARIDA turadi va `isLoading` ni tekshirmaydi. Natijada
 * yuklanish paytida ekranda "0 so'm Kirim" turadi, so'rov yiqilsa esa
 * o'sha "0 so'm" JOYIDA QOLADI - grafik "Ma'lumot yo'q" deb yozadi,
 * yonidagi raqam esa ishonch bilan nol ko'rsatadi.
 *
 * Shuning uchun bu yerda xulosa ham `children` ichida, ya'ni u ham
 * faqat `ready` da chiziladi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * DAVR TANLAGICH BOSHQARILADI (controlled): `range` + `onRangeChange`.
 * Ichki `useState` bo'lsa, sahifadagi ikki grafik turli davrni
 * ko'rsatib turishi mumkin edi va ular yonma-yon solishtirib
 * bo'lmaydigan bo'lib qolardi.
 */
const ChartCard = ({
  title,
  hint,

  // Ma'lumot shartnomasi
  status,
  data,
  error,
  onRetry,
  children,

  // Davr tanlagich (ixtiyoriy)
  ranges,
  range,
  onRangeChange,

  // Drill-down
  to,
  toLabel = "Batafsil",

  /** Grafik maydonining balandligi. Skelet ham shu balandlikda. */
  height = "h-56",
  emptyTitle,
  emptyHint,
  notConnectedHint,

  /** Sarlavha o'ng tomoniga qo'shimcha element (masalan filtr). */
  actions,

  className = "",
}) => (
  <section
    className={cn("flex flex-col rounded-md border bg-card p-4 xs:p-5", className)}
  >
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="truncate font-semibold text-foreground">{title}</h2>
        {hint && (
          <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}

        {ranges?.length > 0 && (
          <div className="flex rounded-lg bg-muted p-0.5" role="tablist">
            {ranges.map((r) => (
              <button
                key={r.value}
                type="button"
                role="tab"
                aria-selected={range === r.value}
                onClick={() => onRangeChange?.(r.value)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition",
                  range === r.value
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {to && (
          <Link
            to={to}
            className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {toLabel}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </header>

    <div className={cn("mt-4 flex-1", height)}>
      <DataState
        status={status}
        data={data}
        error={error}
        onRetry={onRetry}
        compact
        skeleton={<Skeleton className={cn("w-full", height)} />}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
        notConnectedHint={notConnectedHint}
        className="h-full"
      >
        {children}
      </DataState>
    </div>
  </section>
);

export default ChartCard;
