import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import Button from "@/shared/components/ui/button/Button";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import MetricValue from "../MetricValue";
import AnalyticsTable from "../AnalyticsTable";
import BudgetEditorSheet from "../BudgetEditorSheet";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "../StateBlock";
import { useBudget, useExpenseBreakdown } from "../../hooks/useFinanceAnalytics";
import { useBudgetList } from "../../hooks/useBudgetOps";

/**
 * BYUDJET vs FAKT.
 *
 * ── HOLAT SERVERDAN KELADI ──
 * `status` (`over` / `under` / `on_track`) ni server hisoblaydi.
 * Bu yerda "10% dan oshsa qizil" kabi chegara YOZILMAYDI: chegara
 * ikki joyda bo'lsa, ular ajralib ketadi va ekrandagi rang serverning
 * ogohlantirishi bilan zid bo'lib qolardi.
 */
const STATUS = {
  over: { label: "Oshib ketdi", cls: "bg-destructive/10 text-destructive" },
  under: { label: "Tejaldi", cls: "bg-success/10 text-success" },
  on_track: { label: "Rejada", cls: "bg-muted text-muted-foreground" },
};

const StatusPill = ({ status }) => {
  const s = STATUS[status] || STATUS.on_track;
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", s.cls)}>
      {s.label}
    </span>
  );
};

const SCOPE_LABEL = { total: "Jami", category: "Kategoriya", kind: "Tur" };

const BudgetSection = ({ filters }) => {
  const query = useBudget(filters);
  const { has } = usePermissions();
  const canManage = has(PERMISSIONS.FINANCE_MANAGE_BUDGETS);
  const [editing, setEditing] = useState(null); // null | "new" | budget

  // Kategoriya ro'yxati muharrir uchun — CHIQIM tahlilidan qayta
  // ishlatiladi (alohida so'rov shart emas, u allaqachon keshda).
  const breakdown = useExpenseBreakdown(filters);
  const categories = (breakdown.data?.items || []).filter((c) => c.categoryId);

  // Tahrirlash uchun to'liq byudjet (qatorlari bilan) kerak.
  const budgets = useBudgetList(
    { year: filters?.year, branchId: filters?.branchId },
    { enabled: canManage },
  );
  const current = (budgets.data || []).find(
    (b) => String(b.year) === String(filters?.year) && String(b.month) === String(filters?.month),
  );

  const editor = (
    <BudgetEditorSheet
      open={Boolean(editing)}
      onOpenChange={(v) => !v && setEditing(null)}
      budget={editing === "new" ? null : editing}
      filters={filters}
      categories={categories}
    />
  );

  if (query.isLoading) return <LoadingBlock rows={3} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={query.refetch} />;

  const d = query.data;
  if (!d?.hasBudget) {
    return (
      <>
        <EmptyBlock
          title="Byudjet belgilanmagan"
          hint={d?.message || "Bu davr uchun byudjet kiritilmagan — reja bilan taqqoslash mumkin emas."}
        />
        {canManage && (
          <div className="mt-3 flex justify-center">
            <Button onClick={() => setEditing("new")}>
              <Plus className="mr-1.5 size-4" />
              Byudjet yaratish
            </Button>
          </div>
        )}
        {editor}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {d.total && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">{d.budgetName || "Byudjet"}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Umumiy reja va fakt</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={d.total.status} />
              {canManage && current && (
                <Button variant="outline" size="sm" onClick={() => setEditing(current)}>
                  <Pencil className="mr-1.5 size-3.5" />
                  Tahrirlash
                </Button>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { l: "Byudjet", v: d.total.budget },
              { l: "Fakt", v: d.total.actual },
              { l: "Farq", v: d.total.variance },
            ].map((x) => (
              <div key={x.l}>
                <p className="text-xs text-muted-foreground">{x.l}</p>
                <p className="mt-1 font-semibold text-foreground">
                  <MetricValue value={x.v} kind="moneyShort" />
                </p>
              </div>
            ))}
            <div>
              <p className="text-xs text-muted-foreground">Farq %</p>
              <p className="mt-1 font-semibold text-foreground">
                <MetricValue value={d.total.variancePercent} kind="percent" emptyTitle="Byudjet nol" />
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold text-foreground">Qatorlar</h2>
        <AnalyticsTable
          rows={d.lines}
          defaultSort={{ key: "variance", dir: "desc" }}
          columns={[
            { key: "label", label: "Nomi" },
            { key: "scope", label: "Daraja", render: (r) => SCOPE_LABEL[r.scope] || r.scope },
            { key: "budget", label: "Byudjet", align: "right", kind: "moneyShort" },
            { key: "actual", label: "Fakt", align: "right", kind: "moneyShort" },
            { key: "variance", label: "Farq", align: "right", kind: "moneyShort" },
            { key: "variancePercent", label: "Farq %", align: "right", kind: "percent" },
            { key: "status", label: "Holat", align: "right", sortable: false, render: (r) => <StatusPill status={r.status} /> },
          ]}
          emptyTitle="Byudjet qatorlari yo'q"
        />
      </section>

      {editor}
    </div>
  );
};

export default BudgetSection;
