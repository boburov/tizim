// React
import { useState } from "react";

// Icons
import { Plus, Trash2, Shuffle } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Input from "@/shared/components/ui/input/Input";
import Select from "@/shared/components/ui/select/Select";
import DataTable from "@/shared/components/ui/table/DataTable";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useBranchesQuery from "@/owner/features/branches/hooks/useBranchesQuery";
import useLeadAssigneesQuery from "../hooks/useLeadAssigneesQuery";
import {
  useRoutingRulesQuery,
  useRoutingCreateMutation,
  useRoutingRemoveMutation,
} from "../hooks/useLeadRouting";

const th = "px-4 py-2.5 text-left font-medium text-muted-foreground";

/**
 * LID YO'NALTIRISH QOIDALARI.
 *
 * ── QOIDA NIMA QILADI ──
 * Bot yoki webhook orqali kelgan lid QAYSI filialga tushishini
 * belgilaydi. Operator qo'lda kiritganda bu qoidalar ISHLATILMAYDI -
 * odam tanlagan filial har doim ustun.
 *
 * ── ZAXIRA QOIDA ──
 * Hech bir manbaga mos kelmagan lid uchun. Faqat BITTA bo'lishi
 * mumkin - ikkitasi bo'lsa tanlov tasodifiy bo'lib qolardi.
 * Zaxira ham bo'lmasa, lid ASOSIY filialga tushadi (kod ichida) -
 * ya'ni lid hech qachon yo'qolmaydi.
 */
const LeadRoutingTab = () => {
  const { data: rules = [], isLoading } = useRoutingRulesQuery();
  const { data: branchesRes } = useBranchesQuery({});
  const { data: assigneesRes } = useLeadAssigneesQuery();

  const form = useObjectState({
    sourceKey: "",
    branchId: "",
    assigneeId: "",
  });
  const [isFallback, setIsFallback] = useState(false);

  const create = useRoutingCreateMutation({
    onSuccess: () => {
      form.resetState();
      setIsFallback(false);
    },
  });
  const remove = useRoutingRemoveMutation();

  const branches = branchesRes?.data || [];
  const assignees = assigneesRes?.data || [];

  const columns = [
    {
      key: "source",
      header: "Manba",
      headerClassName: th,
      cell: (r) =>
        r.isFallback ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            Zaxira (barcha qolganlari)
          </span>
        ) : (
          <span className="font-mono text-xs">{r.sourceKey}</span>
        ),
    },
    {
      key: "branch",
      header: "Filial",
      headerClassName: th,
      cell: (r) => <span className="text-sm">{r.branchId?.name || "—"}</span>,
    },
    {
      key: "assignee",
      header: "Mas'ul",
      headerClassName: th,
      cell: (r) => (
        <span className="text-sm">
          {r.assigneeId
            ? `${r.assigneeId.firstName} ${r.assigneeId.lastName || ""}`.trim()
            : "— (filial admini oladi)"}
        </span>
      ),
    },
    {
      key: "state",
      header: "Holat",
      headerClassName: th,
      cell: (r) =>
        r.isActive ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-300">Faol</span>
        ) : (
          <span className="text-xs text-muted-foreground">Nofaol</span>
        ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: th,
      cell: (r) => (
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label="O'chirish"
          disabled={remove.isPending}
          onClick={() => remove.mutate(r._id)}
        >
          <Trash2 size={13} strokeWidth={2} />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Shuffle size={16} strokeWidth={2} />
          Lid yo'naltirish
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Bot va saytdan kelgan lid qaysi filialga tushishini belgilaydi.
          Operator qo'lda kiritganda bu qoidalar ishlatilmaydi — odam
          tanlagan filial har doim ustun.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={isFallback}
            onChange={(e) => setIsFallback(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm">Zaxira qoida</span>
        </label>

        {!isFallback && (
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Manba kaliti</span>
            <Input
              value={form.sourceKey}
              placeholder="telegram_chilonzor"
              className="max-w-[190px]"
              onChange={(e) => form.setField("sourceKey", e.target.value)}
            />
          </label>
        )}

        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Filial</span>
          <Select
            value={form.branchId}
            onChange={(v) => form.setField("branchId", v)}
            placeholder="Tanlang"
            triggerClassName="min-w-[160px]"
            options={branches.map((b) => ({ value: b._id, label: b.name }))}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Mas'ul (ixtiyoriy)</span>
          <Select
            value={form.assigneeId}
            onChange={(v) => form.setField("assigneeId", v)}
            placeholder="Filial admini oladi"
            triggerClassName="min-w-[180px]"
            options={assignees.map((u) => ({
              value: u._id,
              label: `${u.firstName} ${u.lastName || ""}`.trim(),
            }))}
          />
        </label>

        <Button
          disabled={
            create.isPending ||
            !form.branchId ||
            (!isFallback && !form.sourceKey.trim())
          }
          onClick={() =>
            create.mutate({
              branchId: form.branchId,
              isFallback,
              // Zaxira qoidada manba BO'LMAYDI - server buni rad etadi.
              ...(isFallback ? {} : { sourceKey: form.sourceKey.trim() }),
              assigneeId: form.assigneeId || null,
            })
          }
          className="gap-1.5"
        >
          <Plus size={16} strokeWidth={2} />
          Qo'shish
        </Button>
      </div>

      <DataTable
        rows={rules}
        columns={columns}
        isLoading={isLoading}
        empty={
          <p className="py-8 text-center text-sm opacity-60">
            Qoida yo'q — lidlar asosiy filialga tushadi
          </p>
        }
      />
    </div>
  );
};

export default LeadRoutingTab;
