// Icons
import { Coins, TrendingUp, ShoppingBag, Sparkles } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import CoinAmount from "@/shared/components/coin/CoinAmount";

// Hooks
import useCoinConfig from "@/shared/hooks/useCoinConfig";

/**
 * HAMYON — o'quvchining birinchi ko'radigan narsasi.
 *
 * ── NEGA "BUGUN TOPILGAN" ALOHIDA ──
 * Balans o'zgargani darhol ko'rinmaydi: 340 dan 341 ga o'tish
 * sezilmaydi. "Bugun +3" esa BUGUNGI harakat natijasini ko'rsatadi —
 * rag'bat aynan shundan ishlaydi.
 *
 * ── NEGA STAVKA SHU YERDA ──
 * "Nima uchun necha tanga beriladi" — o'quvchining birinchi savoli.
 * Javob alohida sahifada bo'lsa hech kim o'qimasdi.
 */
const CoinWalletCard = ({ account, isLoading }) => {
  const { coinLabel, earn } = useCoinConfig();

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Mening hisobim
          </p>
          <CoinAmount value={account?.balance} size="lg" className="mt-1" />
        </div>
        <span className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Coins className="size-5" />
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
        <div>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sparkles className="size-3" />
            Bugun
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            +{Number(account?.earnedToday || 0).toLocaleString("uz-UZ")}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <TrendingUp className="size-3" />
            Jami topilgan
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">
            {Number(account?.totalEarned || 0).toLocaleString("uz-UZ")}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShoppingBag className="size-3" />
            Sarflangan
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">
            {Number(account?.totalSpent || 0).toLocaleString("uz-UZ")}
          </p>
        </div>
      </div>

      {earn && (
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">
            Qanday {coinLabel} to'planadi
          </p>
          <ul className="space-y-0.5">
            {earn.attendancePresent > 0 && (
              <li>• Darsga kelsangiz — {earn.attendancePresent}</li>
            )}
            {earn.attendanceExcused > 0 && (
              <li>• Sababli qoldirsangiz — {earn.attendanceExcused}</li>
            )}
            {earn.gradeCoinsPerPoint > 0 && (
              <li>
                • Har bir ball uchun — {earn.gradeCoinsPerPoint} (kamida{" "}
                {earn.gradeMinValue} baho)
              </li>
            )}
            {earn.dailyLimit > 0 && (
              <li>• Kunlik chegara — {earn.dailyLimit}</li>
            )}
          </ul>
        </div>
      )}
    </Card>
  );
};

export default CoinWalletCard;
