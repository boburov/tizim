import { useMemo } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useObjectState from "@/shared/hooks/useObjectState";
import useModal from "@/shared/hooks/useModal";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import { MODAL } from "@/shared/constants/modals";
import MonthPicker from "../components/MonthPicker";
import DiscountsTable from "../components/DiscountsTable";
import DiscountCreateModal from "../components/modals/DiscountCreateModal";
import DiscountEditModal from "../components/modals/DiscountEditModal";
import DiscountDeleteModal from "../components/modals/DiscountDeleteModal";
import useDiscountsQuery from "../hooks/useDiscountsQuery";

const now = new Date();

const DiscountsPage = () => {
  const { openModal } = useModal();
  const filters = useObjectState({
    groupId: "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const { data: groupsData } = useGroupsListQuery({ limit: 200 });
  const groupOptions = useMemo(
    () => [
      { value: "", label: "Barcha guruhlar" },
      ...(groupsData?.data || []).map((g) => ({ value: g._id, label: g.name })),
    ],
    [groupsData],
  );

  const { data, isLoading } = useDiscountsQuery({
    groupId: filters.groupId || undefined,
    year: filters.year,
    month: filters.month,
    limit: 200,
  });

  const rows = data?.data || [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Chegirmalar</h1>
        <div className="flex flex-wrap items-end gap-2">
          <MonthPicker
            year={filters.year}
            month={filters.month}
            onChange={({ year, month }) => filters.setFields({ year, month })}
          />
          <Button onClick={() => openModal(MODAL.DISCOUNT_CREATE)}>
            <Plus className="size-4" />
            Yangi chegirma
          </Button>
        </div>
      </header>

      <div className="max-w-xs">
        <SelectField
          searchable
          label="Guruh"
          value={filters.groupId}
          onChange={(v) => filters.setField("groupId", v)}
          options={groupOptions}
        />
      </div>

      <DiscountsTable
        rows={rows}
        isLoading={isLoading}
        onEdit={(d) => openModal(MODAL.DISCOUNT_EDIT, { discount: d })}
        onDelete={(d) => openModal(MODAL.DISCOUNT_DELETE, { discount: d })}
      />

      <ModalWrapper name={MODAL.DISCOUNT_CREATE} title="Yangi chegirma">
        <DiscountCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.DISCOUNT_EDIT} title="Chegirmani tahrirlash">
        <DiscountEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.DISCOUNT_DELETE} title="Chegirmani o'chirish">
        <DiscountDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default DiscountsPage;
