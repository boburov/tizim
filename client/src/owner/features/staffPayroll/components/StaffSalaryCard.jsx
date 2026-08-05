// Icons
import { Calculator, Pencil, Wallet } from "lucide-react";

// Components
import Badge from "@/shared/components/ui/badge/Badge";
import Button from "@/shared/components/ui/button/Button";
import Card from "@/shared/components/ui/card/Card";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import CompensationModal from "./modals/CompensationModal";
import PayrollPreviewModal from "./modals/PayrollPreviewModal";
import PayrollTimeline from "./PayrollTimeline";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import {
  useStaffCompensationsQuery,
  useStaffPayrollHistoryQuery,
} from "../hooks/useStaffPayroll";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUzLong } from "@/shared/utils/formatDate";

const TYPE_LABELS = {
  fixed: "Qat'iy oylik",
  fixed_plus_kpi: "Oylik + KPI",
  kpi_only: "Faqat KPI",
};

/**
 * XODIM PROFILIDAGI MAOSH BO'LIMI.
 *
 * Uch savolga javob beradi: qanday shartnoma, oxirgi oylarda qancha
 * hisoblangan, qancha to'langan. Batafsil hisob - Xodimlar > Maoshlar
 * sahifasida.
 */
const StaffSalaryCard = ({ employee }) => {
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { isOwner } = useAuth();

  const employeeId = employee?._id;
  const { data: comp } = useStaffCompensationsQuery(employeeId);
  const { data: history } = useStaffPayrollHistoryQuery(employeeId);

  const canRead = has(PERMISSIONS.PAYROLL_READ) || isOwner;
  const canManage = has(PERMISSIONS.PAYROLL_MANAGE) || isOwner;
  if (!canRead) return null;

  const active = comp?.active;
  const items = history?.items || [];

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          <h3 className="font-semibold">Maosh</h3>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            {active && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openModal(MODAL.PAYROLL_PREVIEW, { employee })}
                title="Yetishmayotgan oylarni yaratish"
              >
                <Calculator className="size-3.5" />
                Maosh yaratish
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openModal(MODAL.STAFF_COMPENSATION_SET, { employee, active })
              }
            >
              <Pencil className="size-3.5" />
              {active ? "O'zgartirish" : "Belgilash"}
            </Button>
          </div>
        )}
      </div>

      {active ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{TYPE_LABELS[active.salaryType]}</Badge>
            {active.salaryType !== "kpi_only" && (
              <span className="font-medium tabular-nums">
                {formatMoney(active.baseAmount)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateUzLong(active.effectiveFrom)} dan amal qiladi
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Maosh shartnomasi belgilanmagan - bu xodimga maosh hisoblanmaydi.
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          {items.slice(0, 4).map((p) => (
            <div key={p._id} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {String(p.month).padStart(2, "0")}.{p.year}
              </span>
              <span className="tabular-nums">
                {formatMoney(p.finalAmount)}
                {p.paidAmount < p.finalAmount && (
                  <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-300">
                    qoldiq {formatMoney(p.finalAmount - p.paidAmount)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* MOLIYAVIY TAYMLAYN - "hech narsa tarixdan yo'qolmaydi". */}
      <div className="border-t pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Moliyaviy tarix
        </p>
        <PayrollTimeline employeeId={employeeId} limit={6} />
      </div>

      <ModalWrapper
        name={MODAL.STAFF_COMPENSATION_SET}
        title="Maosh shartnomasi"
        className="max-w-lg"
      >
        <CompensationModal />
      </ModalWrapper>
      <ModalWrapper
        name={MODAL.PAYROLL_PREVIEW}
        title="Maosh yaratish - avval ko'rish"
        className="max-w-lg"
      >
        <PayrollPreviewModal />
      </ModalWrapper>
    </Card>
  );
};

export default StaffSalaryCard;
