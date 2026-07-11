// Icons
import { TrendingUp, TrendingDown } from "lucide-react";

// Reference: to'q rangli "Time Tracker" karta - bu yerda oylik o'sish xulosasi.
const MonthlySummaryCard = ({ data }) => {
  const net = data?.netGrowth ?? 0;
  const positive = net >= 0;

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground">
      <div className="pointer-events-none absolute -bottom-12 -right-10 size-44 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -left-8 -top-8 size-28 rounded-full bg-black/10 blur-2xl" />

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Oylik o'sish</h2>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/15">
          {positive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        </span>
      </div>

      <p className="mt-3 text-4xl font-bold tabular-nums text-white">
        {net > 0 ? "+" : ""}
        {net}
      </p>
      <p className="text-xs text-primary-foreground/80">Sof o'quvchilar o'zgarishi</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/10 p-3">
          <p className="text-lg font-semibold text-white">{data?.newLeadsThisMonth ?? 0}</p>
          <p className="text-[11px] text-primary-foreground/80">Yangi lidlar</p>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <p className="text-lg font-semibold text-white">{data?.pendingLeads ?? 0}</p>
          <p className="text-[11px] text-primary-foreground/80">Kutilayotgan lidlar</p>
        </div>
      </div>
    </div>
  );
};

export default MonthlySummaryCard;
