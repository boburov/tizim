// React
import { useState } from "react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Input from "@/shared/components/ui/input/Input";

// Hooks
import { useBulkDecideMutation } from "../../hooks/useExpenseApprovalMutations";

// Utils
import { formatMoney } from "@/shared/utils/formatMoney";

/**
 * Ommaviy qarorni TASDIQLASH oynasi.
 *
 * NEGA KERAK: ro'yxatdagi `salary_payment` va `deposit_withdraw`
 * tasdiqlangan zahoti HAQIQIY pul harakatini bajaradi va uni orqaga
 * qaytarish oson emas. Shuning uchun tugma bosilishi bilan emas, jami
 * summa ko'rsatilgan oynadan keyin ishga tushadi.
 *
 * `approvals` va `action` ModalWrapper orqali `data` sifatida keladi.
 */
const BulkDecideModal = ({ approvals = [], action = "approve", close }) => {
  const [note, setNote] = useState("");

  const { mutate, isPending } = useBulkDecideMutation({
    onSuccess: () => close?.(true),
  });

  const isApprove = action === "approve";
  const total = approvals.reduce(
    (sum, a) => sum + (a.category === "financial" ? a.amount || 0 : 0),
    0,
  );

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">{approvals.length} ta</span> so'rov{" "}
        {isApprove ? "tasdiqlanadi va darhol bajariladi" : "rad etiladi"}.
      </p>

      {isApprove && total > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          Hisobdan <span className="font-semibold">{formatMoney(total)}</span>{" "}
          chiqadi. Bu amalni orqaga qaytarib bo'lmaydi.
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Izoh (ixtiyoriy)</label>
        <Input
          value={note}
          maxLength={500}
          placeholder="Qaror sababi"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isPending}
          onClick={() => close?.()}
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={isPending}
          onClick={() =>
            mutate({ action, note, ids: approvals.map((a) => a._id) })
          }
        >
          {isApprove ? "Tasdiqlash" : "Rad etish"}
        </Button>
      </div>
    </div>
  );
};

export default BulkDecideModal;
