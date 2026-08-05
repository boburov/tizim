// React
import { useEffect } from "react";

// Icons
import { AlertTriangle, Ban, Check, Lock, SkipForward } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import { toast } from "sonner";
import useObjectState from "@/shared/hooks/useObjectState";
import {
  usePreviewMutation,
  useGenerateRangeMutation,
} from "../../hooks/useStaffPayroll";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";
import { toDateInput } from "@/shared/utils/formatDate";

const ACTION_META = {
  create: { icon: Check, label: "Yaratiladi", cls: "text-emerald-600 dark:text-emerald-300" },
  exists: { icon: SkipForward, label: "Mavjud", cls: "text-muted-foreground" },
  locked: { icon: Lock, label: "Qulflangan", cls: "text-amber-600 dark:text-amber-300" },
  skip: { icon: Ban, label: "O'tkazib yuboriladi", cls: "text-muted-foreground" },
};

/**
 * MAOSH YARATISH - AVVAL KO'RISH (dry run).
 *
 * Moliyaviy amal ko'r-ko'rona bajarilmaydi: egasi qaysi oylar
 * yaratilishini, qaysilari qulflanganini va NEGA chetlab o'tilishini
 * oldindan ko'radi. Ko'rish bosqichida DB'ga hech narsa yozilmaydi.
 */
const PayrollPreviewModal = ({ employee, close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    from: toDateInput(employee?.hiredAt) || "",
    to: toDateInput(new Date()),
    result: null,
  });

  const { mutate: preview, isPending: previewing } = usePreviewMutation({
    onSuccess: (data) => obj.setField("result", data),
  });

  const { mutate: generate } = useGenerateRangeMutation({
    onSuccess: (res) => {
      setIsLoading(false);
      toast.success(res?.message || "Yaratildi");
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  // Oyna ochilganda darhol ko'rsatamiz - foydalanuvchi qo'shimcha
  // tugma bosmasin.
  useEffect(() => {
    if (employee?._id && obj.from && obj.to) {
      preview({ employeeId: employee._id, from: obj.from, to: obj.to });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?._id]);

  const result = obj.result;
  const willCreate = result?.summary?.willCreate || 0;

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <InputField
          type="date"
          name="from"
          label="Boshlanish"
          value={obj.from}
          onChange={(e) => obj.setFields({ from: e.target.value, result: null })}
          disabled={isLoading}
        />
        <InputField
          type="date"
          name="to"
          label="Tugash"
          value={obj.to}
          onChange={(e) => obj.setFields({ to: e.target.value, result: null })}
          disabled={isLoading}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={previewing || !obj.from || !obj.to}
        onClick={() =>
          preview({ employeeId: employee._id, from: obj.from, to: obj.to })
        }
      >
        {previewing ? "Hisoblanmoqda..." : "Ko'rib chiqish"}
      </Button>

      {result && (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Yaratiladi", value: result.summary.willCreate },
              { label: "Mavjud", value: result.summary.exists },
              { label: "Qulflangan", value: result.summary.locked },
              { label: "O'tkaziladi", value: result.summary.skipped },
            ].map((s) => (
              <div key={s.label} className="rounded-md border bg-card p-2">
                <p className="text-lg font-semibold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {result.warnings?.length > 0 && (
            <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <ul className="space-y-0.5">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
            {result.rows.map((r) => {
              const meta = ACTION_META[r.action] || ACTION_META.skip;
              return (
                <div
                  key={`${r.year}-${r.month}`}
                  className="flex items-center justify-between gap-2 p-2 text-sm"
                >
                  <span className="tabular-nums">
                    {String(r.month).padStart(2, "0")}.{r.year}
                  </span>
                  <div className="flex items-center gap-2">
                    {r.amount ? (
                      <span className="tabular-nums text-muted-foreground">
                        {formatMoney(r.amount)}
                      </span>
                    ) : null}
                    <span className={`inline-flex items-center gap-1 text-xs ${meta.cls}`}>
                      <meta.icon className="size-3.5" />
                      {meta.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Ko'rish bosqichida ma'lumotlar bazasiga hech narsa yozilmadi.
          </p>
        </>
      )}

      <div className="flex gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          disabled={isLoading || !result || willCreate === 0}
          onClick={() => {
            setIsLoading(true);
            generate({ employeeId: employee._id, from: obj.from, to: obj.to });
          }}
          className="flex-1"
        >
          {isLoading ? "Yaratilmoqda..." : `Yaratish (${willCreate})`}
        </Button>
      </div>
    </div>
  );
};

export default PayrollPreviewModal;
