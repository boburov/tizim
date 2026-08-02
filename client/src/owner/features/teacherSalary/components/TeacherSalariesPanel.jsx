import { useMemo } from "react";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import SelectYear from "@/shared/components/ui/select/SelectYear";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import ImportButton from "@/shared/components/import/ImportButton";
import useObjectState from "@/shared/hooks/useObjectState";
import useDebounce from "@/shared/hooks/useDebounce";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import { MODAL } from "@/shared/constants/modals";
import { MONTH_OPTIONS } from "@/shared/constants/calendar";
import TeacherSalariesTable from "./TeacherSalariesTable";
import AddSalaryPayoutModal from "./modals/AddSalaryPayoutModal";
import useTeacherSalariesQuery from "../hooks/useTeacherSalariesQuery";

const now = new Date();

const monthOptions = MONTH_OPTIONS.map((o) => ({
  value: String(o.value),
  label: o.label,
}));

const TeacherSalariesPanel = () => {
  const filters = useObjectState({
    groupId: "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    search: "",
  });
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
    groupId: filters.groupId || undefined,
    year: filters.year,
    month: filters.month,
    search: debouncedSearch || undefined,
    limit: 200,
  });

  const salaries = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
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
            onChange={(v) => filters.setField("month", Number(v))}
            options={monthOptions}
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
        <div className="flex flex-wrap items-end gap-3">
          <InputField
            name="search"
            type="search"
            label="Qidiruv"
            className="min-w-[200px] flex-1"
            placeholder="O'qituvchi ismi..."
            value={filters.search}
            onChange={(e) => filters.setField("search", e.target.value)}
          />
          {/* Maosh to'lovlarini ommaviy kiritish. Ruxsati (salary.pay)
              bo'lmasa tugma umuman render qilinmaydi. */}
          <ImportButton
            size="default"
            importerKey="teacher-salary-payments"
            title="Maosh to'lovlarini Excel'dan yuklash"
          />
        </div>
      </div>

      {salaries.length === 0 && !isLoading ? (
        <EmptyState title="Maoshlar topilmadi" />
      ) : (
        <TeacherSalariesTable rows={salaries} isLoading={isLoading} />
      )}

      <ModalWrapper name={MODAL.SALARY_ADD_PAYOUT} title="Maosh to'lovi">
        <AddSalaryPayoutModal />
      </ModalWrapper>
    </div>
  );
};

export default TeacherSalariesPanel;
