// Icons
import { Check, X, RotateCw, Ban } from "lucide-react";

// Components
import {
  Sheet,
  SheetTitle,
  SheetHeader,
  SheetContent,
} from "@/shared/components/shadcn/sheet";
import Button from "@/shared/components/ui/button/Button";
import ApprovalStatusPill from "./ApprovalStatusPill";
import ApprovalKindCell from "./ApprovalKindCell";

// Hooks
import useApprovalPermissions from "../hooks/useApprovalPermissions";

// Utils
import { approvalHeadline, fullName } from "../utils/approvalSummary";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateTimeUz } from "@/shared/utils/formatDate";

// Constants
import { CATEGORY_LABELS } from "../constants";

const Row = ({ label, children }) =>
  children ? (
    <div className="flex gap-3 py-2 text-sm">
      <span className="w-32 shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  ) : null;

/**
 * Batafsil paneli - jadvalga sig'magan hamma narsa shu yerda.
 *
 * NEGA KERAK: kartadan jadvalga o'tishda `requestNote`, `decisionNote`,
 * `failureReason`, limit kabi maydonlar ustun sifatida sig'maydi. Ular
 * yo'qolib ketmasligi uchun qator bosilganda shu panel ochiladi va
 * ✓/✗ tugmalari ham AYNAN shu yerda turadi.
 */
const ApprovalDetailSheet = ({
  approval,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onCancel,
  onRetry,
  busy = false,
}) => {
  const { resolve } = useApprovalPermissions();
  const { canDecide, canCancel, canRetry, reason } = resolve(approval);

  if (!approval) return null;

  const isConfig = approval.category === "configuration";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle className="sr-only">So'rov tafsilotlari</SheetTitle>
          <ApprovalKindCell approval={approval} />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xl font-semibold">{approvalHeadline(approval)}</p>
            <ApprovalStatusPill status={approval.status} />
          </div>

          <div className="divide-y">
            <Row label="Kategoriya">{CATEGORY_LABELS[approval.category]}</Row>
            <Row label="Filial">{approval.branchId?.name}</Row>
            <Row label="So'rovchi">
              {fullName(approval.requestedBy)}
              <span className="block text-xs text-zinc-500">
                {formatDateTimeUz(approval.createdAt)}
              </span>
            </Row>

            {/* Limit faqat CHIQIM so'rovida ma'noga ega - sozlama
                o'zgarishi summaga solishtirilmaydi. */}
            {!isConfig && approval.thresholdAtRequest != null && (
              <Row label="Limit">{formatMoney(approval.thresholdAtRequest)}</Row>
            )}

            {isConfig && approval.payload?.startDate && (
              <Row label="Amal qilish">
                {approval.payload.startDate}
                {approval.payload.endDate
                  ? ` — ${approval.payload.endDate}`
                  : " dan boshlab"}
              </Row>
            )}

            <Row label="Izoh">{approval.requestNote}</Row>

            {approval.decidedBy && (
              <Row label="Qaror">
                {fullName(approval.decidedBy)}
                {approval.decidedAt && (
                  <span className="block text-xs text-zinc-500">
                    {formatDateTimeUz(approval.decidedAt)}
                  </span>
                )}
                {approval.decisionNote && (
                  <span className="block text-xs">{approval.decisionNote}</span>
                )}
              </Row>
            )}

            {approval.failureReason && (
              <div className="py-2">
                <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">
                  {approval.failureReason}
                </p>
              </div>
            )}
          </div>

          {reason && <p className="mt-4 text-xs text-amber-600">{reason}</p>}
        </div>

        {(canDecide || canCancel || canRetry) && (
          <div className="flex gap-2 border-t p-4">
            {canDecide && (
              <>
                <Button
                  type="button"
                  disabled={busy}
                  className="flex-1"
                  onClick={() => onApprove?.(approval)}
                >
                  <Check size={16} strokeWidth={2} />
                  Tasdiqlash
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  className="flex-1"
                  onClick={() => onReject?.(approval)}
                >
                  <X size={16} strokeWidth={2} />
                  Rad etish
                </Button>
              </>
            )}
            {canCancel && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="flex-1"
                onClick={() => onCancel?.(approval)}
              >
                <Ban size={16} strokeWidth={2} />
                So'rovni bekor qilish
              </Button>
            )}
            {canRetry && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="flex-1"
                onClick={() => onRetry?.(approval)}
              >
                <RotateCw size={16} strokeWidth={2} />
                Qayta urinish
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ApprovalDetailSheet;
