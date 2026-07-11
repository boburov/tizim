// React
import { useMemo } from "react";

// Icons
import { Crown, Medal, Trophy } from "lucide-react";

// Components
import LeaderboardRow from "./LeaderboardRow";

// Utils
import { cn } from "@/shared/utils/cn";

// Bir xil ballarda tartiblash mantig'i (aniq va deterministik):
//  1) ball bo'yicha kamayuvchi
//  2) teng bo'lsa - o'rtacha baho yuqori bo'lgan oldinda
//  3) yana teng bo'lsa - davomat foizi yuqori bo'lgan oldinda
//  4) baribir teng bo'lsa - ism bo'yicha (alifbo), barqarorlik uchun
// Rank "competition ranking": teng ballar bir xil o'rin oladi (1,2,2,4),
// va isTied=true bilan belgilanadi.
const num = (v) => (v == null ? -1 : Number(v));
const fullName = (s) => `${s.firstName || ""} ${s.lastName || ""}`.trim();

const rankItems = (items) => {
  const sorted = [...items].sort((a, b) => {
    if (b.point !== a.point) return b.point - a.point;
    if (num(b.averageGrade) !== num(a.averageGrade))
      return num(b.averageGrade) - num(a.averageGrade);
    if (num(b.attendanceRate) !== num(a.attendanceRate))
      return num(b.attendanceRate) - num(a.attendanceRate);
    return fullName(a.student).localeCompare(fullName(b.student));
  });

  let lastPoint = null;
  let lastRank = 0;
  const withRank = sorted.map((it, i) => {
    const isTie = lastPoint != null && it.point === lastPoint;
    const rank = isTie ? lastRank : i + 1;
    lastPoint = it.point;
    lastRank = rank;
    return { ...it, rank };
  });

  // isTied: oldingi yoki keyingi qator bilan ball teng bo'lsa
  return withRank.map((it, i) => ({
    ...it,
    isTied:
      (i > 0 && withRank[i - 1].point === it.point) ||
      (i < withRank.length - 1 && withRank[i + 1].point === it.point),
  }));
};

// Podium uchun ikonka
const PODIUM = {
  1: { icon: Crown, ring: "ring-amber-300", bg: "bg-amber-50", chip: "bg-amber-400", order: "order-2 sm:scale-105", text: "text-amber-600" },
  2: { icon: Trophy, ring: "ring-slate-300", bg: "bg-slate-50", chip: "bg-slate-400", order: "order-1", text: "text-slate-600" },
  3: { icon: Medal, ring: "ring-orange-300", bg: "bg-orange-50", chip: "bg-orange-400", order: "order-3", text: "text-orange-600" },
};

const PodiumCard = ({ it, slot, isMe }) => {
  // Podium ko'rinishi joylashuv (slot: 1/2/3) bo'yicha; yorliq esa haqiqiy o'rin.
  const p = PODIUM[slot];
  const Icon = p.icon;
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center rounded-xl border bg-white p-4 text-center ring-1",
        p.ring,
        p.bg,
        p.order,
        isMe && "ring-2 ring-primary/50",
      )}
    >
      <span className={cn("grid size-10 place-items-center rounded-full text-white", p.chip)}>
        <Icon className="size-5" />
      </span>
      <p className="mt-2 truncate text-sm font-semibold text-gray-900">
        {it.student.firstName} {it.student.lastName}
        {isMe && <span className="ml-1 text-xs font-normal text-primary">(siz)</span>}
      </p>
      <p className={cn("text-xs font-medium", p.text)}>{it.rank}-o'rin</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">
        {it.point}
        <span className="ml-1 text-xs font-normal text-muted-foreground">ball</span>
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Baho {it.averageGrade ?? "-"} · Davomat{" "}
        {it.attendanceRate != null ? `${it.attendanceRate}%` : "-"}
      </p>
    </div>
  );
};

// items: [{ student, point, averageGrade, attendanceRate }]
// topN: nechta o'quvchi ko'rsatilsin (sozlamadan)
// highlightStudentId: o'quvchining o'z qatorini ajratish
const Leaderboard = ({
  items = [],
  topN = 100,
  highlightStudentId = null,
  emptyText = "Ma'lumot yo'q",
}) => {
  const ranked = useMemo(() => rankItems(items).slice(0, topN), [items, topN]);

  if (!ranked.length) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-10 text-center">
        <Trophy className="mx-auto size-8 text-gray-300" />
        <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  const isMe = (it) =>
    highlightStudentId &&
    String(it.student._id) === String(highlightStudentId);

  const maxPoint = ranked[0]?.point || 100;

  // Top tie: 1-o'rinni nechta o'quvchi bo'lishyapti.
  // 3 tadan ko'p bo'lsa podium ma'nosiz ("1-o'rin"lar to'lib ketadi) -
  // bu holatda podium ko'rsatmaymiz, hammasini qator ko'rinishida beramiz.
  const topTieCount = ranked.filter((it) => it.rank === 1).length;
  const showPodium = ranked.length >= 3 && topTieCount <= 3;

  // Podium aniq 3 ta joylashuv (slot 1/2/3) - ortiqcha tenglar qatorga tushadi.
  const podium = showPodium ? ranked.slice(0, 3) : [];
  const rest = showPodium ? ranked.slice(3) : ranked;

  return (
    <div className="space-y-4">
      {/* Podium (top 3) */}
      {podium.length > 0 && (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          {podium.map((it, i) => (
            <PodiumCard
              key={it.student._id}
              it={it}
              slot={i + 1}
              isMe={isMe(it)}
            />
          ))}
        </div>
      )}

      {/* Qolgan qatorlar */}
      {rest.length > 0 && (
        <div className="space-y-1.5">
          {rest.map((it) => (
            <LeaderboardRow
              key={it.student._id}
              it={it}
              maxPoint={maxPoint}
              isMe={isMe(it)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
