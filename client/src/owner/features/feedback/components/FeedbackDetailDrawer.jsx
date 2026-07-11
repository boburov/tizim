import { Link } from "react-router-dom";
import { ExternalLink, UserCircle2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/shadcn/sheet";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import { formatDateUz } from "@/shared/utils/formatDate";
import { MODAL } from "@/shared/constants/modals";

import FeedbackStatusBadge from "./FeedbackStatusBadge";
import FeedbackActionsBar from "./FeedbackActionsBar";
import ReplyModal from "./modals/ReplyModal";
import ResolveModal from "./modals/ResolveModal";
import RejectModal from "./modals/RejectModal";
import { useFeedbackDetailQuery } from "../hooks/useFeedbackQueries";

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{children || "-"}</span>
  </div>
);

const FeedbackDetailDrawer = ({ id, open, onClose }) => {
  const { data: f, isLoading } = useFeedbackDetailQuery(open ? id : undefined);
  const isAnonymous = f?.isAnonymous || !f?.author;

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="space-y-0 border-b px-5 py-4 text-left">
            <div className="flex items-center justify-between gap-3 pr-8">
              <SheetTitle className="text-base">
                {f?.type?.name || "Feedback"}
              </SheetTitle>
              {f && <FeedbackStatusBadge status={f.status} withIcon />}
            </div>
            {id && (
              <Link
                to={`/owner/feedback/${id}`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                To'liq sahifada ochish
                <ExternalLink className="size-3" />
              </Link>
            )}
          </SheetHeader>

          {isLoading || !f ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <FeedbackActionsBar feedback={f} />

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Xabar matni</p>
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                  {f.message}
                </p>
              </div>

              <div className="divide-y rounded-md border px-3">
                <Row label="Muallif">
                  {isAnonymous ? (
                    <span className="inline-flex items-center gap-1 italic text-muted-foreground">
                      <UserCircle2 className="size-3.5" />
                      Anonim
                    </span>
                  ) : (
                    `${f.author.firstName} ${f.author.lastName}`
                  )}
                </Row>
                <Row label="Rol">{f.authorRoleSnapshot}</Row>
                <Row label="Guruh">{f.group?.name}</Row>
                <Row label="Sana">{formatDateUz(f.createdAt)}</Row>
              </div>

              {f.adminReply && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Admin javobi</p>
                  <p className="whitespace-pre-wrap rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
                    {f.adminReply}
                  </p>
                </div>
              )}

              {f.rejectionReason && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-red-700">
                    Rad etish sababi
                  </p>
                  <p className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50/50 p-3 text-sm">
                    {f.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Drawer ichidagi amal modallari */}
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
    </>
  );
};

export default FeedbackDetailDrawer;
