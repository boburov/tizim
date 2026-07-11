import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useObjectState from "@/shared/hooks/useObjectState";
import useDebounce from "@/shared/hooks/useDebounce";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { LEAD_STATUS_OPTIONS } from "@/shared/constants/leadStatus";

import LeadsTable from "../components/LeadsTable";
import LeadCreateModal from "../components/LeadCreateModal";
import LeadEditModal from "../components/LeadEditModal";
import LeadDeleteModal from "../components/LeadDeleteModal";
import LeadConvertModal from "../components/LeadConvertModal";
import LeadReminderModal from "../components/LeadReminderModal";
import useLeadsQuery from "../hooks/useLeadsQuery";
import useLeadOptionsQuery from "../hooks/useLeadOptionsQuery";

const LIMIT = 20;

const withAll = (data, label = "Barchasi") => [
  { value: "", label },
  ...(data?.data || []).map((o) => ({ value: o._id, label: o.name })),
];

const LeadsListPage = () => {
  const { openModal } = useModal();
  const filters = useObjectState({ search: "", status: "", source: "", direction: "" });
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(filters.search);

  const sourceQ = useLeadOptionsQuery({ kind: "source" });
  const directionQ = useLeadOptionsQuery({ kind: "direction" });

  const { data, isLoading, isError, refetch } = useLeadsQuery({
    search: debouncedSearch || undefined,
    status: filters.status || undefined,
    source: filters.source || undefined,
    direction: filters.direction || undefined,
    page,
    limit: LIMIT,
  });

  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const update = (key, value) => {
    filters.setField(key, value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lidlar</h1>
        </div>
        <Button onClick={() => openModal(MODAL.LEAD_CREATE)}>
          <Plus className="size-4" />
          Yangi lid
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-2 rounded-lg border bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <InputField
          name="search"
          type="search"
          placeholder="Ism yoki telefon..."
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
        />
        <SelectField
          value={filters.status}
          onChange={(v) => update("status", v)}
          options={[{ value: "", label: "Barcha statuslar" }, ...LEAD_STATUS_OPTIONS]}
        />
        <SelectField
          searchable
          value={filters.source}
          onChange={(v) => update("source", v)}
          options={withAll(sourceQ.data, "Barcha manbalar")}
        />
        <SelectField
          searchable
          value={filters.direction}
          onChange={(v) => update("direction", v)}
          options={withAll(directionQ.data, "Barcha yo'nalishlar")}
        />
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <LeadsTable items={items} isLoading={isLoading} />
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              onPageChange={setPage}
              totalPages={totalPages}
              hasNextPage={page < totalPages}
              hasPrevPage={page > 1}
            />
          )}
        </>
      )}

      <ModalWrapper name={MODAL.LEAD_CREATE} title="Yangi lid" className="max-w-xl">
        <LeadCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_EDIT} title="Lidni tahrirlash" className="max-w-xl">
        <LeadEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_DELETE} title="Lidni o'chirish">
        <LeadDeleteModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_CONVERT} title="O'quvchiga aylantirish" className="max-w-xl">
        <LeadConvertModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.LEAD_REMINDER} title="Qayta bog'lanish eslatmasi">
        <LeadReminderModal />
      </ModalWrapper>
    </div>
  );
};

export default LeadsListPage;
