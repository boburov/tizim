import { useParams } from "react-router-dom";
import BackLink from "@/shared/components/ui/link/BackLink";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import { MONTH_LABELS } from "@/shared/constants/calendar";
import useTeacherSalaryHistoryQuery from "../hooks/useTeacherSalaryHistoryQuery";
import TeacherSalaryBalanceCard from "../components/TeacherSalaryBalanceCard";
import { statusMeta, SALARY_KIND_LABEL, isAdjustmentKind } from "../utils/status";

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
        <BackLink to="/owner/teachers/maoshlar" />
        <div>
          <h1 className="text-2xl font-semibold">{fullName}</h1>
        </div>
      </header>

      {/* JORIY HOLAT - ro'yxatdan OLDIN va oylik yozuvlar bo'lmasa ham
          ko'rinadi: yangi o'qituvchining birinchi oyi hali generatsiya
          qilinmagan bo'lsa ham stavkasi va bugungacha ishlagani bor. */}
      <TeacherSalaryBalanceCard teacherId={teacherId} />

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
          {/* UMUMIY TARIX - yuqoridagi kartochkadan FARQLI: u "hozir
              qanday" ni, bu esa "boshidan beri qancha" ni ko'rsatadi. */}
          {summary && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Umumiy tarix
              </p>
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
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "rose"
        ? "text-rose-600 dark:text-rose-300"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
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
  // Qo'lda yozilgan qator (mukofot/jarima): guruh o'rniga SABAB ko'rsatiladi.
  // Jarimada guruh odatda yo'q, ya'ni bu joy bo'sh qolib "nima uchun bu
  // qator paydo bo'ldi?" degan savolni javobsiz qoldirardi.
  const adjustment = isAdjustmentKind(salary.kind);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {monthLabel(salary.month)} {salary.year}
            {adjustment && (
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                {SALARY_KIND_LABEL[salary.kind]}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {adjustment ? salary.reason || "-" : salary.group?.name}
          </p>
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Kutilgan</p>
          {/* Jarima MANFIY - ishorasi ko'rinmasa mukofotdan farq qilmasdi. */}
          <p
            className={
              expected < 0
                ? "font-medium text-rose-600 dark:text-rose-300"
                : "font-medium"
            }
          >
            {expected < 0
              ? `−${formatMoney(Math.abs(expected))}`
              : formatMoney(expected)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">To'langan</p>
          <p className="font-medium text-emerald-600 dark:text-emerald-300">{formatMoney(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Qoldiq</p>
          <p className="font-medium text-rose-600 dark:text-rose-300">{formatMoney(remaining)}</p>
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
