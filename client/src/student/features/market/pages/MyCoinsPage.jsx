// Icons
import { Trophy, Medal } from "lucide-react";

// Components
import WorkspacePage from "@/shared/components/page/PageShell";
import Card from "@/shared/components/ui/card/Card";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import CoinAmount from "@/shared/components/coin/CoinAmount";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useCoinConfig from "@/shared/hooks/useCoinConfig";

// Feature
import CoinWalletCard from "../components/CoinWalletCard";
import CoinHistoryList from "@/shared/components/coin/CoinHistoryList";
import {
  useMyCoinsQuery,
  useMyCoinHistoryQuery,
  useCoinLeaderboardQuery,
} from "../hooks/useStudentMarketQueries";

const RANK_TONE = [
  "bg-amber-500",   // 1-o'rin
  "bg-slate-500",   // 2-o'rin
  "bg-orange-500",  // 3-o'rin
];

/**
 * TANGALARIM — hamyon, tarix va reyting.
 *
 * ── REYTING `totalEarned` BO'YICHA ──
 * Serverda ham shunday. Balans bo'yicha bo'lsa reyting "hech narsa
 * sotib olmagan" o'quvchini birinchi qilardi — ya'ni marketdan
 * FOYDALANMASLIKKA undardi. Bu esa butun rag'bat tizimining
 * maqsadiga qarshi.
 */
const MyCoinsPage = () => {
  const { user } = useAuth();
  const { coinLabel } = useCoinConfig();

  const wallet = useMyCoinsQuery();
  const history = useMyCoinHistoryQuery({ limit: 30 });
  const leaderboard = useCoinLeaderboardQuery({ limit: 10 });

  const myId = String(user?._id || user?.id || "");

  return (
    <WorkspacePage
      title={`Mening ${coinLabel}larim`}
    >
      {wallet.isError ? (
        <ErrorState onRetry={wallet.refetch} />
      ) : (
        <CoinWalletCard account={wallet.data} isLoading={wallet.isLoading} />
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Tarix</h2>
          {history.isError ? (
            <ErrorState onRetry={history.refetch} compact />
          ) : (
            <CoinHistoryList
              items={history.data?.data || []}
              isLoading={history.isLoading}
            />
          )}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Trophy className="size-4 text-amber-500" />
            Eng ko'p to'plaganlar
          </h2>

          <Card className="p-0">
            {leaderboard.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-md" />
                ))}
              </div>
            ) : !(leaderboard.data || []).length ? (
              <p className="p-4 text-xs text-muted-foreground">
                Reyting hali shakllanmagan — birinchi bo'lishingiz mumkin.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(leaderboard.data || []).map((row, i) => {
                  const isMe = String(row.user?.id || row.userId) === myId;
                  return (
                    <li
                      key={row._id}
                      className={
                        isMe
                          ? "flex items-center gap-2 bg-primary/5 p-2.5"
                          : "flex items-center gap-2 p-2.5"
                      }
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                          RANK_TONE[i] || "bg-slate-500"
                        }`}
                      >
                        {i < 3 ? <Medal className="size-3" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {`${row.user?.firstName || ""} ${row.user?.lastName || ""}`.trim() ||
                          "O'quvchi"}
                        {isMe && (
                          <span className="ml-1 text-xs text-primary">(siz)</span>
                        )}
                      </span>
                      <CoinAmount
                        value={row.totalEarned}
                        size="sm"
                        showLabel={false}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </WorkspacePage>
  );
};

export default MyCoinsPage;
