// Router
import { useOutletContext } from "react-router-dom";

// Icons
import { Coins, TrendingUp, ShoppingBag, Gift, Sparkles } from "lucide-react";

// Components
import StatCard from "@/shared/components/ui/card/StatCard";
import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import EmptyState from "@/shared/components/page/EmptyState";
import CoinHistoryList from "@/shared/components/coin/CoinHistoryList";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useCoinConfig from "@/shared/hooks/useCoinConfig";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Feature
import { useUserWalletQuery } from "../hooks/useMarketQueries";
import CoinAdjustModal from "./modals/CoinAdjustModal";

/**
 * ══════════════════════════════════════════════════════════════════════
 * O'QUVCHI KARTASINING "TANGALAR" TABI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA `owner/features/market/` DA, `users/` DA EMAS ──
 * Panel o'quvchi kartasida CHIZILADI, lekin u TANGA bo'limining
 * ma'lumotini ko'rsatadi va uning so'rovlariga tayanadi. `users`
 * ichiga qo'yilsa, tanga bo'limi o'zgarganda (masalan qaytarish
 * mantig'i) tuzatish IKKI feature'da qidirilardi.
 *
 * Bu naqsh yangi emas: "To'lov" tabi ham `owner/features/deposits/`
 * da yashaydi (`UserDepositPanel`). O'quvchi kartasi — chizish joyi,
 * egalik emas.
 *
 * ── MA'LUMOT `Outlet` KONTEKSTIDAN ──
 * `UserDetailPage` profilni allaqachon yuklagan. Uni qayta so'rash
 * ikkinchi so'rov va ikkinchi "yuklanmoqda" holati degani bo'lardi.
 */
const UserCoinPanel = () => {
  const { profile } = useOutletContext();
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { enabled, coinLabel } = useCoinConfig();

  const userId = profile?._id;
  const canAward = has(PERMISSIONS.COIN_MANAGE);

  const { data, isLoading, isError, refetch } = useUserWalletQuery(userId, {
    limit: 50,
  });

  // O'chirilgan bo'limda tab ochilgan bo'lsa (eski xatcho'q, to'g'ridan
  // yozilgan manzil) — bo'sh ekran emas, SABAB ko'rsatiladi.
  if (!enabled) {
    return (
      <div className="pt-3">
        <EmptyState
          icon={Coins}
          title="Tanga tizimi o'chirilgan"
          hint="Bo'limni markaz egasi Market → Sozlamalar bo'limidan qayta yoqishi mumkin. To'plangan tangalar yo'qolmaydi."
        />
      </div>
    );
  }

  const account = data?.data?.account;
  const transactions = data?.data?.transactions || [];

  return (
    <div className="space-y-4 pt-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Hozirgi hisob"
          value={account?.balance}
          icon={Coins}
          tone={account?.balance ? "positive" : "default"}
          hint={coinLabel}
        />
        <StatCard label="Jami topilgan" value={account?.totalEarned} icon={TrendingUp} />
        <StatCard label="Sarflangan" value={account?.totalSpent} icon={ShoppingBag} />
        <StatCard label="Bugun topilgan" value={account?.earnedToday} icon={Sparkles} />
      </div>

      {canAward && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openModal(MODAL.COIN_ADJUST, { user: profile })}>
            <Gift className="size-4" />
            Qo'lda tanga
          </Button>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Harakatlar tarixi</h2>
        {isError ? (
          <ErrorState onRetry={refetch} compact />
        ) : (
          <CoinHistoryList items={transactions} isLoading={isLoading} />
        )}
      </section>

      {canAward && (
        <ModalWrapper
          name={MODAL.COIN_ADJUST}
          title="Qo'lda tanga"
          description="Yozuv o'quvchining tarixida ko'rinadi"
        >
          <CoinAdjustModal />
        </ModalWrapper>
      )}
    </div>
  );
};

export default UserCoinPanel;
