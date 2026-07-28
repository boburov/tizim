// Icons
import { Check, X, Clock, AlertTriangle, RotateCw, Ban } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import {
  useApproveMutation,
  useRejectMutation,
  useCancelApprovalMutation,
} from "../hooks/useExpenseApprovalMutations";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateTimeUz } from "@/shared/utils/formatDate";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

const KIND_LABELS = {
  salary_payment: "O'qituvchi maoshi",
  deposit_withdraw: "Depozitdan yechish",
};

const STATUS_META = {
  pending: { label: "Kutilmoqda", cls: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Tasdiqlandi", cls: "bg-blue-100 text-blue-700", icon: Check },
  executed: { label: "Bajarildi", cls: "bg-emerald-100 text-emerald-700", icon: Check },
  rejected: { label: "Rad etildi", cls: "bg-red-100 text-red-700", icon: X },
  canceled: { label: "Bekor qilindi", cls: "bg-gray-100 text-gray-600", icon: Ban },
  failed: { label: "Xato", cls: "bg-red-100 text-red-700", icon: AlertTriangle },
};

const fullName = (u) =>
  u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username : "—";

const ApprovalCard = ({ approval }) => {
  const { user } = useAuth();
  const { has } = usePermissions();
  const { mutate: approve, isPending: approving } = useApproveMutation();
  const { mutate: reject, isPending: rejecting } = useRejectMutation();
  const { mutate: cancel, isPending: canceling } = useCancelApprovalMutation();

  const meta = STATUS_META[approval.status] || STATUS_META.pending;
  const StatusIcon = meta.icon;
  const isPending = approval.status === "pending";

  // O'z so'rovini o'zi tasdiqlay olmaydi - server ham to'sadi, lekin
  // tugmani ko'rsatmaslik ham kerak (foydalanuvchi chalg'imasin).
  const isOwnRequest = String(approval.requestedBy?._id) === String(user?._id);
  const canDecide = has(PERMISSIONS.FINANCE_APPROVE) && isPending && !isOwnRequest;
  const canCancel = isPending && isOwnRequest;
  const busy = approving || rejecting || canceling;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold">{formatMoney(approval.amount)}</span>
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${meta.cls}`}
            >
              <StatusIcon size={12} strokeWidth={2} />
              {meta.label}
            </span>
          </div>
          <p className="text-sm opacity-70 mt-1">
            {KIND_LABELS[approval.kind] || approval.kind}
            {approval.subjectName ? ` — ${approval.subjectName}` : ""}
          </p>
          {approval.contextName && (
            <p className="text-xs opacity-60">{approval.contextName}</p>
          )}
        </div>

        {approval.branchId?.name && (
          <span className="text-xs opacity-60 shrink-0">{approval.branchId.name}</span>
        )}
      </div>

      <div className="text-xs opacity-70 space-y-0.5">
        <div>
          So'rovchi: <span className="font-medium">{fullName(approval.requestedBy)}</span>
          {" · "}
          {formatDateTimeUz(approval.createdAt)}
        </div>
        {approval.thresholdAtRequest != null && (
          <div>Limit: {formatMoney(approval.thresholdAtRequest)}</div>
        )}
        {approval.requestNote && <div>Izoh: {approval.requestNote}</div>}
        {approval.decidedBy && (
          <div>
            Qaror: <span className="font-medium">{fullName(approval.decidedBy)}</span>
            {approval.decisionNote ? ` — ${approval.decisionNote}` : ""}
          </div>
        )}
        {approval.failureReason && (
          <div className="text-red-600">Xato: {approval.failureReason}</div>
        )}
      </div>

      {isOwnRequest && isPending && has(PERMISSIONS.FINANCE_APPROVE) && (
        <p className="text-xs text-amber-600">
          O'z so'rovingizni o'zingiz tasdiqlay olmaysiz
        </p>
      )}

      {(canDecide || canCancel) && (
        <div className="flex gap-2 pt-1">
          {canDecide && (
            <>
              <Button
                type="button"
                disabled={busy}
                onClick={() => approve({ id: approval._id })}
                className="flex-1"
              >
                <Check size={16} strokeWidth={2} />
                Tasdiqlash
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => reject({ id: approval._id })}
                className="flex-1"
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
              onClick={() => cancel(approval._id)}
              className="flex-1"
            >
              <RotateCw size={16} strokeWidth={2} />
              So'rovni bekor qilish
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default ApprovalCard;
