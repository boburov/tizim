// Router
import { Link } from "react-router-dom";

// Icons
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";

// Components
import DataState from "./DataState";
import AnimatedCounter from "@/shared/components/ui/counter/AnimatedCounter";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

// Contract
import { DATA_STATUS } from "./dataStatus";

/**
 * KPI PLITASI - executive qatlamning eng kichik birligi.
 *
 * `StatCard` DAN FARQI (va nega yangisi kerak edi):
 *
 *   StatCard `value` ni to'g'ridan-to'g'ri oladi va `null` bo'lsa "-"
 *   chizadi. Ya'ni "so'rov yiqildi", "endpoint yo'q" va "haqiqatan 0"
 *   ekranda BIR XIL ko'rinadi. Moliyaviy ko'rsatkichda bu qabul qilib
 *   bo'lmaydigan noaniqlik: owner "0 so'm tushum" ni fakt deb o'qiydi.
 *
 *   KpiTile `status` talab qiladi va raqamni faqat `ready` da
 *   ko'rsatadi. Qolgan holatlar ochiq matn bilan farqlanadi.
 *
 * MA'LUMOT MANBASIGA BOG'LIQ EMAS: `status` + `value` prop orqali
 * keladi. Ularni TanStack query'dan (`fromQuery`), statik qiymatdan
 * (`fromValue`) yoki kelajakdagi boshqa manbadan olish CHAQIRUVCHINING
 * ishi - komponentga tegilmaydi. `StatCard` esa qoladi: oddiy,
 * holatsiz sanoqlar uchun u hamon to'g'ri tanlov.
 */
const KpiTile = ({
  label,
  value,
  status = DATA_STATUS.IDLE,
  error,
  onRetry,

  icon: Icon,
  hint,
  suffix = "",
  isMoney = false,
  /** Formatlash funksiyasi (`isMoney` dan ustun turadi). */
  formatter,

  /**
   * O'zgarish foizi. FAQAT KO'RSATILADI, HISOBLANMAYDI: komponent
   * o'tgan davr qiymatini bilmaydi va uni taxmin qila olmaydi.
   *
   * Server bermasa - o'zgarish umuman chiqmaydi. ATAYLAB `0%` emas:
   * "0% o'zgarish" ham da'vo va u yolg'on bo'lishi mumkin.
   */
  delta,
  /** `%` o'rniga boshqa birlik ("ta", "so'm"). */
  deltaUnit = "%",
  /** `true` bo'lsa PASAYISH yaxshi (qarzdorlar, kechikishlar). */
  invertDelta = false,

  /** Drill-down manzili. Berilsa plita bosiladigan bo'ladi. */
  to,
  onClick,

  className = "",
}) => {
  const format = formatter || (isMoney ? formatMoney : undefined);
  const interactive = Boolean(to || onClick);

  /**
   * QIYMAT HAQIQIY SON BO'LMASA - HOLAT `ready` BO'LSA HAM RAQAM CHIQMAYDI.
   *
   * IKKI XIL XAVF, ikkalasi ham jimgina "0" chiqarardi:
   *
   * 1) `null` / `undefined`. Server ba'zi ko'rsatkichni ATAYLAB `null`
   *    qaytaradi: `attendanceGauge.rate` bugun birorta dars
   *    belgilanmagan bo'lsa `null` (maxraj nol - qarang server
   *    adminDashboard.service.js, computeAttendanceGauge). Bu "0%
   *    davomat" DEGANI EMAS, "o'lchanmadi" degani.
   *
   * 2) SON BO'LMAGAN qiymat (satr, obyekt, NaN). `AnimatedCounter`
   *    `Number.isFinite` dan o'tmagan hamma narsani `0` ga aylantiradi
   *    (useCountUp, `safeTarget`). Ya'ni server `"1500000"` deb SATR
   *    qaytarsa yoki maydon nomi o'zgarib obyekt kelsa, ekranda
   *    ishonchli "0 so'm" turardi.
   *
   * Ikkinchisi ayniqsa xavfli: so'rov MUVAFFAQIYATLI, ya'ni hech
   * qanday xato belgisi ko'rinmaydi va raqam to'g'ri deb o'qiladi.
   * Shuning uchun tekshiruv `Number.isFinite` bilan QAT'IY - "0 ga
   * o'girib qo'ya qolaylik" degan zaxira ATAYLAB yo'q.
   */
  const missingValue = typeof value !== "number" || !Number.isFinite(value);
  const effectiveStatus =
    status === DATA_STATUS.READY && missingValue ? DATA_STATUS.EMPTY : status;

  const hasDelta =
    effectiveStatus === DATA_STATUS.READY &&
    typeof delta === "number" &&
    Number.isFinite(delta);

  const deltaTone = !hasDelta || delta === 0
    ? "text-muted-foreground"
    : (invertDelta ? delta < 0 : delta > 0)
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  const DeltaIcon = delta > 0 ? TrendingUp : TrendingDown;

  const showFooter = hint || interactive || hasDelta;

  const body = (
    <div
      className={cn(
        "flex h-full flex-col rounded-md border bg-card p-4 xs:p-5",
        interactive &&
          "group cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      </div>

      {/* Qiymat maydoni. `inline` variant plita o'lchamiga mos qisqa
          holat matnini beradi; raqam esa faqat `ready` da chiqadi. */}
      <DataState
        variant="inline"
        status={effectiveStatus}
        data={value}
        emptyTitle="Ma'lumot yo'q"
        error={error}
        onRetry={onRetry}
      >
        {(v) => (
          <p
            className={cn(
              "font-semibold tabular-nums tracking-tight",
              isMoney ? "break-words text-xl leading-snug" : "text-2xl",
            )}
          >
            {/* `v` bu yerga faqat haqiqiy son bo'lganda yetib keladi
                (yuqoridagi `missingValue`), shuning uchun zaxira
                qiymat ATAYLAB yo'q - u yolg'on nol chiqarardi. */}
            <AnimatedCounter value={v} formatter={format} suffix={suffix} />
          </p>
        )}
      </DataState>

      {showFooter && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {hasDelta && delta !== 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium tabular-nums",
                deltaTone,
              )}
            >
              <DeltaIcon className="size-3" />
              {delta > 0 ? "+" : ""}
              {delta}
              {deltaUnit}
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
          {interactive && (
            <ArrowUpRight className="size-3 transition group-hover:text-primary" />
          )}
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </button>
    );
  }
  return body;
};

export default KpiTile;
