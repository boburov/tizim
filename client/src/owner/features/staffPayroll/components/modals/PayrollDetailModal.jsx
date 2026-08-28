// Icons
import { Lock, LockOpen, Minus, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import PayrollTimeline from "../PayrollTimeline";
import ReceiptButton from "@/shared/components/finance/ReceiptButton";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import {
  useStaffPayrollQuery,
  useAdjustmentRemoveMutation,
  useRecomputeMutation,
  useLifecycleMutation,
} from "../../hooks/useStaffPayroll";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUzLong } from "@/shared/utils/formatDate";

const Row = ({ label, value, tone = "" }) => (
  <div className="flex items-center justify-between py-1 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-medium tabular-nums ${tone}`}>{value}</span>
  </div>
);

/**
 * MAOSH TAFSILOTI - "har so'm qayerdan kelgan".
 *
 * Talab shundoq aytadi: egasi har bir summaning manbasini ko'rishi kerak.
 * Shuning uchun avtomatik KPI qatorlari dalili bilan chiqadi (qaysi lid,
 * qaysi o'quvchi, qaysi to'lov), bonus va jarima esa sababi va kim
 * kiritgani bilan.
 */
const PayrollDetailModal = ({ payrollId, close }) => {
  const { data, isLoading } = useStaffPayrollQuery(payrollId);
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { isOwner } = useAuth();

  const canManage = has(PERMISSIONS.PAYROLL_MANAGE) || isOwner;
  const canPay = has(PERMISSIONS.PAYROLL_PAY) || isOwner;

  const { mutate: recompute, isPending: recomputing } = useRecomputeMutation();
  const { mutate: setLifecycle } = useLifecycleMutation();
  const { mutate: removeAdjustment } = useAdjustmentRemoveMutation();

  if (isLoading || !data) {
    return <p className="py-6 text-center text-muted-foreground">Yuklanmoqda...</p>;
  }

  const finalized = data.lifecycle === "finalized";
  const remaining = Math.max(0, (data.finalAmount || 0) - (data.paidAmount || 0));
  // O'ZGARMAS DAVR: yopilgan YOKI to'lov qilingan. Ikkinchisi ham
  // muhim - pul chiqib bo'lgan oyning summasi keyin o'zgarsa, kassa
  // bilan hisobot orasida farq qolardi.
  const immutable = finalized || (data.paidAmount || 0) > 0;

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {/* Yig'ma formula */}
      <div className="rounded-md border bg-card p-3">
        <Row label="Oylik (proratsiya bilan)" value={formatMoney(data.fixedAmount)} />
        <Row
          label="Avtomatik KPI"
          value={`+ ${formatMoney(data.autoKpiTotal)}`}
          tone="text-emerald-600 dark:text-emerald-300"
        />
        <Row
          label="Qo'lda bonus"
          value={`+ ${formatMoney(data.manualBonusTotal)}`}
          tone="text-emerald-600 dark:text-emerald-300"
        />
        <Row
          label="Jarima"
          value={`- ${formatMoney(data.penaltyTotal)}`}
          tone="text-red-600 dark:text-red-300"
        />
        <div className="mt-1 flex items-center justify-between border-t pt-2">
          <span className="font-medium">Jami</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatMoney(data.finalAmount)}
          </span>
        </div>
        <Row label="To'langan" value={formatMoney(data.paidAmount)} />
        <Row label="Qoldiq" value={formatMoney(remaining)} />
        {data.snapshot?.takenAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            Hisob sanasi: {formatDateUzLong(data.snapshot.takenAt)} - raqamlar
            o'sha kundagi shartnoma va qoidalar asosida muzlatilgan.
          </p>
        )}
        {data.totalDays > 0 && data.payableDays < data.totalDays && (
          <p className="mt-1 text-xs text-muted-foreground">
            {data.payableDays}/{data.totalDays} kun ishlagan - oylik shunga
            mos bo'lib hisoblangan.
          </p>
        )}
      </div>

      {/* Avtomatik KPI qatorlari */}
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Avtomatik KPI</h3>
        {data.items?.length ? (
          <div className="divide-y rounded-md border">
            {data.items.map((it) => (
              <div key={it._id} className="flex items-start justify-between gap-3 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{it.ruleName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {it.meta?.leadName ||
                      it.meta?.studentName ||
                      (it.meta?.presentDays !== undefined
                        ? `${it.meta.presentDays} kun keldi`
                        : "") ||
                      (it.meta?.amount ? formatMoney(it.meta.amount) : "")}
                    {it.quantity > 1 ? ` · ${it.quantity} ta` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-300">
                  +{formatMoney(it.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Bu oyda avtomatik KPI yo'q.
          </p>
        )}
      </div>

      {/* Bonus va jarimalar */}
      {["bonuses", "penalties"].map((key) => {
        const rows = data[key] || [];
        const isPenalty = key === "penalties";
        if (!rows.length) return null;
        return (
          <div key={key}>
            <h3 className="mb-1.5 text-sm font-semibold">
              {isPenalty ? "Jarimalar" : "Qo'lda bonuslar"}
            </h3>
            <div className="divide-y rounded-md border">
              {rows.map((a) => (
                <div key={a._id} className="flex items-start justify-between gap-3 p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{a.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.occurredAt ? formatDateUzLong(a.occurredAt) : ""}
                      {a.createdBy
                        ? ` · ${a.createdBy.firstName} ${a.createdBy.lastName}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`text-sm font-medium tabular-nums ${
                        isPenalty
                          ? "text-red-600 dark:text-red-300"
                          : "text-emerald-600 dark:text-emerald-300"
                      }`}
                    >
                      {isPenalty ? "-" : "+"}
                      {formatMoney(a.amount)}
                    </span>
                    {canManage && !immutable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAdjustment(a._id)}
                        aria-label="O'chirish"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* To'lovlar */}
      {data.transactions?.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">To'lovlar</h3>
          <div className="divide-y rounded-md border">
            {data.transactions.map((t) => (
              <div key={t._id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                <span className="text-muted-foreground">
                  {formatDateUzLong(t.paidAt)} · {t.method === "cash" ? "Naqd" : "Karta"}
                </span>
                <div className="flex items-center gap-1">
                  <span className="font-medium tabular-nums">{formatMoney(t.amount)}</span>
                  {/* `postSalaryCommon` xodim maoshini
                      `salary_staff:<StaffSalaryTransaction.id>` kaliti
                      bilan yozadi. */}
                  <ReceiptButton postingKey={`salary_staff:${t._id}`} iconOnly />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MOLIYAVIY TARIX - shu oy bo'yicha */}
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Shu oy tarixi</h3>
        <PayrollTimeline employeeId={data.employee?._id} limit={8} />
      </div>

      {/* Amallar */}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        {canPay && remaining > 0 && (
          <Button
            type="button"
            onClick={() => openModal(MODAL.STAFF_PAYOUT, { payroll: data })}
          >
            <Wallet className="size-4" />
            To'lash
          </Button>
        )}
        {canManage && !immutable && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                openModal(MODAL.STAFF_ADJUSTMENT, {
                  employee: data.employee,
                  year: data.year,
                  month: data.month,
                  kind: "bonus",
                })
              }
            >
              <Plus className="size-4" />
              Bonus
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                openModal(MODAL.STAFF_ADJUSTMENT, {
                  employee: data.employee,
                  year: data.year,
                  month: data.month,
                  kind: "penalty",
                })
              }
            >
              <Minus className="size-4" />
              Jarima
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={recomputing}
              onClick={() => recompute(data._id)}
            >
              <RefreshCw className="size-4" />
              Qayta hisoblash
            </Button>
          </>
        )}
        {canManage && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // QULFNI OCHISH - sabab MAJBURIY (server ham talab qiladi).
              // Yopilgan moliyaviy davrni qayta ochish istisno hodisa.
              if (finalized) {
                const reason = window.prompt(
                  "Qulfni ochish sababi (audit jurnaliga yoziladi):",
                );
                if (!reason?.trim()) return;
                setLifecycle({ id: data._id, lifecycle: "draft", reason });
                return;
              }
              setLifecycle({ id: data._id, lifecycle: "finalized" });
            }}
          >
            {finalized ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            {finalized ? "Qayta ochish" : "Oyni yopish"}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => close?.()}>
          Yopish
        </Button>
      </div>

      {finalized && (
        <StatusBadge tone="info">
          Oy yopilgan - avtomatik qayta hisoblash bu qatorni o'zgartirmaydi
        </StatusBadge>
      )}
    </div>
  );
};

export default PayrollDetailModal;
