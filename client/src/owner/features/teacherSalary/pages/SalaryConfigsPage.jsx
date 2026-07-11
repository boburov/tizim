import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import SelectField from "@/shared/components/ui/select/SelectField";
import InputField from "@/shared/components/ui/input/InputField";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useObjectState from "@/shared/hooks/useObjectState";
import useDebounce from "@/shared/hooks/useDebounce";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import SalaryConfigsTable from "../components/SalaryConfigsTable";
import useTeacherSalariesQuery from "../hooks/useTeacherSalariesQuery";

const now = new Date();
const YEAR = now.getFullYear();
const MONTH = now.getMonth() + 1;

// Maosh belgilash: joriy oyning aktiv maoshlari. Qator bosilsa - o'sha guruhning
// maosh-davri detal sahifasiga o'tiladi (davrlar shu yerda belgilanadi).
const SalaryConfigsPage = () => {
  const navigate = useNavigate();
  const filters = useObjectState({ groupId: "", search: "" });
  const debouncedSearch = useDebounce(filters.search);

  const { data: groupsData } = useGroupsListQuery({ limit: 200 });
  const groupOptions = useMemo(
    () => [
      { value: "", label: "Barcha guruhlar" },
      ...(groupsData?.data || []).map((g) => ({ value: g._id, label: g.name })),
    ],
    [groupsData],
  );

  const { data, isLoading } = useTeacherSalariesQuery({
    year: YEAR,
    month: MONTH,
    groupId: filters.groupId || undefined,
    search: debouncedSearch || undefined,
    limit: 200,
  });

  const rows = data?.data || [];

  const goToGroup = (r) => {
    const groupId = r.group?._id || r.group;
    if (groupId) navigate(`/owner/finance/teacher-salaries/group/${groupId}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          searchable
          label="Guruh"
          value={filters.groupId}
          onChange={(v) => filters.setField("groupId", v)}
          options={groupOptions}
        />
        <InputField
          name="search"
          type="search"
          label="Qidiruv"
          placeholder="O'qituvchi ismi..."
          value={filters.search}
          onChange={(e) => filters.setField("search", e.target.value)}
          className="sm:col-span-2"
        />
      </div>

      <SalaryConfigsTable
        rows={rows}
        isLoading={isLoading}
        onRowClick={goToGroup}
        empty={
          <EmptyState
            title="Maoshlar topilmadi"
            description="Joriy oyda dars berayotgan o'qituvchilar va ularning maoshlari shu yerda ko'rinadi."
          />
        }
      />
    </div>
  );
};

export default SalaryConfigsPage;
