import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useObjectState from "@/shared/hooks/useObjectState";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { TEMPLATE_CATEGORY_OPTIONS } from "@/shared/constants/notification";

import TemplatesTable from "../components/TemplatesTable";
import TemplateCreateModal from "../components/TemplateCreateModal";
import TemplateEditModal from "../components/TemplateEditModal";
import TemplateDeleteModal from "../components/TemplateDeleteModal";
import useNotificationTemplatesQuery from "../hooks/useNotificationTemplatesQuery";

const CATEGORY_OPTIONS = [
  { value: "", label: "Barcha kategoriyalar" },
  ...TEMPLATE_CATEGORY_OPTIONS,
];

const LIMIT = 20;

const NotificationTemplatesListPage = () => {
  const filters = useObjectState({
    search: "",
    category: "",
    includeInactive: false,
  });
  const [page, setPage] = useState(1);
  const { openModal } = useModal();

  const setFilter = (key, value) => {
    filters.setField(key, value);
    setPage(1);
  };

  const { data, isLoading, isError, refetch } = useNotificationTemplatesQuery({
    search: filters.search || undefined,
    category: filters.category || undefined,
    includeInactive: filters.includeInactive,
    page,
    limit: LIMIT,
  });
  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Bildirishnoma shablonlari</h1>
        <Button onClick={() => openModal(MODAL.NOTIFICATION_TEMPLATE_CREATE)}>
          <Plus className="size-4" />
          Yangi shablon
        </Button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <InputField
          name="search"
          label="Qidirish"
          placeholder="Nom bo'yicha..."
          value={filters.search}
          onChange={(e) => setFilter("search", e.target.value)}
        />
        <SelectField
          label="Kategoriya"
          value={filters.category}
          onChange={(v) => setFilter("category", v)}
          options={CATEGORY_OPTIONS}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includeInactive}
            onChange={(e) => setFilter("includeInactive", e.target.checked)}
          />
          Arxivlanganlar
        </label>
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <TemplatesTable items={items} isLoading={isLoading} />
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

      <ModalWrapper
        name={MODAL.NOTIFICATION_TEMPLATE_CREATE}
        title="Yangi shablon"
      >
        <TemplateCreateModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.NOTIFICATION_TEMPLATE_EDIT}
        title="Shablonni tahrirlash"
      >
        <TemplateEditModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.NOTIFICATION_TEMPLATE_DELETE}
        title="Shablonni o'chirish"
      >
        <TemplateDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default NotificationTemplatesListPage;
