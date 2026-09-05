import { Landmark } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";

import LogUserCell from "./LogUserCell";

/**
 * MOLIYAVIY AUDIT IZI — `FinancialAuditLog`.
 *
 * ── NEGA ALOHIDA JADVAL ──
 * Bu yerdagi eng qimmatli ustun — SUMMA O'ZGARISHI
 * (`amountBefore` → `amountAfter`). `ActivityLogsTable` da bunday
 * ustun yo'q va bo'lishi ham mumkin emas: u HTTP izini ko'rsatadi.
 *
 * ⚠ SUMMA `null` BO'LISHI MUMKIN va bu XATO EMAS — har bir moliyaviy
 * o'zgarish summaga tegmaydi (masalan izoh tahriri). `|| 0` YOZILMAYDI:
 * u "0 so'm bo'ldi" degan ISHONCHLI YOLG'ON chizardi. Bo'lmagan
 * qiymat "—" bilan ko'rsatiladi.
 */
const Amount = ({ before, after }) => {
  const hasBefore = Number.isFinite(before);
  const hasAfter = Number.isFinite(after);
  if (!hasBefore && !hasAfter) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const grew = hasBefore && hasAfter && after > before;
  const shrank = hasBefore && hasAfter && after < before;

  return (
    <span className="whitespace-nowrap text-sm">
      {hasBefore && (
        <span className="text-muted-foreground line-through">
          {formatMoney(before)}
        </span>
      )}
      {hasBefore && hasAfter && <span className="px-1.5">→</span>}
      {hasAfter && (
        <span
          className={cn(
            "font-medium",
            grew && "text-emerald-700 dark:text-emerald-300",
            shrank && "text-rose-700 dark:text-rose-300",
            !grew && !shrank && "text-foreground",
          )}
        >
          {formatMoney(after)}
        </span>
      )}
    </span>
  );
};

const TH = ({ children, className = "" }) => (
  <th
    className={cn(
      "px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground",
      className,
    )}
  >
    {children}
  </th>
);

const FinancialAuditTable = ({ items = [] }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card py-16">
        <Landmark className="size-10 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          Bu davrda moliyaviy o'zgarish qayd etilmagan
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[900px] border-collapse">
        <thead className="bg-muted/80">
          <tr className="border-b border-border">
            <TH className="pl-6">Kim o'zgartirdi</TH>
            <TH>Amal</TH>
            <TH>Obyekt</TH>
            <TH>Summa</TH>
            <TH>Sabab</TH>
            <TH className="pr-6 text-right">Vaqt</TH>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr
              key={row._id || row.id}
              className="h-[68px] border-b border-border last:border-b-0"
            >
              <td className="max-w-[240px] py-3 pl-6 pr-4">
                <LogUserCell
                  user={row.actor}
                  userRole={row.actor?.role}
                  actorLabel={row.actorLabel}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                {row.action}
              </td>

              <td className="max-w-[220px] px-4 py-3">
                <span className="block truncate text-sm text-foreground">
                  {row.entityType}
                </span>
                {/* O'zgargan maydonlar — "nima aynan o'zgardi" savoliga
                    javob. Ular bo'lmasa qator "nimadir o'zgardi" degan
                    ma'nosiz yozuvga aylanardi. */}
                {row.changedFields?.length > 0 && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.changedFields.join(", ")}
                  </span>
                )}
              </td>

              <td className="px-4 py-3">
                <Amount
                  before={Number(row.amountBefore)}
                  after={Number(row.amountAfter)}
                />
              </td>

              <td className="max-w-[220px] px-4 py-3">
                <span className="block truncate text-sm text-muted-foreground">
                  {row.reason || "—"}
                </span>
              </td>

              <td className="w-[150px] py-3 pl-4 pr-6 text-right text-sm text-foreground">
                {formatDateUz(row.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FinancialAuditTable;
