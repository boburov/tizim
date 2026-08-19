import { useMemo } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";
import Button from "@/shared/components/ui/button/Button";
import { MONTH_OPTIONS } from "@/shared/constants/calendar";
import { cn } from "@/shared/utils/cn";

/**
 * MOLIYA FILTR PANELI — barcha moliya sahifalari uchun yagona.
 *
 * ═══════════════════════════════════════════════════════════════════
 * FILIAL BU YERDA YO'Q — VA BU ATAYLAB
 *
 * Ilovada filial ALLAQACHON global tanlagich orqali boshqariladi
 * (`useActiveBranch` → `x-branch-id` sarlavhasi), va u almashganda
 * BARCHA so'rovlar bekor qilinadi.
 *
 * Bu yerga ikkinchi filial tanlagichi qo'yilsa ikkita raqobatlashuvchi
 * "joriy filial" tushunchasi paydo bo'lardi: tepadagi bittasini,
 * moliya paneli boshqasini ko'rsatib turardi va foydalanuvchi qaysi
 * biri amal qilayotganini bilmasdi. Shuning uchun filial — global,
 * bu panel esa DAVR va O'LCHOVLAR bilan shug'ullanadi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * `slots` — bo'limga xos qo'shimcha filtrlar. Har bo'lim faqat O'ZIGA
 * kerakligini beradi (talab: "Only show filters that are useful for
 * the current section"). Xona tahlilida o'qituvchi filtri ko'rsatish
 * ekranni to'ldiradi, lekin hech qanday savolga javob bermaydi.
 */

const monthOptions = MONTH_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));

const GRANULARITY = [
  { value: "day", label: "Kunlik" },
  { value: "week", label: "Haftalik" },
  { value: "month", label: "Oylik" },
];

const FinanceFilterBar = ({
  filters,
  onChange,
  onReset,
  activeCount = 0,
  showGranularity = false,
  slots = null,
  className,
}) => {
  const year = filters.year || String(new Date().getFullYear());
  const month = filters.month || String(new Date().getMonth() + 1);

  // Tez tanlov: eng ko'p so'raladigan uch davr. Ular `year/month` ga
  // tarjima qilinadi — server ikkala shaklni ham tushunadi, lekin
  // aralashtirilmasligi kerak (qarang useFinanceFilters).
  const quick = useMemo(() => {
    const now = new Date();
    const cur = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [
      { key: "cur", label: "Bu oy", patch: { year: cur.year, month: cur.month } },
      {
        key: "prev",
        label: "O'tgan oy",
        patch: { year: prevDate.getFullYear(), month: prevDate.getMonth() + 1 },
      },
      { key: "year", label: "Yil", patch: { year: cur.year, month: null } },
    ];
  }, []);

  const isActive = (patch) =>
    String(filters.year || "") === String(patch.year) &&
    String(filters.month || "") === String(patch.month ?? "");

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3",
        className,
      )}
    >
      {/* Tez davr tanlovi */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {quick.map((q) => (
          <button
            key={q.key}
            type="button"
            onClick={() => onChange(q.patch)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition",
              isActive(q.patch)
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Aniq oy/yil */}
      <div className="w-32">
        <SelectField
          value={String(month)}
          onChange={(v) => onChange({ month: v })}
          options={monthOptions}
          className="!gap-1"
        />
      </div>
      <div className="w-28">
        <SelectYear
          label=""
          value={Number(year)}
          onChange={(v) => onChange({ year: v })}
          className="!gap-1"
        />
      </div>

      {showGranularity && (
        <div className="w-32">
          <SelectField
            value={filters.granularity || ""}
            onChange={(v) => onChange({ granularity: v })}
            options={[{ value: "", label: "Avto" }, ...GRANULARITY]}
            className="!gap-1"
          />
        </div>
      )}

      {/* Bo'limga xos filtrlar */}
      {slots}

      <div className="ml-auto flex items-center gap-2">
        {activeCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            <SlidersHorizontal className="size-3" />
            {activeCount} filtr
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={onReset} title="Filtrlarni tozalash">
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </div>
  );
};

export default FinanceFilterBar;
