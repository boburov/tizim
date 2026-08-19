// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

/**
 * TAQQOSLASH JADVALI - ustun ta'rifi bilan boshqariladigan prezentatsion
 * komponent.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA BITTA JADVAL, UCHTA EMAS
 *
 * Moliya, o'qituvchi va sotuv jadvallarining TUZILISHI bir xil: chap
 * ustun - filial nomi, qolgani - raqamlar. Uch nusxa yozilsa, "yo'q
 * qiymat qanday ko'rsatiladi" degan qoida uch joyda takrorlanardi va
 * bittasida `|| 0` paydo bo'lishi uchun bitta shoshilinch tuzatish
 * yetardi. Bu yerda qoida BITTA joyda:
 *
 *   son emas  ->  "—"   (0 EMAS: "o'lchanmagan" va "nol" boshqa gap)
 *
 * `null` ni 0 deb chizish rahbariyat ekranida eng qimmat xato: u
 * "yomon ishlayapti" degan yolg'on xabar beradi va tekshirilmaydi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * USTUN TA'RIFI:
 *   key    - qator maydonining nomi
 *   label  - sarlavha
 *   format - "money" | "percent" | "number" | "days"
 *   tone   - "signed" bo'lsa musbat/manfiy rangda (faqat sof natija uchun)
 *   hint   - sarlavha ustidagi izoh (title)
 */
const fmt = (value, format) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (format === "money") return formatMoney(value);
  if (format === "percent") return `${value}%`;
  if (format === "days") return `${value} kun`;
  return String(value);
};

const CompareTable = ({ rows = [], columns = [], minWidth = 680 }) => (
  <div className="overflow-x-auto rounded-md border">
    <table className="w-full text-sm" style={{ minWidth }}>
      <thead>
        <tr className="border-b bg-muted/50 text-left">
          <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Filial
          </th>
          {columns.map((c) => (
            <th
              key={c.key}
              title={c.hint}
              className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.branchId} className="border-b last:border-0">
            {/* FILIAL NOMI HAVOLA EMAS: `/owner/branches/:id` marshruti
                mavjud emas (bor: branches, branches/compare,
                branches/stats). Chuqur havola 404 berardi. */}
            <td className="whitespace-nowrap px-3 py-2.5 font-medium text-foreground">
              {r.name || "—"}
            </td>

            {columns.map((c) => {
              const text = fmt(r[c.key], c.format);
              const signed = c.tone === "signed" && typeof r[c.key] === "number";
              return (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-2.5 text-right tabular-nums",
                    signed &&
                      (r[c.key] >= 0
                        ? "font-medium text-emerald-600 dark:text-emerald-400"
                        : "font-medium text-rose-600 dark:text-rose-400"),
                  )}
                >
                  {text ?? <span className="text-muted-foreground">—</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default CompareTable;
