import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import useDebounce from "@/shared/hooks/useDebounce";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import { MODAL } from "@/shared/constants/modals";
import MonthPicker from "./MonthPicker";
import StudentPaymentsTable from "./StudentPaymentsTable";
import AddPaymentModal from "./modals/AddPaymentModal";
import useStudentPaymentsQuery from "../hooks/useStudentPaymentsQuery";

const now = new Date();
const LIMIT = 24;

const SkeletonGrid = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {Array.from({ length: 8 }).map((_, i) => (
      <div
        key={i}
        className="h-36 animate-pulse rounded-xl border bg-muted/40"
      />
    ))}
  </div>
);

const StudentPaymentsPanel = () => {
  const filters = useObjectState({
    groupId: "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    search: "",
  });
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(filters.search);

  // Filtr o'zgarganda 1-sahifaga qaytamiz.
  const setFilter = (key, value) => {
    filters.setField(key, value);
    setPage(1);
  };
  const setMonth = ({ year, month }) => {
    filters.setFields({ year, month });
    setPage(1);
  };

  const { data: groupsData } = useGroupsListQuery({ limit: 200 });
  const groupOptions = useMemo(
    () => [
      { value: "", label: "Barcha guruhlar" },
      ...(groupsData?.data || []).map((g) => ({ value: g._id, label: g.name })),
    ],
    [groupsData],
  );

  const { data, isLoading, isFetching, isError, refetch } =
    useStudentPaymentsQuery(
      {
        groupId: filters.groupId || undefined,
        year: filters.year,
        month: filters.month,
        search: debouncedSearch || undefined,
        page,
        limit: LIMIT,
      },
      { placeholderData: keepPreviousData },
    );

  const payments = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = data?.meta?.pages || 1;
  const hasActiveFilters = filters.groupId || debouncedSearch;

  const resetFilters = () => {
    filters.setFields({ groupId: "", search: "" });
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-end gap-3">
        <MonthPicker
          year={filters.year}
          month={filters.month}
          onChange={setMonth}
        />
      </header>

      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          searchable
          label="Guruh"
          value={filters.groupId}
          onChange={(v) => setFilter("groupId", v)}
          options={groupOptions}
        />
        <InputField
          name="search"
          type="search"
          label="Qidiruv"
          placeholder="O'quvchi ismi..."
          value={filters.search}
          onChange={(e) => setFilter("search", e.target.value)}
          className="sm:col-span-2"
        />
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <SkeletonGrid />
      ) : payments.length === 0 ? (
        <EmptyState
          title="To'lovlar topilmadi"
          description={
            hasActiveFilters
              ? "Tanlangan filtrlar bo'yicha to'lov mavjud emas."
              : "Bu oy uchun hali to'lovlar yaratilmagan."
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Filtrlarni tozalash
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {isFetching && (
            <div className="flex justify-end text-sm text-muted-foreground">
              <span>Yangilanmoqda...</span>
            </div>
          )}

          <div className={`transition-opacity ${isFetching ? "opacity-60" : ""}`}>
            <StudentPaymentsTable rows={payments} />
          </div>

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

      <ModalWrapper name={MODAL.FINANCE_ADD_PAYMENT} title="To'lov qo'shish">
        <AddPaymentModal />
      </ModalWrapper>
    </div>
  );
};

export default StudentPaymentsPanel;
