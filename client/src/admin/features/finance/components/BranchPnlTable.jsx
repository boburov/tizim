// Router
import { Link } from "react-router-dom";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

/**
 * FILIALLAR KESIMI JADVALI - SOF PREZENTATSION.
 *
 * `rows` shakli (server `/branch-analytics/pnl` javobidan):
 *   { branchId, branchName, income, expense, net }
 *
 * YO'Q MAYDON KO'RSATILMAYDI. Masalan `net` kelmasa u O'RNIDA
 * `income - expense` HISOBLANMAYDI: serverdagi sof foyda ta'rifi
 * boshqa bo'lishi mumkin (ichki o'tkazmalar, amortizatsiya), va
 * mijozda qayta hisoblash ikki xil raqam paydo qilardi.
 */
const BranchPnlTable = ({ rows = [] }) => (
  <div className="overflow-x-auto rounded-md border">
    <table className="w-full min-w-[520px] text-sm">
      <thead>
        <tr className="border-b bg-muted/50 text-left">
          <Th>Filial</Th>
          <Th align="right">Kirim</Th>
          <Th align="right">Chiqim</Th>
          <Th align="right">Sof</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const net = typeof r.net === "number" ? r.net : null;
          return (
            <tr key={r.branchId} className="border-b last:border-0">
              <td className="px-3 py-2.5">
                <Link
                  to={`/owner/branches/${r.branchId}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {r.branchName || "—"}
                </Link>
              </td>
              <Td value={r.income} />
              <Td value={r.expense} />
              <td
                className={cn(
                  "px-3 py-2.5 text-right tabular-nums font-medium",
                  net === null
                    ? "text-muted-foreground"
                    : net >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                )}
              >
                {net === null ? "—" : formatMoney(net)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const Th = ({ children, align = "left" }) => (
  <th
    className={cn(
      "px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground",
      align === "right" && "text-right",
    )}
  >
    {children}
  </th>
);

/** Raqam yo'q bo'lsa "—". Nol EMAS: ular boshqa ma'no. */
const Td = ({ value }) => (
  <td className="px-3 py-2.5 text-right tabular-nums">
    {typeof value === "number" ? (
      formatMoney(value)
    ) : (
      <span className="text-muted-foreground">—</span>
    )}
  </td>
);

export default BranchPnlTable;
