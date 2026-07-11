import { useState } from "react";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useObjectState from "@/shared/hooks/useObjectState";
import { MODAL } from "@/shared/constants/modals";

import ActivityLogsTable from "../components/ActivityLogsTable";
import LogFilters from "../components/LogFilters";
import LogDetailModal from "../components/LogDetailModal";
import useActivityLogsQuery from "../hooks/useActivityLogsQuery";

const ActivityLogsPage = () => {
  const filters = useObjectState({
    method: "",
    resourceType: "",
    fromDate: "",
    toDate: "",
  });
  const [page, setPage] = useState(1);
  const limit = 30;

  const onFilterChange = (key, value) => {
    filters.setField(key, value);
    setPage(1);
  };

  const { data, isLoading } = useActivityLogsQuery({
    method: filters.method || undefined,
    resourceType: filters.resourceType || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
    page,
    limit,
  });

  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Faoliyat loglari</h1>
        </div>
        <div className="text-sm text-muted-foreground">
          Jami: <span className="font-semibold">{total}</span>
        </div>
      </header>

      <LogFilters filters={filters} onChange={onFilterChange} />

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : (
        <>
          <ActivityLogsTable items={items} />
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
        name={MODAL.ACTIVITY_LOG_DETAIL}
        title="Log tafsilotlari"
        className="max-w-2xl"
      >
        <LogDetailModal />
      </ModalWrapper>
    </div>
  );
};

export default ActivityLogsPage;
