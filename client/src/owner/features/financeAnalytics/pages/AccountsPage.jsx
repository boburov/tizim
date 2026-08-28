import { useState } from "react";
import { ArrowRight, Wallet } from "lucide-react";

import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import {
  MetricValue, LoadingBlock, ErrorBlock, EmptyBlock, DeniedBlock,
} from "@/shared/components/analytics";
import { PageHeader } from "@/shared/components/page/PageShell";
import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import { accountKindLabel } from "@/shared/constants/finance";
import { cn } from "@/shared/utils/cn";
import { useDrillFilters } from "@/shared/drill";
import { todayInput } from "@/shared/utils/formatDate";

import { useAccounts, useEntryList } from "../hooks/useFinanceAnalytics";
import TransactionsTable from "../components/TransactionsTable";

/**
 * ══════════════════════════════════════════════════════════════════════
 * KASSA VA HISOBLAR — "qaysi hisobda qancha pul bor va bugun nima bo'ldi"
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── IKKI QADAM, BITTA EKRAN ──
 * Kartani bosish o'sha hisobning HARAKATLARINI shu yerning o'zida
 * ochadi. Ilgari bu yo'l panel orqali o'tardi va "Naqd" ni bosgan
 * odam yon paneldan chiqmasdan sanani o'zgartira olmasdi.
 *
 * ── QOLDIQ SAQLANMAYDI, HISOBLANADI ──
 * `Account` jadvalida `currentBalance` ustuni ATAYLAB yo'q (server
 * izohiga qarang): saqlangan qoldiq muqarrar eskiradi. Bu yerdagi har
 * bir raqam jurnal qatorlaridan kelgan va shuning uchun BITTA karta
 * ham qo'lda hisoblanmaydi — filiallar bo'yicha yig'ish ham yo'q
 * (server har (hisob, filial) juftini alohida qaytaradi, ular
 * qo'shilsa ikkinchi, boshqa raqam paydo bo'lardi).
 *
 * ── SANA: STANDART — BUGUN ──
 * Kassir uchun asosiy savol "bugun kassada nima bo'ldi". Oylik davr
 * standart bo'lsa, u har safar sanani qo'lda toraytirishga majbur
 * bo'lardi.
 */
const AccountCard = ({ row, active, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className={cn(
      "rounded-2xl border p-4 text-left transition",
      active
        ? "border-primary bg-primary/5"
        : "border-border bg-card hover:border-primary/40",
    )}
  >
    <p className="text-xs text-muted-foreground">
      {accountKindLabel(row.accountKind)}
      {row.branchName ? ` · ${row.branchName}` : ""}
    </p>
    <p className="mt-1 text-xl font-semibold text-foreground">
      <MetricValue value={row.balance} kind="money" />
    </p>
    <div className="mt-2 flex items-center gap-3 text-[11px]">
      <span className="text-success">
        + <MetricValue value={row.inflow} kind="moneyShort" />
      </span>
      <span className="text-destructive">
        − <MetricValue value={row.outflow} kind="moneyShort" />
      </span>
    </div>
    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
      Harakatlar
      <ArrowRight className="size-3" />
    </span>
  </button>
);

const AccountsPage = () => {
  const { has } = usePermissions();
  const [day, setDay] = useState(todayInput);
  const [selected, setSelected] = useState(null);

  // Kartalardagi qoldiq TANLANGAN KUNGACHA bo'lgan holat: sana
  // o'zgarganda kartalar ham o'sha kunning oxiridagi qoldiqni
  // ko'rsatadi. Aks holda jadval bir kunni, kartalar boshqa kunni
  // ko'rsatib turardi.
  const filters = { from: day, to: day };
  useDrillFilters(filters);

  const accounts = useAccounts(filters, {
    enabled: has(PERMISSIONS.FINANCE_VIEW_CASHFLOW),
  });
  const entries = useEntryList(
    { ...filters, accountKind: selected },
    { enabled: Boolean(selected) },
  );

  if (!has(PERMISSIONS.FINANCE_VIEW_CASHFLOW)) {
    return <DeniedBlock permission="finance.view_cashflow" className="mt-6" />;
  }

  const rows = accounts.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kassa va hisoblar"
        actions={
          <InputField
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="!gap-1"
          />
        }
      />

      {accounts.isLoading && <LoadingBlock rows={3} />}
      {accounts.isError && (
        <ErrorBlock error={accounts.error} onRetry={accounts.refetch} />
      )}
      {accounts.isSuccess && !rows?.length && (
        <EmptyBlock
          title="Hisob harakati yo'q"
          hint="Bu sanagacha hech qaysi hisobga pul kirmagan va chiqmagan."
        />
      )}
      {accounts.isSuccess && rows?.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r, i) => {
            const key = `${r.accountKind}-${r.branchId}-${i}`;
            return (
              <AccountCard
                key={key}
                row={r}
                active={selected === r.accountKind}
                onSelect={() =>
                  setSelected((cur) =>
                    cur === r.accountKind ? null : r.accountKind,
                  )
                }
              />
            );
          })}
        </section>
      )}

      {selected && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <Wallet className="size-4 text-muted-foreground" />
              {accountKindLabel(selected)} — harakatlar
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Yopish
            </Button>
          </div>

          {entries.isLoading && <LoadingBlock rows={5} />}
          {entries.isError && (
            <ErrorBlock error={entries.error} onRetry={entries.refetch} />
          )}
          {entries.isSuccess && (
            <TransactionsTable
              rows={entries.data}
              emptyTitle="Bu kuni harakat bo'lmagan"
              emptyHint="Boshqa sanani tanlab ko'ring."
            />
          )}
        </section>
      )}
    </div>
  );
};

export default AccountsPage;
