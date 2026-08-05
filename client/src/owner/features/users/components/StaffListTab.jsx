// Icons
import { X } from "lucide-react";

// Components
import InputField from "@/shared/components/ui/input/InputField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ExportButton from "@/shared/components/export/ExportButton";
import StaffStatCards from "../components/StaffStatCards";
import StaffTable from "../components/StaffTable";
import StaffRoleModal from "../components/StaffRoleModal";
import UserBranchModal from "../components/UserBranchModal";
import UserModals from "../components/UserModals";
import UserStatusFilter from "../components/UserStatusFilter";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useDebounce from "@/shared/hooks/useDebounce";
import useObjectState from "@/shared/hooks/useObjectState";
import useUsersListQuery from "../hooks/useUsersListQuery";
import useStaffStatsQuery from "../hooks/useStaffStatsQuery";

// Utils
import { allowedStatusesForTab } from "../utils/userStatusFilter";

// Constants
import { MODAL } from "@/shared/constants/modals";

const LIMIT = 20;

/**
 * XODIMLAR RO'YXATI (qobiqning "Ro'yxat" tabi).
 *
 * Markazda ishlaydigan hamma odam bitta ro'yxatda:
 * ega, o'qituvchilar va owner yaratgan custom rollar (direktor,
 * administrator, buxgalter...). O'quvchilar bu yerda YO'Q - ular
 * o'zining sahifasida.
 *
 * Yuqorida rol kesimidagi kartochkalar: raqamni ko'rgan odam darhol
 * "kimlar ekan?" deb bosishi mumkin - kartochka ro'yxatni filtrlaydi.
 */
const StaffListTab = () => {
  const { openModal } = useModal();

  const obj = useObjectState({
    search: "",
    role: null,
    status: "active",
    sort: "createdAt",
    order: "desc",
    page: 1,
  });
  const debouncedSearch = useDebounce(obj.search);

  const effectiveStatus = allowedStatusesForTab("staff").includes(obj.status)
    ? obj.status
    : "active";

  const { data: stats } = useStaffStatsQuery();
  const { data, isLoading } = useUsersListQuery({
    staff: 1,
    role: obj.role || undefined,
    search: debouncedSearch || undefined,
    status: effectiveStatus,
    sort: obj.sort,
    order: obj.order,
    page: obj.page,
    limit: LIMIT,
  });

  const rows = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const activeRoleLabel = obj.role
    ? stats?.byRole?.find((r) => r.role === obj.role)?.label || obj.role
    : null;

  const handleSort = (field) => {
    if (obj.sort === field) {
      obj.setFields({ order: obj.order === "asc" ? "desc" : "asc", page: 1 });
    } else {
      obj.setFields({ sort: field, order: "asc", page: 1 });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportButton
          size="default"
          datasetKey="staff"
          title="Xodimlarni Excelga yuklash"
          filters={{
            status: effectiveStatus,
            search: debouncedSearch || undefined,
          }}
        />
      </div>

      <StaffStatCards
        data={stats}
        activeRole={obj.role}
        onRoleClick={(role) =>
          obj.setFields({ role: obj.role === role ? null : role, page: 1 })
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex-1">
            <InputField
              name="search"
              type="search"
              value={obj.search}
              placeholder="Ism, familiya, login yoki telefon..."
              onChange={(e) =>
                obj.setFields({ search: e.target.value, page: 1 })
              }
            />
          </div>
          {activeRoleLabel && (
            <button
              type="button"
              onClick={() => obj.setFields({ role: null, page: 1 })}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-card px-2.5 py-1.5 text-sm hover:bg-muted"
              title="Rol filtrini olib tashlash"
            >
              {activeRoleLabel}
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <UserStatusFilter
          value={effectiveStatus}
          onChange={(status) => obj.setFields({ status, page: 1 })}
          tab="staff"
        />
      </div>

      <StaffTable
        rows={rows}
        isLoading={isLoading}
        status={effectiveStatus}
        startIndex={(obj.page - 1) * LIMIT}
        sort={obj.sort}
        order={obj.order}
        onSort={handleSort}
      />

      {totalPages > 1 && (
        <Pagination
          currentPage={obj.page}
          onPageChange={(page) => obj.setField("page", page)}
          totalPages={totalPages}
          hasNextPage={obj.page < totalPages}
          hasPrevPage={obj.page > 1}
        />
      )}

      {/* Qator modallari. STAFF_CREATE bu yerda YO'Q - u global mount
          qilingan (owner/components/CreateModals), ikkinchi marta mount
          qilinsa bitta openModal ikkita oyna ochardi. */}
      <UserModals />
      <ModalWrapper
        name={MODAL.USER_BRANCH}
        title="Filial biriktiruvi"
        className="max-w-xl"
      >
        <UserBranchModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.STAFF_ROLE} title="Rolni o'zgartirish">
        <StaffRoleModal />
      </ModalWrapper>
    </div>
  );
};

export default StaffListTab;
