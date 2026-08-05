// Icons
import { Calculator, Wallet } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import SelectField from "@/shared/components/ui/select/SelectField";
import StatCard from "@/shared/components/ui/card/StatCard";
import StaffPayrollTable from "../components/StaffPayrollTable";
import PayrollDetailModal from "../components/modals/PayrollDetailModal";
import StaffPayoutModal from "../components/modals/StaffPayoutModal";
import AdjustmentModal from "../components/modals/AdjustmentModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useAuth from "@/shared/hooks/useAuth";
import useObjectState from "@/shared/hooks/useObjectState";
import usePermissions from "@/shared/hooks/usePermissions";
import {
  useStaffPayrollListQuery,
  useGenerateMonthMutation,
} from "../hooks/useStaffPayroll";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

const LIMIT = 20;

const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

const STATUS_OPTIONS = [
  { value: "", label: "Barcha holat" },
  { value: "unpaid", label: "To'lanmagan" },
  { value: "partial", label: "Qisman" },
  { value: "paid", label: "To'langan" },
];

/**
 * XODIMLAR MAOSHI - oylik ro'yxat.
 *
 * Qator bosilganda tafsilot ochiladi: har so'm qayerdan kelgani
 * (KPI qatorlari, bonuslar, jarimalar, to'lovlar) o'sha yerda.
 */
const StaffPayrollTab = () => {
  const now = new Date();
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { isOwner } = useAuth();

  const obj = useObjectState({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    status: "",
    page: 1,
  });

  const { data, isLoading } = useStaffPayrollListQuery({
    year: obj.year,
    month: obj.month,
    status: obj.status || undefined,
    page: obj.page,
    limit: LIMIT,
  });

  const { mutate: generate, isPending: generating } = useGenerateMonthMutation();

  const rows = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const canManage = has(PERMISSIONS.PAYROLL_MANAGE) || isOwner;

  // Kartochkalar - joriy sahifadagi qatorlar bo'yicha yig'indi.
  const totals = rows.reduce(
    (acc, p) => ({
      final: acc.final + (p.finalAmount || 0),
      paid: acc.paid + (p.paidAmount || 0),
      kpi: acc.kpi + (p.autoKpiTotal || 0),
    }),
    { final: 0, paid: 0, kpi: 0 },
  );

  const yearOptions = [now.getUTCFullYear(), now.getUTCFullYear() - 1].map((y) => ({
    value: String(y),
    label: String(y),
  }));

  return (
    <div className="space-y-4 pt-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <SelectField
            name="month"
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            value={String(obj.month)}
            onChange={(v) =>
              obj.setFields({ month: Number(v?.target?.value ?? v), page: 1 })
            }
            className="w-36"
          />
          <SelectField
            name="year"
            options={yearOptions}
            value={String(obj.year)}
            onChange={(v) =>
              obj.setFields({ year: Number(v?.target?.value ?? v), page: 1 })
            }
            className="w-28"
          />
          <SelectField
            name="status"
            options={STATUS_OPTIONS}
            value={obj.status}
            onChange={(v) => obj.setFields({ status: v?.target?.value ?? v, page: 1 })}
            className="w-40"
          />
        </div>

        {canManage && (
          <Button
            variant="outline"
            disabled={generating}
            onClick={() => generate({ year: obj.year, month: obj.month })}
          >
            <Calculator className="size-4" />
            {generating ? "Hisoblanmoqda..." : "Hisoblash"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Jami hisoblangan"
          value={totals.final}
          isMoney
          hint={`${rows.length} ta xodim`}
        />
        <StatCard
          icon={Wallet}
          label="To'langan"
          value={totals.paid}
          isMoney
          tone="positive"
          hint={`Qoldiq: ${Math.max(0, totals.final - totals.paid).toLocaleString("uz-UZ")} so'm`}
        />
        <StatCard
          icon={Wallet}
          label="Shundan KPI"
          value={totals.kpi}
          isMoney
          tone="info"
          hint="Avtomatik hisoblangan mukofot"
        />
      </div>

      <StaffPayrollTable
        rows={rows}
        isLoading={isLoading}
        onRowClick={(p) => openModal(MODAL.STAFF_PAYROLL_DETAIL, { payrollId: p._id })}
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

      <ModalWrapper
        name={MODAL.STAFF_PAYROLL_DETAIL}
        title="Maosh tafsiloti"
        className="max-w-2xl"
      >
        <PayrollDetailModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.STAFF_PAYOUT} title="Maosh to'lash">
        <StaffPayoutModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.STAFF_ADJUSTMENT} title="Bonus / jarima">
        <AdjustmentModal />
      </ModalWrapper>
    </div>
  );
};

export default StaffPayrollTab;
