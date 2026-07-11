import { useParams } from "react-router-dom";
import { UserCircle2 } from "lucide-react";
import Card from "@/shared/components/ui/card/Card";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import Button from "@/shared/components/ui/button/Button";
import { formatDateUz } from "@/shared/utils/formatDate";
import { MODAL } from "@/shared/constants/modals";

import FeedbackStatusBadge from "../components/FeedbackStatusBadge";
import FeedbackActionsBar from "../components/FeedbackActionsBar";
import ReplyModal from "../components/modals/ReplyModal";
import ResolveModal from "../components/modals/ResolveModal";
import RejectModal from "../components/modals/RejectModal";
import { useFeedbackDetailQuery } from "../hooks/useFeedbackQueries";
import BackLink from "@/shared/components/ui/link/BackLink";
import useGoBack from "@/shared/hooks/useGoBack";

const InfoRow = ({ label, children }) => (
  <div className="flex justify-between gap-3 py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{children || "-"}</span>
  </div>
);

const FeedbackDetailPage = () => {
  const { id } = useParams();
  const goBack = useGoBack("/owner/feedback");
  const { data: f, isLoading } = useFeedbackDetailQuery(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Skeleton className="h-40 lg:col-span-2" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }
  if (!f) {
    return (
      <div className="space-y-4">
        <BackLink to="/owner/feedback" />
        <EmptyState
          title="Feedback topilmadi"
          description="Bu murojaat o'chirilgan yoki mavjud emas."
          action={
            <Button variant="outline" size="sm" onClick={goBack}>
              Ro'yxatga qaytish
            </Button>
          }
        />
      </div>
    );
  }

  const isAnonymous = f.isAnonymous || !f.author;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <BackLink to="/owner/feedback" />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{f.type?.name || "Feedback"}</h1>
          <FeedbackStatusBadge status={f.status} withIcon />
          {isAnonymous && (
            <span className="inline-flex items-center gap-1 text-sm italic text-muted-foreground">
              <UserCircle2 className="size-3.5" />
              Anonim
            </span>
          )}
        </div>
      </header>

      <FeedbackActionsBar feedback={f} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="space-y-2 lg:col-span-2">
          <h3 className="font-semibold">Xabar matni</h3>
          <p className="whitespace-pre-wrap text-sm">{f.message}</p>
        </Card>

        <Card className="space-y-2">
          <h3 className="font-semibold">Ma'lumot</h3>
          <InfoRow label="Muallif">
            {isAnonymous
              ? "Anonim"
              : `${f.author.firstName} ${f.author.lastName}`}
          </InfoRow>
          <InfoRow label="Rol">{f.authorRoleSnapshot}</InfoRow>
          <InfoRow label="Guruh">{f.group?.name}</InfoRow>
          <InfoRow label="Sana">{formatDateUz(f.createdAt)}</InfoRow>
          {f.reviewedAt && (
            <InfoRow label="Ko'rib chiqilgan">
              {formatDateUz(f.reviewedAt)}
              {f.reviewedBy && ` (${f.reviewedBy.firstName})`}
            </InfoRow>
          )}
          {f.repliedAt && (
            <InfoRow label="Javob berilgan">
              {formatDateUz(f.repliedAt)}
              {f.repliedBy && ` (${f.repliedBy.firstName})`}
            </InfoRow>
          )}
          {f.resolvedAt && (
            <InfoRow label="Yopilgan">
              {formatDateUz(f.resolvedAt)}
              {f.resolvedBy && ` (${f.resolvedBy.firstName})`}
            </InfoRow>
          )}
        </Card>
      </div>

      {f.adminReply && (
        <Card className="space-y-2">
          <h3 className="font-semibold">Admin javobi</h3>
          <p className="text-sm whitespace-pre-wrap">{f.adminReply}</p>
        </Card>
      )}

      {f.rejectionReason && (
        <Card className="space-y-2 border-red-200 bg-red-50/40">
          <h3 className="font-semibold text-red-700">Rad etish sababi</h3>
          <p className="text-sm whitespace-pre-wrap">{f.rejectionReason}</p>
        </Card>
      )}

      <ModalWrapper
        title="Javob yozish"
        name={MODAL.FEEDBACK_REPLY}
        description="Javob foydalanuvchiga xabar sifatida yuboriladi"
      >
        <ReplyModal />
      </ModalWrapper>

      <ModalWrapper
        title="Hal qilingan"
        name={MODAL.FEEDBACK_RESOLVE}
        description="Status Hal qilindi ga o'zgaradi va muallifga avto-xabar yuboriladi"
      >
        <ResolveModal />
      </ModalWrapper>

      <ModalWrapper
        title="Rad etish"
        name={MODAL.FEEDBACK_REJECT}
        description="Status Rad etildi ga o'zgaradi va muallifga avto-xabar yuboriladi"
      >
        <RejectModal />
      </ModalWrapper>
    </div>
  );
};

export default FeedbackDetailPage;
