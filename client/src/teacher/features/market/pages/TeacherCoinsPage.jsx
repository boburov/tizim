// Icons
import { Trophy, Store, Medal, Gift, Info } from "lucide-react";

// Components
import WorkspacePage from "@/shared/components/page/PageShell";
import TabNav from "@/shared/components/page/TabNav";
import { useActiveTab } from "@/shared/components/page/tabState";
import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import EmptyState from "@/shared/components/page/EmptyState";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import CoinAmount from "@/shared/components/coin/CoinAmount";
import ProductGrid from "@/shared/components/coin/ProductGrid";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useCoinConfig from "@/shared/hooks/useCoinConfig";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Features
import {
  useCoinLeaderboardQuery,
  useMarketCatalogQuery,
} from "@/student/features/market";
import { CoinAdjustModal } from "@/owner/features/market";

const RANK_TONE = ["bg-amber-500", "bg-slate-500", "bg-orange-500"];

/**
 * ══════════════════════════════════════════════════════════════════════
 * O'QITUVCHI KO'RINISHI — "O'QUVCHILARIM NIMA UCHUN HARAKAT QILADI"
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA O'QITUVCHIGA UMUMAN KERAK ──
 * Tangani AYNAN o'qituvchi chiqaradi: davomat belgilash va baho qo'yish
 * uning ishi. Lekin u natijani ko'rmasa, rag'bat u uchun ko'rinmas
 * bo'lib qoladi va o'quvchining "menga necha tanga berdingiz" degan
 * savoliga javob bera olmaydi.
 *
 * ── NUSXA YARATILMADI ──
 * Reyting, katalog va qo'lda berish modali — hammasi MAVJUD
 * komponentlar (`student/features/market`, `owner/features/market`).
 * O'qituvchi uchun ikkinchi nusxa yozilsa, sozlama o'zgarganda
 * (masalan tanga nomi) ulardan biri yangilanmay qolardi.
 *
 * ── "TANGA BERISH" TUGMASI SHARTLI ──
 * `coin.manage` standart holda o'qituvchida YO'Q. Tugma o'shanda
 * umuman chizilmaydi. Ega uni rollar matritsasidan bersa — tugma
 * o'zi paydo bo'ladi. Ya'ni imkoniyat RUXSATDAN kelib chiqadi, kod
 * o'zgartirilmaydi.
 */
const TeacherCoinsPage = () => {
  const { has } = usePermissions();
  const { openModal } = useModal();
  const { coinLabel, earn } = useCoinConfig();

  const canAward = has(PERMISSIONS.COIN_MANAGE);

  const tabs = [
    { key: "rating", label: "Reyting", icon: Trophy },
    { key: "shop", label: "Do'kon", icon: Store },
  ];
  const active = useActiveTab(tabs);

  const leaderboard = useCoinLeaderboardQuery({ limit: 20 });
  const catalog = useMarketCatalogQuery({ limit: 60 });

  const rows = leaderboard.data || [];

  return (
    <WorkspacePage
      title="Tangalar"
      subtitle={`Davomat va baho uchun o'quvchilar ${coinLabel} to'playdi`}
    >
      {earn && (
        <Card className="flex items-start gap-2 bg-muted/40 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Siz davomat belgilaganingizda va baho qo'yganingizda tanga
            <b className="text-foreground"> avtomatik</b> hisoblanadi:
            darsga kelgani uchun {earn.attendancePresent}, har bir ball
            uchun {earn.gradeCoinsPerPoint} (kamida {earn.gradeMinValue} baho).
            Qayta belgilash ikkinchi marta tanga bermaydi.
          </p>
        </Card>
      )}

      <TabNav tabs={tabs} />

      {active === "rating" &&
        (leaderboard.isError ? (
          <ErrorState onRetry={leaderboard.refetch} />
        ) : leaderboard.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !rows.length ? (
          <EmptyState
            icon={Trophy}
            title="Reyting hali shakllanmagan"
            hint="Birinchi davomat belgilanishi bilan o'quvchilarda tanga paydo bo'ladi va ular shu yerda ko'rinadi."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((row, i) => (
              <li key={row._id} className="flex items-center gap-3 p-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                    RANK_TONE[i] || "bg-slate-500"
                  }`}
                >
                  {i < 3 ? <Medal className="size-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {`${row.user?.firstName || ""} ${row.user?.lastName || ""}`.trim() ||
                      "O'quvchi"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Hozirgi hisobi: {Number(row.balance || 0).toLocaleString("uz-UZ")}
                  </p>
                </div>
                <CoinAmount value={row.totalEarned} size="sm" showLabel={false} />
                {canAward && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      openModal(MODAL.COIN_ADJUST, {
                        user: { _id: row.user?.id || row.userId, ...row.user },
                      })
                    }
                  >
                    <Gift className="size-3.5" />
                    Berish
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}

      {active === "shop" &&
        (catalog.isError ? (
          <ErrorState onRetry={catalog.refetch} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              O'quvchilaringiz shu mahsulotlar uchun harakat qiladi.
            </p>
            {/* ⚠ `readOnly`: xarid tugmasi CHIZILMAYDI. O'qituvchining
                hisobi bo'sh va odatiy ko'rinishda har kartada "Yana N
                kerak" chiqardi — unga hech narsa aytmaydigan yozuv. */}
            <ProductGrid
              items={catalog.data?.data || []}
              balance={0}
              isLoading={catalog.isLoading}
              readOnly
            />
          </>
        ))}

      {canAward && (
        <ModalWrapper
          name={MODAL.COIN_ADJUST}
          title="Qo'lda tanga"
          description="Yozuv o'quvchining tarixida ko'rinadi"
        >
          <CoinAdjustModal />
        </ModalWrapper>
      )}
    </WorkspacePage>
  );
};

export default TeacherCoinsPage;
