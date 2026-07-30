import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

import useObjectState from "@/shared/hooks/useObjectState";
import BackLink from "@/shared/components/ui/link/BackLink";
import SelectField from "@/shared/components/ui/select/SelectField";
import { formatMoney } from "@/shared/utils/formatMoney";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";

import PeriodPicker from "../components/PeriodPicker";
import WriteOffsTable from "../components/WriteOffsTable";
import useFinanceWriteOffsQuery from "../hooks/useFinanceWriteOffsQuery";

const now = new Date();

const WriteOffsPage = () => {
  const filters = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    groupId: "",
  });

  const { data: groupsData } = useGroupsListQuery({ limit: 200 });
  const groupOptions = useMemo(
    () => [
      { value: "", label: "Barcha guruhlar" },
      ...(groupsData?.data || []).map((g) => ({ value: g._id, label: g.name })),
    ],
    [groupsData],
  );

  const params = {
    year: filters.year,
    month: filters.month,
    groupId: filters.groupId || undefined,
  };
  const { data, isLoading } = useFinanceWriteOffsQuery(params);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackLink to="/owner/finance/accounting" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Undirilmagan to'lovlar
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Qarzi bilan chiqib ketgan o'quvchilar - hisobdan chiqarilgan (zarar)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <SelectField
              searchable
              value={filters.groupId}
              onChange={(v) => filters.setField("groupId", v)}
              options={groupOptions}
              className="!gap-1"
            />
          </div>
          <PeriodPicker
            year={filters.year}
            month={filters.month}
            onChange={({ year, month }) => filters.setFields({ year, month })}
          />
        </div>
      </header>

      {/* Umumiy zarar kartasi */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Jami zarar</p>
            <span className="flex size-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <AlertTriangle className="size-4" />
            </span>
          </div>
          <p className="mt-4 text-2xl font-semibold tabular-nums text-amber-800 dark:text-amber-300">
            {formatMoney(data?.total || 0)}
          </p>
          <p className="mt-1 text-xs text-amber-700/80">Tanlangan davr bo'yicha</p>
        </div>
      </div>

      <WriteOffsTable data={data} isLoading={isLoading} />
    </div>
  );
};

export default WriteOffsPage;
