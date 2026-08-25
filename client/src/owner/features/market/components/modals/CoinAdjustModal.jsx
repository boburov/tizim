// React
import { useState } from "react";

// Icons
import { Plus, Minus } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useCoinConfig from "@/shared/hooks/useCoinConfig";

// Mutations
import { useCoinAdjustMutation } from "../../hooks/useMarketMutations";

/**
 * QO'LDA TANGA BERISH / OLIB QO'YISH.
 *
 * ── NEGA YO'NALISH ALOHIDA TUGMA ──
 * Bitta maydonga "-20" yozdirish oson, lekin xavfli: minus belgisi
 * ko'zdan qochadi va "berdim" deb o'ylab, aslida olib qo'yiladi.
 * Yo'nalish ochiq tanlanadi, miqdor esa doim musbat.
 *
 * ── SABAB MAJBURIY ──
 * Yozuv o'zgarmas (ledger) va u o'quvchiga tarixda ko'rinadi. Sababsiz
 * "+50" o'quvchi uchun tushunarsiz, admin uchun esa keyinchalik
 * asoslab bo'lmaydigan yozuv bo'lardi.
 */
const CoinAdjustModal = ({ close, isLoading, setIsLoading, user }) => {
  const { coinLabel } = useCoinConfig();
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState(1);

  const { mutate } = useCoinAdjustMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const value = Math.abs(Number(amount) || 0);
    if (!value || !user?._id || !reason.trim()) return;
    setIsLoading(true);
    mutate({ userId: user._id, delta: value * direction, reason: reason.trim() });
  };

  const name = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {name && (
        <p className="text-sm text-muted-foreground">
          Qabul qiluvchi: <b className="text-foreground">{name}</b>
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={direction === 1 ? "default" : "outline"}
          onClick={() => setDirection(1)}
          disabled={isLoading}
        >
          <Plus className="size-4" />
          Berish
        </Button>
        <Button
          type="button"
          variant={direction === -1 ? "destructive" : "outline"}
          onClick={() => setDirection(-1)}
          disabled={isLoading}
        >
          <Minus className="size-4" />
          Olib qo'yish
        </Button>
      </div>

      <InputField
        type="number"
        name="amount"
        label={`Miqdor (${coinLabel})`}
        min={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        autoFocus
        disabled={isLoading}
      />

      <InputField
        name="reason"
        label="Sabab"
        description="O'quvchi buni o'z tarixida ko'radi"
        placeholder="Masalan: olimpiada g'olibi"
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
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
          {isLoading ? "Saqlanmoqda..." : "Tasdiqlash"}
        </Button>
      </div>
    </form>
  );
};

export default CoinAdjustModal;
