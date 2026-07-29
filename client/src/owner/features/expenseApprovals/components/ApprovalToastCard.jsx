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

/**
 * Yonboshdan chiqadigan bildirishnoma kartasi.
 *
 * ✓/✗ tugmalari TO'G'RIDAN-TO'G'RI shu yerda: yangi so'rov kelganda
 * administrator sahifaga o'tmasdan qaror qabul qila olishi kerak.
 *
 * Huquq mantig'i `useApprovalPermissions` dan keladi - jadval, batafsil
 * paneli va kirish modali bilan AYNAN bir xil qoida.
 */
const ApprovalToastCard = ({ approval, onClose, onOpenDetail }) => {
  const { resolve } = useApprovalPermissions();
  const { canDecide, reason } = resolve(approval);

  const { mutate: approve, isPending: approving } = useApproveMutation({
    onSuccess: onClose,
  });
  const { mutate: reject, isPending: rejecting } = useRejectMutation({
    onSuccess: onClose,
  });
  const busy = approving || rejecting;

  return (
    <div className="w-[356px] max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500">Yangi tasdiq so'rovi</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className="-mr-1 -mt-1 rounded p-1 text-zinc-400 transition hover:bg-muted hover:text-zinc-600"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onOpenDetail?.(approval)}
        className="w-full text-left"
      >
        <ApprovalKindCell approval={approval} />
      </button>

      <div className="mt-2 space-y-0.5">
        <p className="text-sm font-semibold">{approvalHeadline(approval)}</p>
        <p className="text-xs text-zinc-500">
          {fullName(approval.requestedBy)}
          {approval.branchId?.name ? ` · ${approval.branchId.name}` : ""}
        </p>
      </div>

      {canDecide ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => approve({ id: approval._id })}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check size={15} strokeWidth={2.5} />
            Tasdiqlash
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => reject({ id: approval._id })}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            <X size={15} strokeWidth={2.5} />
            Rad etish
          </button>
        </div>
      ) : (
        reason && <p className="mt-2 text-xs text-amber-600">{reason}</p>
      )}
    </div>
  );
};

export default ApprovalToastCard;
