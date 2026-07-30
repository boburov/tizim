// React
import { useMemo, useState } from "react";

// Icons
import { Clock, Wallet, AlertTriangle } from "lucide-react";

// Components
import DataTable from "@/shared/components/ui/table/DataTable";
import StatCard from "@/shared/components/ui/card/StatCard";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import TabsButtons from "@/shared/components/ui/tabs/TabsButtons";
import ApprovalKindCell from "../components/ApprovalKindCell";
import ApprovalStatusPill from "../components/ApprovalStatusPill";
import ApprovalRequesterCell from "../components/ApprovalRequesterCell";
import ApprovalRowActions from "../components/ApprovalRowActions";
import ApprovalCheckbox from "../components/ApprovalCheckbox";
import ApprovalDetailSheet from "../components/ApprovalDetailSheet";
import ApprovalsToolbar from "../components/ApprovalsToolbar";
import BulkDecideBar from "../components/BulkDecideBar";
import BulkDecideModal from "../components/modals/BulkDecideModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useObjectState from "@/shared/hooks/useObjectState";
import useApprovalPermissions from "../hooks/useApprovalPermissions";
import useApprovalStatsQuery from "../hooks/useApprovalStatsQuery";
import useExpenseApprovalsQuery from "../hooks/useExpenseApprovalsQuery";
import {
  useApproveMutation,
  useRejectMutation,
  useCancelApprovalMutation,
  useRetryApprovalMutation,
} from "../hooks/useExpenseApprovalMutations";

// Utils
import { approvalHeadline, fullName } from "../utils/approvalSummary";
import { formatDateTimeUz } from "@/shared/utils/formatDate";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { STATUS_TABS, STATUS_ALL, CATEGORY_LABELS } from "../constants";

const PAGE_LIMIT = 20;

const ExpenseApprovalsPage = () => {
  const { openModal } = useModal();
  const { resolve } = useApprovalPermissions();

  const [detail, setDetail] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const filters = useObjectState({
    status: "pending",
    category: "",
    kind: "",
    search: "",
    sort: "-createdAt",
    dateFrom: "",
    dateTo: "",
    page: 1,
  });

  // Bo'sh qiymatlar so'rovga qo'shilmaydi - aks holda har bir bo'sh filtr
  // query key'ni o'zgartirib, keshni bekorga bo'lakka bo'lardi.
  const params = useMemo(() => {
    const q = { page: filters.page, limit: PAGE_LIMIT, sort: filters.sort };
    if (filters.status !== STATUS_ALL) q.status = filters.status;
    if (filters.category) q.category = filters.category;
    if (filters.kind) q.kind = filters.kind;
    if (filters.search.trim()) q.search = filters.search.trim();
    if (filters.dateFrom) q.dateFrom = filters.dateFrom;
    if (filters.dateTo) q.dateTo = filters.dateTo;
    return q;
  }, [
    filters.page,
    filters.sort,
    filters.status,
    filters.category,
    filters.kind,
    filters.search,
    filters.dateFrom,
    filters.dateTo,
  ]);

  const { data, isLoading } = useExpenseApprovalsQuery(params);
  const { data: stats } = useApprovalStatsQuery();

  // `|| []` har renderda YANGI massiv qaytaradi - pastdagi useMemo'lar
  // shu sababli hech qachon keshlanmasdi. Shuning uchun o'zi ham memo.
  const items = useMemo(() => data?.data || [], [data]);
  // Server `meta.pages` qaytaradi (buildMeta). Ilgari bu butunlay
  // o'qilmasdi va ro'yxat jimgina birinchi sahifada qolib ketardi.
  const totalPages = data?.meta?.pages || 1;

  const clearSelection = () => setSelectedIds([]);

  const { mutate: approve, isPending: approving } = useApproveMutation({
    onSuccess: () => setDetail(null),
  });
  const { mutate: reject, isPending: rejecting } = useRejectMutation({
    onSuccess: () => setDetail(null),
  });
  const { mutate: cancel, isPending: canceling } = useCancelApprovalMutation({
    onSuccess: () => setDetail(null),
  });
  const { mutate: retry, isPending: retrying } = useRetryApprovalMutation({
    onSuccess: () => setDetail(null),
  });
  const busy = approving || rejecting || canceling || retrying;

  // Faqat QAROR QABUL QILSA BO'LADIGAN qatorlar tanlanadi. "Hammasini
  // tanlash" ham aynan shu ro'yxat bilan ishlaydi - server baribir har bir
  // ID ni qayta tekshiradi, lekin foydalanuvchi bosishdan oldin nima
  // bo'lishini ko'rib turishi kerak.
  const selectableRows = useMemo(
    () => items.filter((a) => resolve(a).canDecide),
    [items, resolve],
  );

  const selected = useMemo(
    () => items.filter((a) => selectedIds.includes(a._id)),
    [items, selectedIds],
  );

  const allSelected =
    selectableRows.length > 0 && selected.length === selectableRows.length;

  const toggleAll = (checked) =>
    setSelectedIds(checked ? selectableRows.map((a) => a._id) : []);

  const toggleOne = (id, checked) =>
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id),
    );

  const openBulk = (action) =>
    openModal(MODAL.APPROVAL_BULK_DECIDE, { approvals: selected, action });

  const activeFilterCount = [
    filters.category,
    filters.kind,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  const resetFilters = () =>
    filters.setFields({
      category: "",
      kind: "",
      dateFrom: "",
      dateTo: "",
      page: 1,
    });

  const rowActions = (approval) => (
    <ApprovalRowActions
      approval={approval}
      disabled={busy}
      onDetail={setDetail}
      onApprove={(a) => approve({ id: a._id })}
      onReject={(a) => reject({ id: a._id })}
      onCancel={(a) => cancel(a._id)}
      onRetry={(a) => retry(a._id)}
    />
  );

  const columns = [
    {
      key: "select",
      headerClassName: "w-10 px-4 py-2.5",
      className: "w-10",
      header: (
        <ApprovalCheckbox
          checked={allSelected}
          onChange={toggleAll}
          label="Hammasini tanlash"
          disabled={selectableRows.length === 0}
          reason="Bu sahifada tasdiqlash mumkin bo'lgan so'rov yo'q"
        />
      ),
      cell: (row) => {
        const { canDecide, reason } = resolve(row);
        return (
          <ApprovalCheckbox
            reason={reason}
            disabled={!canDecide}
            label="So'rovni tanlash"
            checked={selectedIds.includes(row._id)}
            onChange={(checked) => toggleOne(row._id, checked)}
          />
        );
      },
    },
    {
      key: "kind",
      header: "So'rov",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => <ApprovalKindCell approval={row} />,
    },
    {
      key: "amount",
      header: "Summa / O'zgarish",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm font-medium tabular-nums">
          {approvalHeadline(row)}
        </span>
      ),
    },
    {
      key: "category",
      header: "Kategoriya",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => (
        <span className="whitespace-nowrap rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {CATEGORY_LABELS[row.category]}
        </span>
      ),
    },
    {
      key: "status",
      header: "Holat",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => <ApprovalStatusPill status={row.status} />,
    },
    {
      key: "requestedBy",
      header: "So'rovchi",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => <ApprovalRequesterCell user={row.requestedBy} />,
    },
    {
      key: "branch",
      header: "Filial",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {row.branchId?.name || "—"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Sana",
      headerClassName: "px-4 py-2.5 text-left font-medium text-muted-foreground",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDateTimeUz(row.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-12 px-4 py-2.5",
      className: "w-12 text-right",
      cell: rowActions,
    },
  ];

  // Mobil karta - jadval ustunlari telefonda sig'maydi, shuning uchun
  // DataTable `< md` da shu ko'rinishga o'tadi.
  const renderCard = (row) => (
    <div className="space-y-2" onClick={() => setDetail(row)}>
      <div className="flex items-start justify-between gap-2">
        <ApprovalKindCell approval={row} />
        {rowActions(row)}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{approvalHeadline(row)}</span>
        <ApprovalStatusPill status={row.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {fullName(row.requestedBy)} · {formatDateTimeUz(row.createdAt)}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Tasdiqlar</h1>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          tone="warn"
          icon={Clock}
          label="Kutilmoqda"
          value={stats?.pending ?? null}
        />
        <StatCard
          isMoney
          icon={Wallet}
          label="Kutilayotgan chiqim"
          value={stats?.pendingAmount ?? null}
        />
        <StatCard
          tone={stats?.failed ? "negative" : "default"}
          icon={AlertTriangle}
          label="Xato"
          hint={stats?.failed ? "Qayta urinish kerak" : ""}
          value={stats?.failed ?? null}
        />
      </div>

      <TabsButtons
        items={STATUS_TABS.map((t) => ({ value: t.value, label: t.label }))}
        value={filters.status}
        onChange={(v) => {
          filters.setFields({ status: v, page: 1 });
          clearSelection();
        }}
      />

      <ApprovalsToolbar
        filters={filters}
        onReset={resetFilters}
        activeCount={activeFilterCount}
      />

      <DataTable
        rows={items}
        columns={columns}
        isLoading={isLoading}
        renderCard={renderCard}
        onRowClick={setDetail}
        empty={<p className="py-8 text-center text-sm opacity-60">So'rovlar topilmadi</p>}
      />

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={filters.page}
          hasPrevPage={filters.page > 1}
          hasNextPage={filters.page < totalPages}
          onPageChange={(p) => {
            filters.setField("page", p);
            clearSelection();
          }}
        />
      )}

      <BulkDecideBar
        busy={busy}
        selected={selected}
        onClear={clearSelection}
        onApprove={() => openBulk("approve")}
        onReject={() => openBulk("reject")}
      />

      <ApprovalDetailSheet
        busy={busy}
        approval={detail}
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        onApprove={(a) => approve({ id: a._id })}
        onReject={(a) => reject({ id: a._id })}
        onCancel={(a) => cancel(a._id)}
        onRetry={(a) => retry(a._id)}
      />

      <ModalWrapper
        name={MODAL.APPROVAL_BULK_DECIDE}
        title="Ommaviy qaror"
        className="max-w-md"
      >
        <BulkDecideModal />
      </ModalWrapper>
    </div>
  );
};

export default ExpenseApprovalsPage;
