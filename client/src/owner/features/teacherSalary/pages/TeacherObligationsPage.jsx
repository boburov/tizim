import { useMemo } from "react";
import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import { MONTH_OPTIONS } from "@/shared/constants/calendar";
import useObjectState from "@/shared/hooks/useObjectState";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import ObligationsTable from "../components/ObligationsTable";
import useObligationsQuery from "../hooks/useObligationsQuery";

const now = new Date();

const MONTH_FILTER_OPTIONS = [
  { value: "", label: "Barcha oylar" },
  ...MONTH_OPTIONS.map((o) => ({ value: String(o.value), label: o.label })),
];

const TeacherObligationsPage = () => {
  const filters = useObjectState({
    groupId: "",
    year: now.getFullYear(),
    month: "",
  });

  const { data: groupsData } = useGroupsListQuery({ limit: 200 });
  const groupOptions = useMemo(
    () => [
      { value: "", label: "Barcha guruhlar" },
      ...(groupsData?.data || []).map((g) => ({ value: g._id, label: g.name })),
    ],
    [groupsData],
  );

  const allMonths = filters.month === "";

  const { data, isLoading } = useObligationsQuery({
    groupId: filters.groupId || undefined,
    year: filters.year,
    month: allMonths ? undefined : filters.month,
  });

  const rows = data || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SelectYear
          label="Yil"
          className="flex-1"
          value={filters.year}
          onChange={(v) => filters.setField("year", Number(v))}
        />
        <SelectField
          label="Oy"
          className="flex-1"
          value={String(filters.month)}
          onChange={(v) => filters.setField("month", v === "" ? "" : Number(v))}
          options={MONTH_FILTER_OPTIONS}
        />
        <SelectField
          searchable
          label="Guruh"
          className="flex-1"
          value={filters.groupId}
          onChange={(v) => filters.setField("groupId", v)}
          options={groupOptions}
        />
      </div>

      {!isLoading && rows.length === 0 ? (
        <EmptyState title="Qarzdorlik yo'q" description="Tanlangan davr uchun barcha maoshlar to'langan" />
      ) : (
        <ObligationsTable rows={rows} isLoading={isLoading} showMonth={allMonths} />
      )}
    </div>
  );
};

export default TeacherObligationsPage;
