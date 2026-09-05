import { Wallet } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatDateUz } from "@/shared/utils/formatDate";

import LogUserCell from "./LogUserCell";

/**
 * OYLIK AUDIT IZI — `PayrollAuditLog`.
 *
 * ── NEGA IKKI ODAM USTUNI ──
 * Bu yagona iz turi bo'lib, unda AKTYOR va NISHON har doim boshqa
 * odam: kimdir BOSHQA birovning oyligini o'zgartiradi. Bitta
 * "foydalanuvchi" ustuni savolning yarmini yo'qotardi — "kim
 * o'zgartirdi" ham, "kimning oyligi" ham kerak.
 *
 * ── DAVR USTUNI ──
 * `year`/`month` ikkalasi ham `null` bo'lishi mumkin (davrga
 * bog'lanmagan o'zgarish, masalan doimiy stavka). Shunda "—"
 * chiziladi; joriy oyni TAXMIN QILISH audit izini soxtalashtirardi.
 */
const period = (year, month) => {
  if (!year && !month) return "—";
  if (year && !month) return String(year);
  return `${String(month).padStart(2, "0")}.${year || "—"}`;
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

const PayrollAuditTable = ({ items = [] }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card py-16">
        <Wallet className="size-10 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          Bu davrda oylik bo'yicha o'zgarish qayd etilmagan
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
            <TH>Kimning oyligi</TH>
            <TH>Amal</TH>
            <TH>Davr</TH>
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
              <td className="max-w-[220px] py-3 pl-6 pr-4">
                <LogUserCell
                  user={row.actor}
                  userRole={row.actor?.role}
                  actorLabel={row.actorLabel}
                />
              </td>

              <td className="max-w-[220px] px-4 py-3">
                <LogUserCell
                  user={row.employee}
                  userRole={row.employee?.role}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                {row.action}
              </td>

              <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                {period(row.year, row.month)}
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

export default PayrollAuditTable;
