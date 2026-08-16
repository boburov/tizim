// Router
import { Link } from "react-router-dom";

// Icons
import { ArrowRight } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";

/**
 * BO'LIM QOBIG'I - executive sahifadagi har bir blok shu qolipdan chiqadi.
 *
 * `ai/components/dashboard/DashboardSection.jsx` bilan bir xil dizayn
 * qoidasiga tayanadi (sarlavha = javob, `hint` = savol), lekin u
 * `owner/features/ai` ichida - ya'ni feature'ning ichki fayli. Executive
 * qatlam undan import qilsa, ikki feature bir-biriga bog'lanib qolardi
 * (FSD qoidasi: feature'ning ichki fayllariga tashqaridan murojaat yo'q).
 *
 * Shuning uchun qobiq `shared` ga ko'chirildi. AI paneli o'zinikini
 * ishlatishda davom etadi - ishlab turgan sahifani ko'chirishning
 * hozircha sababi yo'q.
 */
export const DashboardSection = ({
  title,
  hint,
  /** Sarlavha yonidagi sanoq. `0` KO'RSATILMAYDI - "0 ta muammo" quruq shovqin. */
  count,
  to,
  toLabel = "Barchasi",
  actions,
  children,
  className = "",
}) => (
  <section className={cn("space-y-3", className)}>
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
          {title}
          {typeof count === "number" && count > 0 && (
            <span className="text-sm font-normal tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </h2>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {actions}
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

    {children}
  </section>
);

/**
 * KPI TO'RI.
 *
 * MOBIL BIRINCHI: bitta ustun -> `xs` da ikki -> `lg` da to'rt.
 * `cols` faqat eng KENG holatni belgilaydi, oraliqlar qat'iy - aks
 * holda har sahifa o'z sinish nuqtasini tanlab, ekranlar bir-biriga
 * o'xshamay qolardi.
 *
 * NEGA `grid-cols-N` shablon satr sifatida yozilmaydi: Tailwind sinf
 * nomlarini statik skanerlaydi, `grid-cols-${n}` esa bilddan tushib
 * qoladi va uslub umuman qo'llanmaydi.
 */
export const KpiGrid = ({ cols = 4, children, className = "" }) => {
  const colClass = {
    2: "grid-cols-1 xs:grid-cols-2",
    3: "grid-cols-1 xs:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 xs:grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
  }[cols] || "grid-cols-1 xs:grid-cols-2 lg:grid-cols-4";

  return <div className={cn("grid gap-3 sm:gap-4", colClass, className)}>{children}</div>;
};

/**
 * ASOSIY / YON ustunli qator (grafik + ro'yxat).
 *
 * `lg` dan pastda ikkalasi ham to'liq kenglikda ustma-ust tushadi:
 * planshetda ikki ustun grafikni o'qib bo'lmaydigan darajada
 * siqib qo'yardi.
 */
export const SplitRow = ({ main, side, ratio = "2:1", className = "" }) => {
  const mainSpan = ratio === "3:1" ? "lg:col-span-3" : "lg:col-span-2";
  const gridCols = ratio === "3:1" ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:gap-4", gridCols, className)}>
      <div className={cn("min-w-0", mainSpan)}>{main}</div>
      <div className="min-w-0">{side}</div>
    </div>
  );
};

export default DashboardSection;
