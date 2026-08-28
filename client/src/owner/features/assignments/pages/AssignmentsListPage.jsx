// React
import { useState } from "react";

// Icons
import { Plus } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import AssignmentsTable from "../components/AssignmentsTable";
import AssignmentSendModal from "../components/modals/AssignmentSendModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import { useAssignmentsQuery } from "../hooks/useAssignmentsQuery";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

const LIMIT = 20;

/**
 * VAZIFALAR RO'YXATI.
 *
 * Owner va o'qituvchi panellari ayni shu sahifadan foydalanadi - farq
 * faqat `basePath` da. Server ko'lamni o'zi kesadi: o'qituvchiga faqat
 * o'zi yuborganlari qaytadi.
 */
const AssignmentsListPage = ({ basePath = "/owner/assignments" }) => {
  const { openModal } = useModal();
  const { has } = usePermissions();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAssignmentsQuery({ page, limit: LIMIT });
  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const canSend = has(PERMISSIONS.ASSIGNMENTS_SEND);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vazifalar</h1>
        </div>
        {canSend && (
          <Button onClick={() => openModal(MODAL.ASSIGNMENT_SEND)}>
            <Plus className="size-4" />
            Yangi vazifa
          </Button>
        )}
      </header>

      <AssignmentsTable
        items={items}
        isLoading={isLoading}
        basePath={basePath}
        rowClassName="border-b border-border/60 last:border-0"
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

      <ModalWrapper
        name={MODAL.ASSIGNMENT_SEND}
        title="Yangi vazifa yuborish"
        className="max-w-2xl"
      >
        <AssignmentSendModal />
      </ModalWrapper>
    </div>
  );
};

export default AssignmentsListPage;
