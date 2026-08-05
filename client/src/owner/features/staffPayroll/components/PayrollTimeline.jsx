// Icons
import {
  Ban,
  Calendar,
  CircleDollarSign,
  History,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";

// Components
import EmptyState from "@/shared/components/ui/feedback/EmptyState";

// Hooks
import { usePayrollTimelineQuery } from "../hooks/useStaffPayroll";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateTimeUz } from "@/shared/utils/formatDate";

// Amal -> ikonka va rang. Rad etilgan urinish (blocked) ataylab qizil:
// u "nima bo'lmadi" degan savolning javobi.
const META = {
  "payroll.generated": { icon: Sparkles, tone: "text-emerald-600 dark:text-emerald-300" },
  "payroll.recalculated": { icon: RefreshCw, tone: "text-muted-foreground" },
  "payroll.locked": { icon: Lock, tone: "text-amber-600 dark:text-amber-300" },
  "payroll.unlocked": { icon: LockOpen, tone: "text-amber-600 dark:text-amber-300" },
  "payroll.paid": { icon: CircleDollarSign, tone: "text-emerald-600 dark:text-emerald-300" },
  "payroll.payment_reversed": { icon: CircleDollarSign, tone: "text-red-600 dark:text-red-300" },
  "bonus.added": { icon: Plus, tone: "text-emerald-600 dark:text-emerald-300" },
  "bonus.removed": { icon: Minus, tone: "text-muted-foreground" },
  "penalty.added": { icon: Minus, tone: "text-red-600 dark:text-red-300" },
  "penalty.removed": { icon: Plus, tone: "text-muted-foreground" },
  "salary.changed": { icon: CircleDollarSign, tone: "text-blue-600 dark:text-blue-300" },
  "payroll.activation_changed": { icon: Calendar, tone: "text-blue-600 dark:text-blue-300" },
  "hr.employment_date_changed": { icon: Calendar, tone: "text-muted-foreground" },
  "payroll.blocked": { icon: Ban, tone: "text-red-600 dark:text-red-300" },
};

const money = (v) => (typeof v === "number" ? formatMoney(v) : null);

// "nima edi -> nima bo'ldi" ni bir qatorda o'qiladigan qilib beradi.
const describeChange = (row) => {
  const o = row.oldValue || {};
  const n = row.newValue || {};

  if (n.finalAmount !== undefined) {
    const from = money(o.finalAmount);
    return from
      ? `${from} → ${money(n.finalAmount)}`
      : `${money(n.finalAmount)}`;
  }
  if (n.amount !== undefined) return money(n.amount);
  if (o.amount !== undefined) return money(o.amount);
  if (n.baseAmount !== undefined) {
    const from = money(o.baseAmount);
    return from ? `${from} → ${money(n.baseAmount)}` : money(n.baseAmount);
  }
  if (n.hiredAt !== undefined || n.payrollStartFrom !== undefined) {
    const val = n.hiredAt || n.payrollStartFrom;
    const old = o.hiredAt || o.payrollStartFrom;
    const fmt = (d) => (d ? new Date(d).toLocaleDateString("uz-UZ") : "yo'q");
    return `${fmt(old)} → ${fmt(val)}`;
  }
  return null;
};

/**
 * MAOSH TAYMLAYNI - xodimning moliyaviy audit tarixi.
 *
 * Talab: "hech narsa tarixdan yo'qolmasligi kerak". Shuning uchun bu
 * ro'yxat faqat O'QIYDI - yozuvlarni o'chirish yoki tahrirlash imkoni
 * umuman yo'q (serverda ham).
 */
const PayrollTimeline = ({ employeeId, limit }) => {
  const { data: rows = [], isLoading } = usePayrollTimelineQuery(employeeId);

  if (isLoading) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Yuklanmoqda...</p>;
  }

  if (!rows.length) {
    return (
      <EmptyState
        compact
        icon={History}
        title="Tarix bo'sh"
        description="Bu xodim bo'yicha hali moliyaviy amal qilinmagan."
      />
    );
  }

  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <ol className="relative space-y-3 border-l pl-4">
      {shown.map((r) => {
        const meta = META[r.action] || { icon: History, tone: "text-muted-foreground" };
        const change = describeChange(r);
        return (
          <li key={r._id} className="relative">
            <span className="absolute -left-[1.4rem] top-0.5 flex size-4 items-center justify-center rounded-full bg-card">
              <meta.icon className={`size-3.5 ${meta.tone}`} />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <p className="text-sm font-medium">
                {r.actionLabel}
                {r.year ? (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {String(r.month).padStart(2, "0")}.{r.year}
                  </span>
                ) : null}
              </p>
              {change && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {change}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDateTimeUz(r.createdAt)} · {r.actorName}
              {r.meta?.source ? ` · ${r.meta.source}` : ""}
            </p>
            {r.reason && (
              <p className="mt-0.5 text-xs italic text-muted-foreground">
                "{r.reason}"
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
};

export default PayrollTimeline;
