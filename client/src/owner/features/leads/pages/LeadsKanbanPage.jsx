// React
import { useState } from "react";

// Components
import LeadKanban from "../components/LeadKanban";
import SelectField from "@/shared/components/ui/select/SelectField";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";

// Hooks
import useLeadsQuery from "../hooks/useLeadsQuery";
import useLeadAssigneesQuery from "../hooks/useLeadAssigneesQuery";

// Doskada BARCHA voronka lidlari bir ekranda turishi kerak - sahifalash
// Kanban mantiqini buzardi ("2-sahifadagi lidni surib bo'lmaydi").
// Chegara baribir bor: undan oshsa jadval ko'rinishi to'g'riroq.
const KANBAN_LIMIT = 300;

const LeadsKanbanPage = () => {
  const [assignedTo, setAssignedTo] = useState("");

  const { data: assignees } = useLeadAssigneesQuery();
  const { data, isLoading, isError, refetch } = useLeadsQuery({
    limit: KANBAN_LIMIT,
    ...(assignedTo ? { assignedTo } : {}),
  });

  const leads = data?.data || [];
  const total = data?.meta?.total ?? leads.length;

  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Kartani ustundan ustunga suring — bosqich darhol saqlanadi.
          Rad etilganlar doskada ko'rinmaydi (ular voronka bosqichi emas),
          ularni «Ro'yxat» tabidan toping.
        </p>
        <SelectField
          name="assignedTo"
          label="Mas'ul"
          value={assignedTo}
          onChange={(v) => setAssignedTo(v?.target?.value ?? v)}
          options={[
            { value: "", label: "Barchasi" },
            ...(assignees?.data || []).map((u) => ({
              value: u._id,
              label: `${u.firstName} ${u.lastName || ""}`.trim(),
            })),
          ]}
        />
      </div>

      {total > KANBAN_LIMIT && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {total} ta lid bor, doskada dastlabki {KANBAN_LIMIT} tasi ko'rsatilyapti.
          Mas'ul bo'yicha filtrlang yoki «Ro'yxat» tabidan foydalaning.
        </p>
      )}

      <LeadKanban leads={leads} isLoading={isLoading} />
    </div>
  );
};

export default LeadsKanbanPage;
