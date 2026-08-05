// React
import { useState } from "react";

// Icons
import { Calculator, Lock, LockOpen, RefreshCw, ShieldCheck } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";

// Hooks
import { toast } from "sonner";
import useObjectState from "@/shared/hooks/useObjectState";
import {
  useGenerateRangeMutation,
  useRecalcUnlockedMutation,
  usePayrollLockMutation,
} from "../../hooks/useStaffPayroll";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import { toDateInput } from "@/shared/utils/formatDate";

const OPTIONS = [
  {
    key: "hr",
    icon: ShieldCheck,
    title: "Faqat HR ma'lumotini yangilash",
    hint: "Tavsiya etiladi. Maosh tarixi umuman tegilmaydi.",
  },
  {
    key: "generate",
    icon: Calculator,
    title: "Yetishmayotgan maoshlarni yaratish",
    hint: "Siz ko'rsatgan davr uchun va faqat qatori YO'Q oylarga.",
  },
  {
    key: "recalc",
    icon: RefreshCw,
    title: "Qulflanmagan maoshlarni qayta hisoblash",
    hint: "Qulflangan va yopilgan oylar chetlab o'tiladi.",
  },
];

/**
 * ISHGA OLINGAN SANA O'ZGARDI - tasdiqlash.
 *
 * Bu oyna maoshni O'ZI hisoblamaydi. HR ma'lumoti allaqachon saqlangan
 * bo'ladi; bu yerda egasi moliyaviy qismini ATAYLAB tanlaydi.
 *
 * NEGA SHUNDAY: markaz boshqa tizimdan ko'chib kelganda sana 16 oy
 * orqaga tuzatiladi. Bog'langan tizimda bu bir zumda 16 oylik maosh
 * yaratardi yoki to'langan oylarni qayta yozardi - va egasi buni
 * so'ramagan ham bo'lardi.
 */
const EmploymentDateChangeModal = ({ impact, close, isLoading, setIsLoading }) => {
  const [choice, setChoice] = useState("hr");
  const emp = impact?.employee;

  const obj = useObjectState({
    from: toDateInput(emp?.hiredAt) || "",
    to: toDateInput(new Date()),
  });

  const { mutate: generate } = useGenerateRangeMutation({
    onSuccess: (res) => {
      setIsLoading(false);
      toast.success(res?.message || "Yaratildi");
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const { mutate: setLock } = usePayrollLockMutation({
    onSuccess: () => toast.success("Qulf holati o'zgartirildi"),
  });

  const { mutate: recalc } = useRecalcUnlockedMutation({
    onSuccess: (res) => {
      setIsLoading(false);
      toast.success(res?.message || "Qayta hisoblandi");
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleApply = () => {
    if (choice === "hr") {
      close?.();
      return;
    }
    setIsLoading(true);
    if (choice === "generate") {
      generate({ employeeId: emp._id, from: obj.from, to: obj.to });
    } else {
      recalc({ employeeId: emp._id, from: obj.from, to: obj.to });
    }
  };

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <p>
          Bu xodimda maosh tarixi bor. Ishga olingan sanani o'zgartirish
          faqat <b>HR ma'lumotini</b> yangiladi. Maosh tarixi siz ataylab
          so'ramaguningizcha <b>o'zgarmaydi</b>.
        </p>
      </div>

      {/* Tarix holati - qaror qabul qilish uchun aniq raqamlar */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Oylar", value: impact.monthCount },
          { label: "Qulflangan", value: impact.lockedCount },
          { label: "To'langan", value: impact.paidCount },
        ].map((s) => (
          <div key={s.label} className="rounded-md border bg-card p-2.5">
            <p className="text-lg font-semibold tabular-nums">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const active = choice === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setChoice(o.key)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted",
              )}
            >
              <o.icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.title}</p>
                <p className="text-xs text-muted-foreground">{o.hint}</p>
              </div>
            </button>
          );
        })}
      </div>

      {choice !== "hr" && (
        <div className="grid grid-cols-2 gap-3">
          <InputField
            type="date"
            name="from"
            label="Boshlanish"
            value={obj.from}
            onChange={(e) => obj.setField("from", e.target.value)}
            disabled={isLoading}
          />
          <InputField
            type="date"
            name="to"
            label="Tugash"
            value={obj.to}
            onChange={(e) => obj.setField("to", e.target.value)}
            disabled={isLoading}
          />
        </div>
      )}

      {choice === "generate" && emp?.payrollStartFrom && (
        <StatusBadge tone="info">
          {toDateInput(emp.payrollStartFrom)} dan oldingi oylar yaratilmaydi
        </StatusBadge>
      )}

      {/* Mavjud oylar - qulf holati bilan */}
      {impact.months?.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Mavjud oylar</h3>
          <div className="max-h-40 divide-y overflow-y-auto rounded-md border">
            {impact.months.map((m) => (
              <div
                key={`${m.year}-${m.month}`}
                className="flex items-center justify-between p-2 text-sm"
              >
                <span className="tabular-nums">
                  {String(m.month).padStart(2, "0")}.{m.year}
                </span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">
                    {formatMoney(m.expected)}
                  </span>
                  {/* Qulf - shu yerda qo'yiladi: egasi tarixni ko'rib
                      turgan paytda "bu oyga tegmanglar" deya oladi. */}
                  <Button
                    type="button"
                    variant={m.locked ? "outline" : "ghost"}
                    size="sm"
                    disabled={isLoading}
                    onClick={() =>
                      m.rows?.forEach((r) =>
                        setLock({ kind: r.kind, id: r.id, locked: !m.locked }),
                      )
                    }
                    title={m.locked ? "Qulfni ochish" : "Qulflash"}
                  >
                    {m.locked ? (
                      <Lock className="size-3.5" />
                    ) : (
                      <LockOpen className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Yopish
        </Button>
        <Button
          type="button"
          onClick={handleApply}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading
            ? "Bajarilmoqda..."
            : choice === "hr"
              ? "Tushundim"
              : "Davom etish"}
        </Button>
      </div>
    </div>
  );
};

export default EmploymentDateChangeModal;
