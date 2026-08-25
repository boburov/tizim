// Icons
import { Coins, ShoppingBag, Wallet, Package } from "lucide-react";

// Components
import StatCard from "@/shared/components/ui/card/StatCard";

// Hooks
import useCoinConfig from "@/shared/hooks/useCoinConfig";

/**
 * IQTISODIYOT HOLATI — narx qo'yishdan OLDIN javob kerak bo'lgan savol.
 *
 * ── NEGA "MUOMALADAGI" ENG MUHIM RAQAM ──
 * Sarflanmagan tanga — bu KUTILAYOTGAN talab. U ko'p bo'lsa yangi
 * arzon mahsulot e'lon qilingan kuniyoq supurib ketiladi va zaxira
 * tugab, o'quvchilarda "menga yetmadi" degan taassurot qoladi.
 * Shuning uchun u alohida, ogohlantirish rangida.
 *
 * ⚠ `isMoney` QO'YILMAGAN. Tanga so'm emas: uni pul formatida
 * ("1 200 000 so'm") ko'rsatish markazning haqiqiy pulida shuncha
 * majburiyat bordek o'qilardi.
 */
const CoinEconomyCards = ({ stats, isLoading }) => {
  const { coinLabel } = useCoinConfig();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-md border bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Muomaladagi"
        hint={`Sarflanmagan ${coinLabel} — kutilayotgan talab`}
        value={stats?.circulating}
        icon={Wallet}
        tone="warn"
      />
      <StatCard
        label="Jami chiqarilgan"
        hint="Davomat, baho va qo'lda berilgan"
        value={stats?.totalIssued}
        icon={Coins}
      />
      <StatCard
        label="Sarflangan"
        hint="Marketda ishlatilgan"
        value={stats?.totalSpent}
        icon={ShoppingBag}
        tone="positive"
      />
      <StatCard
        label="Buyurtmalar"
        hint="Barcha vaqt uchun"
        value={stats?.orderCount}
        icon={Package}
        tone="info"
      />
    </div>
  );
};

export default CoinEconomyCards;
