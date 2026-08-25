// Icons
import { Info, Clock } from "lucide-react";

// React
import { useState } from "react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import CoinAmount from "@/shared/components/coin/CoinAmount";

// Mutations
import { useBuyMutation } from "../../hooks/useStudentMarketMutations";

/**
 * XARIDNI TASDIQLASH.
 *
 * ── NEGA TASDIQ OYNASI KERAK ──
 * Xarid QAYTARIB BO'LMAYDIGAN harakat emas (tasdiqdan oldin bekor
 * qilish mumkin), lekin u tangani DARHOL yechadi. Tasdiqsiz bosilgan
 * tugma o'quvchida "tangam qayoqqa ketdi" degan savol tug'dirardi.
 *
 * ── OYNADA UCHTA NARSA BORLIGI SHART ──
 * narx, QANDAY olinadi va QANCHA vaqtda yetadi. Bular xarid
 * qilingandan keyin xabarda ham takrorlanadi — o'quvchi ularni ikki
 * marta ko'radi va shikoyat uchun asos qolmaydi.
 */
const BuyConfirmModal = ({ close, isLoading, setIsLoading, product, balance }) => {
  const [note, setNote] = useState("");

  const { mutate } = useBuyMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!product?._id) return;
    setIsLoading(true);
    mutate({ productId: product._id, note: note.trim() });
  };

  const after = Number(balance || 0) - Number(product?.price || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
        <p className="font-medium text-foreground">{product?.name}</p>
        {product?.description && (
          <p className="text-xs text-muted-foreground">{product.description}</p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
          <span className="text-muted-foreground">Narxi</span>
          <CoinAmount value={product?.price} size="sm" showLabel={false} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Xariddan keyin qoladi</span>
          <CoinAmount value={after} size="sm" showLabel={false} />
        </div>
      </div>

      {product?.deliveryInfo && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {product.deliveryInfo}
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Clock className="mt-0.5 size-3.5 shrink-0" />
        {product?.deliveryDays > 0
          ? `Taxminan ${product.deliveryDays} kunda tayyor bo'ladi`
          : "Tasdiqlangach darhol berish uchun tayyorlanadi"}
      </p>

      <InputField
        name="note"
        label="Izoh"
        description="Ixtiyoriy — masalan o'lcham yoki rang"
        maxLength={200}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={isLoading}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Yuborilmoqda..." : "Tasdiqlash"}
        </Button>
      </div>
    </form>
  );
};

export default BuyConfirmModal;
