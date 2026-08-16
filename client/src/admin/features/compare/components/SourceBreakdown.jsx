// Utils
import { cn } from "@/shared/utils/cn";

/**
 * KANAL KESIMI - qaysi manbadan qancha lid keldi va nechtasi yozildi.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA JADVAL EMAS, POLOSA
 *
 * Bu yerdagi savol "aniq nechta?" emas, "QAYSI kanal ishlayapti?".
 * Uzunlik hajmni, ustidagi foiz sifatni ko'rsatadi - ikkalasi bir
 * qarashda solishtiriladi. Jadvalda esa ko'z har qatorni alohida
 * o'qib, boshida yig'ishga majbur bo'lardi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ENG KO'P LID BERGAN KANAL - 100% uzunlik (maxraj `max`, `sum` EMAS).
 * Yig'indiga nisbatan chizilsa, o'nta kanali bor filialda hamma
 * polosa ingichka bo'lib, farq ko'rinmay qolardi.
 */
const SourceBreakdown = ({ items = [] }) => {
  if (!items.length) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        Bu davrda lid qayd etilmagan.
      </p>
    );
  }

  const max = Math.max(...items.map((i) => i.leads), 1);

  return (
    <ul className="space-y-2.5">
      {items.map((s) => (
        <li key={s.sourceId ?? "none"} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span
              className={cn(
                "min-w-0 truncate",
                // Manbasi ko'rsatilmagan qator - ma'lumot NUQSONI, kanal
                // emas. Bir xil ko'rinishda chizilsa u ham "kanal" deb
                // o'qilib, xulosaga qo'shilib ketardi.
                s.sourceId ? "text-foreground" : "italic text-muted-foreground",
              )}
            >
              {s.name}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {s.leads} lid
              {" · "}
              {s.enrolled} yozildi
              {/* Konversiya `null` bo'lsa umuman chizilmaydi - "0%" deb
                  ko'rsatish lid yo'q kanalni yomon ko'rsatardi. */}
              {typeof s.conversionPercent === "number" && (
                <span className="ml-1 font-medium text-foreground">
                  {s.conversionPercent}%
                </span>
              )}
            </span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.round((s.leads / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

export default SourceBreakdown;
