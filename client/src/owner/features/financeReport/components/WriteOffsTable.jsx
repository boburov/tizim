import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { formatMoney } from "@/shared/utils/formatMoney";

const monthLabel = (breakdown = []) =>
  breakdown.map((b) => `${b.month}/${b.year}`).join(", ");

const fmtDate = (d) => {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("uz-UZ");
  } catch {
    return "-";
  }
};

// Undirilmagan to'lovlar (hisobdan chiqarilgan) bo'limi - moliyaviy zararlar.
// href berilsa - sarlavhada to'liq sahifaga "Batafsil" havolasi ko'rsatiladi.
const WriteOffsTable = ({ data, isLoading, href }) => {
  const items = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">
              Undirilmagan to'lovlar
            </h2>
            <p className="text-xs text-muted-foreground">
              O'quvchi qarzi bilan chiqib ketgan - moliyaviy zarar
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Jami</p>
            <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">
              {formatMoney(total)}
            </p>
          </div>
          {href && (
            <Link
              to={href}
              className="group inline-flex items-center gap-0.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
            >
              Batafsil
              <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">O'quvchi</th>
              <th className="pb-2 pr-3 font-medium">Guruh</th>
              <th className="pb-2 pr-3 font-medium">Oy(lar)</th>
              <th className="pb-2 pr-3 font-medium">Sana</th>
              <th className="pb-2 text-right font-medium">Summa</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Yuklanmoqda...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Bu davrda undirilmagan to'lov yo'q
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr
                  key={it.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-2.5 pr-3 font-medium text-foreground">
                    {it.studentName}
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{it.groupName}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {monthLabel(it.breakdown)}
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {fmtDate(it.createdAt)}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-amber-700 dark:text-amber-300">
                    {formatMoney(it.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WriteOffsTable;
