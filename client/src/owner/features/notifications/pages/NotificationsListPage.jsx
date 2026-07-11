import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import DateRangePicker from "@/shared/components/ui/date/DateRangePicker";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useObjectState from "@/shared/hooks/useObjectState";
import useModal from "@/shared/hooks/useModal";
import useDebounce from "@/shared/hooks/useDebounce";
import { MODAL } from "@/shared/constants/modals";
import {
  CATEGORY_OPTIONS,
  CHANNEL_LABEL,
  STATUS_LABEL,
} from "@/shared/constants/notification";
import { cn } from "@/shared/utils/cn";

import NotificationsTable from "../components/NotificationsTable";
import SendWizard from "../components/SendWizard";
import CancelScheduledModal from "../components/modals/CancelScheduledModal";
import useNotificationsQuery from "../hooks/useNotificationsQuery";

const LIMIT = 20;

const CATEGORY_FILTER = [
  { value: "", label: "Barcha kategoriyalar" },
  ...CATEGORY_OPTIONS,
];
const CHANNEL_FILTER = [
  { value: "", label: "Barcha kanallar" },
  { value: "telegram", label: CHANNEL_LABEL.telegram },
  { value: "inapp", label: CHANNEL_LABEL.inapp },
];

const STATUS_CHIPS = [
  { value: "", label: "Hammasi" },
  { value: "sent", label: STATUS_LABEL.sent },
  { value: "scheduled", label: STATUS_LABEL.scheduled },
  { value: "canceled", label: STATUS_LABEL.canceled },
];

const NotificationsListPage = () => {
  const { openModal } = useModal();
  const filters = useObjectState({
    search: "",
    category: "",
    channel: "",
    status: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const search = useDebounce(filters.search, 350);

  const setFilter = (key, value) => {
    filters.setField(key, value);
    setPage(1);
  };

  const { data, isLoading, isFetching, isError, refetch } =
    useNotificationsQuery({
      search: search || undefined,
      category: filters.category || undefined,
      channel: filters.channel || undefined,
      status: filters.status || undefined,
      fromDate: filters.from || undefined,
      toDate: filters.to || undefined,
      page,
      limit: LIMIT,
    });

  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bildirishnomalar</h1>
        </div>
        <Button onClick={() => openModal(MODAL.NOTIFICATION_SEND)}>
          <Plus className="size-4" />
          Yangi xabar
        </Button>
      </header>

      {/* Toolbar: status tablar + filtrlar bitta toza qatorda */}
      <div className="space-y-3 rounded-lg border bg-white p-3">
        {/* Status tablar */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((c) => {
            const active = filters.status === c.value;
            return (
              <button
                key={c.value || "all"}
                type="button"
                onClick={() => setFilter("status", c.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-white text-muted-foreground hover:border-primary/40",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Qidiruv + filtrlar */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <InputField
            name="search"
            type="search"
            placeholder="Matn yoki sarlavha bo'yicha..."
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
          />
          <SelectField
            value={filters.category}
            onChange={(v) => setFilter("category", v)}
            options={CATEGORY_FILTER}
          />
          <SelectField
            value={filters.channel}
            onChange={(v) => setFilter("channel", v)}
            options={CHANNEL_FILTER}
          />
          <DateRangePicker
            value={{ from: filters.from, to: filters.to }}
            onChange={(key, value) => setFilter(key, value)}
            onClear={() => filters.setFields({ from: "", to: "" })}
            placeholder="Sana diapazoni"
            className="w-full"
          />
        </div>
      </div>

      {/* Jadval */}
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <NotificationsTable
            items={items}
            isLoading={isLoading}
            onCancel={(n) => openModal(MODAL.NOTIFICATION_CANCEL, { item: n })}
          />
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              onPageChange={setPage}
              totalPages={totalPages}
              hasNextPage={page < totalPages}
              hasPrevPage={page > 1}
            />
          )}
          {isFetching && !isLoading && (
            <p className="text-center text-xs text-muted-foreground">
              Yangilanmoqda...
            </p>
          )}
        </>
      )}

      {/* Yangi xabar wizard */}
      <ModalWrapper
        name={MODAL.NOTIFICATION_SEND}
        title="Yangi xabar yuborish"
        className="max-w-3xl"
      >
        <SendWizard />
      </ModalWrapper>

      {/* Rejani bekor qilish */}
      <ModalWrapper name={MODAL.NOTIFICATION_CANCEL} title="Rejani bekor qilish">
        <CancelScheduledModal />
      </ModalWrapper>
    </div>
  );
};

export default NotificationsListPage;
