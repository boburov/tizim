// React
import { useEffect, useState } from "react";

// Components
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ApprovalDetailSheet from "./ApprovalDetailSheet";
import MissedApprovalsModal from "./modals/MissedApprovalsModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useApprovalNotifier from "../hooks/useApprovalNotifier";
import useExpenseApprovalsQuery from "../hooks/useExpenseApprovalsQuery";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Sessiya davomida "Keyinroq" bosilganini eslab qolish kaliti.
// sessionStorage: yangi kirishda oyna QAYTA chiqishi kerak, lekin sahifa
// yangilanganda emas - localStorage bo'lsa boshqa kunlari ham chiqmasdi.
const DISMISS_KEY = "approvals:missedDismissed";

const MISSED_PARAMS = { status: "pending", limit: 5, sort: "-createdAt" };

/**
 * Tasdiq bildirishnomalarining YAGONA mount nuqtasi.
 *
 * Ikki vazifa:
 *  1. Sessiya davomida kelgan yangi so'rovlarni yonboshdan toast qilib
 *     chiqarish (useApprovalNotifier).
 *  2. Kirganda kutilayotgan so'rovlar bo'lsa, ularni oyna bilan so'rash.
 *
 * BIR MARTA mount qilinadi (AppSidebar ichida, owner paneli uchun) -
 * ikkinchi nusxa har so'rovni ikki marta ko'rsatardi.
 */
const ApprovalNotifier = () => {
  const { openModal } = useModal();
  const { hasAny } = usePermissions();
  const [detail, setDetail] = useState(null);

  // Qaror qabul qila oladiganlar uchungina - shunchaki ko'ra oladigan
  // buxgalterni har kirishda oyna bilan to'sish ma'nosiz.
  const canDecide = hasAny([
    PERMISSIONS.FINANCE_APPROVE,
    PERMISSIONS.APPROVALS_DECIDE_CONFIG,
  ]);

  useApprovalNotifier({ enabled: canDecide, onOpenDetail: setDetail });

  const { data } = useExpenseApprovalsQuery(MISSED_PARAMS, {
    enabled: canDecide,
  });

  const items = data?.data;
  const total = data?.meta?.total || 0;

  useEffect(() => {
    if (!canDecide || !items?.length) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    sessionStorage.setItem(DISMISS_KEY, "1");
    openModal(MODAL.APPROVAL_MISSED, { approvals: items, total });
    // `openModal` har renderda yangi funksiya - bog'liqlikka qo'shilsa
    // effect qayta ishga tushib, oyna yopilgan zahoti qayta ochilardi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDecide, items, total]);

  if (!canDecide) return null;

  return (
    <>
      <ModalWrapper
        name={MODAL.APPROVAL_MISSED}
        title="Sizni kutayotgan tasdiqlar"
        className="max-w-lg"
      >
        <MissedApprovalsModal />
      </ModalWrapper>

      <ApprovalDetailSheet
        approval={detail}
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
      />
    </>
  );
};

export default ApprovalNotifier;
