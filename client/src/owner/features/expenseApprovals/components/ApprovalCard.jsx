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
  salary_terms: "Maosh stavkasi",
  discount_set: "O'quvchi chegirmasi",
  group_fee_set: "Guruh oylik narxi",
  staff_hire: "Ishga olish",
};

// Kategoriya -> qaror qabul qilish uchun kerakli ruxsat.
// Server ham shu qoidani qo'llaydi (assertCanDecide) - bu yerda faqat
// tugmani ko'rsatmaslik uchun, foydalanuvchi chalg'imasin.
const DECIDE_PERMISSION = {
  financial: PERMISSIONS.FINANCE_APPROVE,
  configuration: PERMISSIONS.APPROVALS_DECIDE_CONFIG,
};

// Sozlama so'rovining MAZMUNI - summa o'rniga shu ko'rsatiladi.
// Maosh stavkasi takrorlanuvchi, uni bitta raqam bilan ifodalab bo'lmaydi.
const describeSalaryTerms = (payload = {}) => {
  const parts = [];
  if (payload.salaryType === "fixed" || payload.salaryType === "mixed") {
    parts.push(`Fiksa ${formatMoney(payload.fixedAmount || 0)}`);
  }
  if (payload.salaryType === "percent" || payload.salaryType === "mixed") {
    parts.push(`${payload.percentRate || 0}% tushumdan`);
  }
  return parts.join(" + ") || "Stavka ko'rsatilmagan";
};

const describeDiscount = (payload = {}) => {
  const value =
    payload.type === "percent"
      ? `${payload.value || 0}% chegirma`
      : `${formatMoney(payload.value || 0)} chegirma`;
  const period =
    payload.scope === "monthly" && payload.month
      ? ` (${payload.month}/${payload.year})`
      : " (doimiy)";
  return value + period;
};

// DIQQAT: parol payload'da bo'lsa ham server uni o'qish javoblaridan
// kesib tashlaydi - bu yerda ham hech qachon ko'rsatilmaydi.
const describeHire = (payload = {}) =>
  `${payload.role || "xodim"} — ${payload.username || ""}`;

// Owner uchun eng muhimi "qanchadan qanchaga" - shuning uchun eski narx ham
// ko'rsatiladi (so'rov paytida snapshot qilingan).
const describeGroupFee = (payload = {}) => {
  const next = formatMoney(payload.amount || 0);
  if (payload.previousAmount === null || payload.previousAmount === undefined) return next;
  return `${formatMoney(payload.previousAmount)} → ${next}`;
};

const CONFIG_SUMMARY = {
  salary_terms: describeSalaryTerms,
  discount_set: describeDiscount,
  group_fee_set: describeGroupFee,
  staff_hire: describeHire,
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
  // Kategoriyaga MOS ruxsat: chiqim uchun finance.approve, sozlama uchun
  // approvals.decide_config. Ular ataylab ajratilgan.
  const decidePermission =
    DECIDE_PERMISSION[approval.category] || PERMISSIONS.FINANCE_APPROVE;
  const canDecide = has(decidePermission) && isPending && !isOwnRequest;
  const canCancel = isPending && isOwnRequest;
  const busy = approving || rejecting || canceling;

  // Sozlama so'rovida summa YO'Q (amount = null) - "0 so'm" ko'rsatish
  // noto'g'ri bo'lardi, uning o'rniga o'zgarish mazmuni chiqadi.
  const isConfig = approval.category === "configuration";
  const headline = isConfig
    ? (CONFIG_SUMMARY[approval.kind]?.(approval.payload) ?? "Sozlama o'zgarishi")
    : formatMoney(approval.amount);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold">{headline}</span>
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
        {/* Limit faqat CHIQIM so'rovida ma'noga ega - sozlama o'zgarishi
            summaga solishtirilmaydi. */}
        {!isConfig && approval.thresholdAtRequest != null && (
          <div>Limit: {formatMoney(approval.thresholdAtRequest)}</div>
        )}
        {isConfig && approval.payload?.startDate && (
          <div>
            Amal qilish: {approval.payload.startDate}
            {approval.payload.endDate ? ` — ${approval.payload.endDate}` : " dan boshlab"}
          </div>
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

      {isOwnRequest && isPending && has(decidePermission) && (
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
