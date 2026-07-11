import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";

import {
  NotificationsTable,
  SendWizard,
  useNotificationsQuery,
} from "@/owner/features/notifications";

const TeacherNotificationsListPage = () => {
  const { openModal } = useModal();
  const [page, setPage] = useState(1);
  const limit = 20;

  // Server avto sender=me filter qiladi (teacher rol)
  const { data, isLoading } = useNotificationsQuery({ page, limit });
  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Yuborilgan xabarlar</h1>
        </div>
        <Button onClick={() => openModal(MODAL.NOTIFICATION_SEND)}>
          <Plus className="size-4" />
          Yangi xabar
        </Button>
      </header>

      <NotificationsTable
        items={items}
        isLoading={isLoading}
        basePath="/teacher/notifications"
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
        name={MODAL.NOTIFICATION_SEND}
        title="Yangi xabar yuborish"
        className="max-w-3xl"
      >
        <SendWizard />
      </ModalWrapper>
    </div>
  );
};

export default TeacherNotificationsListPage;
