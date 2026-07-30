// Icons
import { Check, X } from "lucide-react";

// Components
import ApprovalKindCell from "./ApprovalKindCell";

// Hooks
import useApprovalPermissions from "../hooks/useApprovalPermissions";
import {
  useApproveMutation,
  useRejectMutation,
} from "../hooks/useExpenseApprovalMutations";

// Utils
import { approvalHeadline, fullName } from "../utils/approvalSummary";
import { formatDateTimeUz } from "@/shared/utils/formatDate";

/**
 * Bitta so'rov + ✓/✗ tugmalari.
 *
 * Yonbosh paneli va kirish oynasi AYNAN shu qatordan foydalanadi -
 * ikkalasida alohida yozilsa, huquq tekshiruvi bir joyda eskirib qolardi.
 */
const ApprovalQuickRow = ({ approval, onOpenDetail }) => {
  const { resolve } = useApprovalPermissions();
  const { canDecide, reason } = resolve(approval);

  const { mutate: approve, isPending: approving } = useApproveMutation();
  const { mutate: reject, isPending: rejecting } = useRejectMutation();
  const busy = approving || rejecting;

  return (
    <div className="rounded-lg border p-3">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onOpenDetail?.(approval)}
      >
        <ApprovalKindCell approval={approval} />
      </button>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{approvalHeadline(approval)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {fullName(approval.requestedBy)} ·{" "}
            {formatDateTimeUz(approval.createdAt)}
          </p>
        </div>

        {canDecide ? (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              disabled={busy}
              aria-label="Tasdiqlash"
              onClick={() => approve({ id: approval._id })}
              className="inline-flex size-9 items-center justify-center rounded-md bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label="Rad etish"
              onClick={() => reject({ id: approval._id })}
              className="inline-flex size-9 items-center justify-center rounded-md border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 transition hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          reason && (
            <p className="max-w-[45%] shrink-0 text-right text-xs text-amber-600 dark:text-amber-300">
              {reason}
            </p>
          )
        )}
      </div>
    </div>
  );
};

export default ApprovalQuickRow;
