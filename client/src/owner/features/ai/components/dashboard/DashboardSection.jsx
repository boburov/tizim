import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/utils/cn";

// BO'LIM QOBIG'I - sahifadagi HAR BIR bo'lim shu qolipdan chiqadi.
//
// NEGA QOLIP: ierarxiya ko'z bilan o'lchanadi, ta'rif bilan emas.
// Har bir bo'lim o'z sarlavhasini o'zi yozsa, biri 18px, ikkinchisi
// 16px bo'lib qoladi va owner ularni "bir xil darajadagi narsalar" deb
// o'qimaydi - sahifa tasodifiy kartalar to'plamiga aylanadi.
//
// SARLAVHA — SAVOL EMAS, JAVOB. Har bir bo'lim BITTA savolga javob
// beradi va sarlavha o'sha javobning nomi bo'ladi ("Kritik
// ogohlantirishlar"), `hint` esa savolni aytadi ("hozir nima buzilgan").

const DashboardSection = ({
  title,
  hint,
  count,
  to,
  toLabel = "Barchasi",
  children,
  className = "",
}) => (
  <section className={cn("space-y-4", className)}>
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
          {title}
          {count != null && count > 0 && (
            <span className="text-sm font-normal tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>

      {to && (
        <Link
          to={to}
          className="group inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {toLabel}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </header>

    {children}
  </section>
);

/** Bo'lim ichidagi bo'sh holat - "muammo yo'q" ham natija. */
export const SectionEmpty = ({ title, hint }) => (
  <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
    <p className="text-sm font-medium text-foreground">{title}</p>
    {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
  </div>
);

export default DashboardSection;
