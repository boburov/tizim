import { Skeleton } from "@/shared/components/shadcn/skeleton";

const ROWS = Array.from({ length: 8 });

const ActivityLogsTableSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div className="h-[45px] border-b border-slate-200 bg-slate-50/80" />
    {ROWS.map((_, i) => (
      <div
        key={i}
        className="flex h-[68px] items-center gap-4 border-b border-slate-100 px-6 last:border-b-0"
      >
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="w-[150px] space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-3.5 w-24 shrink-0" />
        <Skeleton className="h-3.5 flex-1" />
        <Skeleton className="h-3.5 w-20 shrink-0" />
        <div className="w-[110px] shrink-0 space-y-1.5">
          <Skeleton className="ml-auto h-3.5 w-24" />
          <Skeleton className="ml-auto h-3 w-10" />
        </div>
      </div>
    ))}
  </div>
);

export default ActivityLogsTableSkeleton;
