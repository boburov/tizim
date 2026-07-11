import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Skeleton } from "@/shared/components/shadcn/skeleton";
import { GroupPicker } from "@/owner/features/attendance";
import Leaderboard from "./Leaderboard";
import useLeaderboardQuery from "../hooks/useLeaderboardQuery";
import { loadGradingSettings } from "@/owner/features/grades/utils/gradingSettings";

const LeaderboardSkeleton = () => (
  <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-32 flex-1 rounded-xl" />
      ))}
    </div>
    <div className="space-y-1.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  </div>
);

// scope - route element orqali ("all" | "group"). Sana filtri - layout (context).
const RatingLeaderboardPanel = ({ scope = "all" }) => {
  const { fromDate, toDate } = useOutletContext();
  const isGroup = scope === "group";
  const [groupId, setGroupId] = useState("");

  const { ratingTopN } = loadGradingSettings();

  const params = { scope: isGroup ? groupId || "all" : "all" };
  if (fromDate) params.fromDate = fromDate;
  if (toDate) params.toDate = toDate;

  const { data, isLoading } = useLeaderboardQuery(params);
  const items = data?.items || [];
  const needsGroup = isGroup && !groupId;

  return (
    <div className="space-y-4">
      {isGroup && (
        <GroupPicker value={groupId} onChange={setGroupId} label="Guruh" />
      )}

      {needsGroup ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
          Reytingni ko'rish uchun guruh tanlang
        </div>
      ) : isLoading ? (
        <LeaderboardSkeleton />
      ) : (
        <Leaderboard
          items={items}
          topN={ratingTopN}
          emptyText="Hali reyting ma'lumoti yo'q"
        />
      )}
    </div>
  );
};

export default RatingLeaderboardPanel;
