import { useParams } from "react-router-dom";
import BackLink from "@/shared/components/ui/link/BackLink";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import { MONTH_LABELS } from "@/shared/constants/calendar";
import useTeacherSalaryHistoryQuery from "../hooks/useTeacherSalaryHistoryQuery";
import { statusMeta } from "../utils/status";

const monthLabel = (m) => MONTH_LABELS[m - 1] || m;
const methodLabel = (m) => (m === "cash" ? "Naqd" : "Karta");

const TeacherSalaryHistoryPage = () => {
  const { teacherId } = useParams();
  const { data, isLoading } = useTeacherSalaryHistoryQuery(teacherId);

  const teacher = data?.teacher;
  const items = data?.items || [];
  const summary = data?.summary;
  const fullName = teacher
    ? `${teacher.firstName} ${teacher.lastName}`
    : "O'qituvchi";

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <BackLink to="/owner/finance/teacher-salaries" />
        <div>
          <h1 className="text-2xl font-semibold">{fullName}</h1>
        </div>
      </header>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Maoshlar yo'q"
          description="Bu o'qituvchi uchun hali maosh yozuvi yaratilmagan."
        />
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label="Oylar" value={`${summary.months} ta`} />
              <SummaryCard
                label="Kutilgan"
                value={formatMoney(summary.totalExpected)}
              />
              <SummaryCard
                label="To'langan"
                value={formatMoney(summary.totalPaid)}
                tone="emerald"
              />
              <SummaryCard
                label="Qoldiq"
                value={formatMoney(summary.totalRemaining)}
                tone="rose"
              />
            </div>
          )}

          <div className="space-y-3">
            {items.map((s) => (
              <SalaryMonthCard key={s._id} salary={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, tone }) => {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "rose"
        ? "text-rose-600"
        : "text-gray-900";
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
};

const SalaryMonthCard = ({ salary }) => {
  const meta = statusMeta(salary.status);
  const expected = salary.expectedAmount || 0;
  const paid = salary.paidAmount || 0;
  const remaining = Math.max(0, expected - paid);
  const txs = salary.transactions || [];

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {monthLabel(salary.month)} {salary.year}
          </p>
          <p className="text-xs text-muted-foreground">{salary.group?.name}</p>
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Kutilgan</p>
          <p className="font-medium">{formatMoney(expected)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">To'langan</p>
          <p className="font-medium text-emerald-600">{formatMoney(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Qoldiq</p>
          <p className="font-medium text-rose-600">{formatMoney(remaining)}</p>
        </div>
      </div>

      {txs.length > 0 && (
        <ul className="mt-3 space-y-1 border-t pt-3">
          {txs.map((t) => (
            <li
              key={t._id}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="font-medium">{formatMoney(t.amount)}</span>
              <span className="text-xs text-muted-foreground">
                {methodLabel(t.method)} · {formatDateUz(t.paidAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TeacherSalaryHistoryPage;
