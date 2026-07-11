import { useState } from "react";
import { Plus } from "lucide-react";
import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useModal from "@/shared/hooks/useModal";
import useAuth from "@/shared/hooks/useAuth";
import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";
import { formatDateUz } from "@/shared/utils/formatDate";

import {
  FeedbackStatusBadge,
  FeedbackSubmitModal,
  useMyFeedbackQuery,
} from "@/owner/features/feedback";

const FeedbackCard = ({ feedback: f }) => (
  <Card className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate font-medium">
        {f.type?.name || "Feedback"}
      </span>
      <FeedbackStatusBadge status={f.status} />
    </div>
    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
      {f.message}
    </p>
    <p className="text-xs text-muted-foreground">
      {formatDateUz(f.createdAt)}
      {f.group?.name ? ` • ${f.group.name}` : ""}
    </p>
    {f.adminReply && (
      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <p className="font-medium text-xs text-blue-900 mb-1">Admin javobi:</p>
        <p className="whitespace-pre-wrap">{f.adminReply}</p>
      </div>
    )}
    {f.rejectionReason && (
      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm">
        <p className="font-medium text-xs text-red-900 mb-1">Rad etish sababi:</p>
        <p className="whitespace-pre-wrap">{f.rejectionReason}</p>
      </div>
    )}
  </Card>
);

const MyFeedbackPage = () => {
  const { openModal } = useModal();
  const { role } = useAuth();
  // O'quvchida guruhlar ro'yxatiga ruxsat yo'q - guruh tanlagichni yashiramiz
  const showGroupPicker = role !== ROLES.STUDENT;
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useMyFeedbackQuery({ page, limit });
  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Mening feedback'larim</h1>
        <Button onClick={() => openModal(MODAL.FEEDBACK_SUBMIT)}>
          <Plus className="size-4" />
          Yangi feedback
        </Button>
      </header>

      <p className="text-xs text-muted-foreground">
        Anonim yuborilgan feedback'lar bu ro'yxatda ko'rinmaydi.
      </p>

      {isLoading ? (
        <Card>
          <p className="text-center text-muted-foreground">Yuklanmoqda...</p>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-center text-muted-foreground">
            Hali feedback yo'q
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <FeedbackCard key={f._id} feedback={f} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          onPageChange={setPage}
          totalPages={totalPages}
          hasNextPage={page < totalPages}
          hasPrevPage={page > 1}
        />
      )}

      <ModalWrapper name={MODAL.FEEDBACK_SUBMIT} title="Yangi feedback">
        <FeedbackSubmitModal showGroupPicker={showGroupPicker} />
      </ModalWrapper>
    </div>
  );
};

export default MyFeedbackPage;
