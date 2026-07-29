// Hooks
import usePermissions from "@/shared/hooks/usePermissions";
import usePendingApprovalsCount from "@/owner/features/expenseApprovals/hooks/usePendingApprovalsCount";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

/**
 * Sidebar'dagi "Tasdiqlar" linki yonidagi kutilayotgan so'rovlar soni.
 *
 * So'rov FAQAT o'qish huquqi borlarda yuboriladi - aks holda har bir
 * foydalanuvchi 30 soniyada bir marta 403 oladigan bo'lardi.
 */
const ApprovalsBadge = ({ className = "" }) => {
  const { hasAny } = usePermissions();

  const canSee = hasAny([
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.APPROVALS_DECIDE_CONFIG,
  ]);

  const { data: count = 0 } = usePendingApprovalsCount({ enabled: canSee });

  if (!count) return null;

  return (
    <span
      className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-medium leading-none ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
};

export default ApprovalsBadge;
