// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

/**
 * FILIALLAR KESIMI JADVALI - SOF PREZENTATSION.
 *
 * `rows` shakli SERVERDAN olingan (`branchPnl.service.js`, `pnl()`):
 *   { branchId, name, code, revenue, expense, shortage, net, margin }
 *
 * ⚠ ILGARI BU YERDA `{ branchName, income }` YOZILGAN EDI - bunday
 * maydonlar serverda YO'Q, ya'ni jadval hamma qatorda "—" ko'rsatardi.
 * Bundan ham yomoni: hook butun KONVERTNI (`{items, totals, ...}`)
 * uzatardi va `rows.map is not a function` bilan BUTUN ILOVA qulardi.
 * Ikkalasi ham tuzatildi (qarang `useExecutiveData.js`, useBranchPnlData).
 *
 * KAMOMAD (`shortage`) ALOHIDA USTUN. Serverdagi izohga ko'ra u
 * xarajat EMAS, YO'QOTISH: xarajatga qo'shib yuborilsa "xarajat oshdi"
 * bo'lib ko'rinardi va sababi yashirinardi.
 *
 * YO'Q MAYDON KO'RSATILMAYDI. `net` kelmasa u O'RNIDA
 * `revenue - expense` HISOBLANMAYDI: serverdagi ta'rif markaz
 * xarajatlarini QAMRAMAYDI (u yerdagi izohga qarang), mijozda qayta
 * hisoblash esa ikki xil raqam paydo qilardi.
 */
const BranchPnlTable = ({ rows = [] }) => (
  <div className="overflow-x-auto rounded-md border">
    <table className="w-full min-w-[680px] text-sm">
      <thead>
        <tr className="border-b bg-muted/50 text-left">
          <Th>Filial</Th>
          <Th align="right">Daromad</Th>
          <Th align="right">Xarajat</Th>
          <Th align="right">Kamomad</Th>
          <Th align="right">Sof</Th>
          <Th align="right">Marja</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const net = typeof r.net === "number" ? r.net : null;
          return (
            <tr key={r.branchId} className="border-b last:border-0">
              {/* FILIAL NOMI HAVOLA EMAS.
                  `/owner/branches/:id` degan marshrut MAVJUD EMAS
                  (bor: `branches`, `branches/compare`, `branches/stats`,
                  `branches/limits`), `branches/stats` esa filialni
                  URL'dan emas, faol filial kontekstidan oladi. Ya'ni
                  har qanday chuqur havola yo 404 berardi, yo boshqa
                  filial ma'lumotini ochardi. Bo'lim sarlavhasidagi
                  "Filiallar" havolasi ro'yxatga olib boradi. */}
              <td className="px-3 py-2.5 font-medium text-foreground">
                {r.name || "—"}
              </td>
              <Td value={r.revenue} />
              <Td value={r.expense} />
              <Td value={r.shortage} />
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
              {/* Marja - FOIZ, so'm emas. Server daromad nol bo'lganda
                  `null` qaytaradi ("0%" EMAS: bo'linma aniqlanmagan). */}
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {typeof r.margin === "number" ? `${r.margin}%` : "—"}
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
