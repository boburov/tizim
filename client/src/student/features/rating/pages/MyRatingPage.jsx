import { useState } from "react";

// Components
import Card from "@/shared/components/ui/card/Card";
import StatCard from "@/shared/components/ui/card/StatCard";
import { Trophy, Users } from "lucide-react";
import { Leaderboard } from "@/owner/features/rating";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useLeaderboardQuery from "@/owner/features/rating/hooks/useLeaderboardQuery";
import useStudentRankQuery from "@/owner/features/rating/hooks/useStudentRankQuery";

const MyRatingPage = () => {
  const { user } = useAuth();
  const studentId = user?._id;

  // "overall" | "group"
  const [tab, setTab] = useState("overall");

  const { data: rank } = useStudentRankQuery(studentId);
  const groupId = rank?.group?.group?._id;

  const { data: overall, isLoading: loadingOverall } = useLeaderboardQuery({
    scope: "all",
    limit: 100,
  });
  const { data: groupLb, isLoading: loadingGroup } = useLeaderboardQuery(
    groupId ? { scope: groupId, limit: 100 } : { scope: "all", limit: 0 },
  );

  const overallItems = overall?.items || [];
  const groupItems = groupId ? groupLb?.items || [] : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reyting</h1>

      {/* O'z o'rnim - qisqacha */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Trophy}
          tone="info"
          label="Umumiy o'rin"
          value={rank?.overall?.me?.rank ?? null}
          hint={
            rank?.overall?.total
              ? `${rank.overall.total} o'quvchidan`
              : "Ma'lumot yo'q"
          }
        />
        <StatCard
          icon={Users}
          tone="default"
          label="Guruhdagi o'rin"
          value={rank?.group?.me?.rank ?? null}
          hint={
            rank?.group?.total
              ? `${rank.group.group?.name || "Guruh"} · ${rank.group.total} o'quvchi`
              : "Guruh yo'q"
          }
        />
      </div>

      {/* Tab tanlash */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("overall")}
          className={
            "rounded-md border px-3 py-1.5 text-sm font-medium transition " +
            (tab === "overall"
              ? "border-primary bg-primary/10 text-primary"
              : "border-gray-200 bg-white text-muted-foreground hover:bg-gray-50")
          }
        >
          Umumiy reyting
        </button>
        <button
          type="button"
          onClick={() => setTab("group")}
          disabled={!groupId}
          className={
            "rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 " +
            (tab === "group"
              ? "border-primary bg-primary/10 text-primary"
              : "border-gray-200 bg-white text-muted-foreground hover:bg-gray-50")
          }
        >
          Mening guruhim
        </button>
      </div>

      <Card>
        {tab === "overall" ? (
          loadingOverall ? (
            <p className="py-6 text-center text-muted-foreground">Yuklanmoqda...</p>
          ) : (
            <Leaderboard
              items={overallItems}
              highlightStudentId={studentId}
              emptyText="Hali reyting ma'lumoti yo'q"
            />
          )
        ) : loadingGroup ? (
          <p className="py-6 text-center text-muted-foreground">Yuklanmoqda...</p>
        ) : (
          <Leaderboard
            items={groupItems}
            highlightStudentId={studentId}
            emptyText="Guruh reytingi mavjud emas"
          />
        )}
      </Card>
    </div>
  );
};

export default MyRatingPage;
