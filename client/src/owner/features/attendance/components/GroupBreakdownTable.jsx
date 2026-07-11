import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/shared/components/shadcn/skeleton";
import Pagination from "@/shared/components/ui/pagination/Pagination";

const ROW_SKELETON_COUNT = 6;

// Davomat darajasiga qarab progress bar uchun yumshoq rang
const barTone = (rate) => {
  if (rate === null || rate === undefined) return "bg-slate-300";
  if (rate >= 75) return "bg-emerald-500";
  if (rate >= 50) return "bg-amber-500";
  return "bg-rose-500";
};

const GroupBreakdownTable = ({
  items = [],
  isLoading = false,
  meta = null,
  page = 1,
  onPageChange,
}) => (
  <div className="border rounded-md overflow-hidden bg-white">
    <div className="px-4 py-3 border-b bg-gray-50">
      <h3 className="font-semibold text-base">Guruhlar bo'yicha statistika</h3>
    </div>

    {isLoading ? (
      <div className="p-4 space-y-2">
        {Array.from({ length: ROW_SKELETON_COUNT }).map((_, i) => (
          <div key={i} className="grid grid-cols-3 gap-4 items-center py-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
    ) : items.length === 0 ? (
      <div className="px-4 py-12 text-center">
        <BarChart3 className="size-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Statistika mavjud emas</p>
        <p className="text-xs text-muted-foreground mt-1">
          Tanlangan davr uchun guruhlar bo'yicha ma'lumot topilmadi
        </p>
      </div>
    ) : (
      <div className="max-h-[600px] overflow-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-gray-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 font-semibold">Guruh</th>
              <th className="px-4 py-3 font-semibold">Jami darslar</th>
              <th className="px-4 py-3 font-semibold">Davomat</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.groupId} className="border-t hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    to={`/owner/groups/${g.groupId}`}
                    className="font-medium hover:underline"
                  >
                    {g.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{g.totalClasses}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-24 max-w-[40%] overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${barTone(g.groupRate)}`}
                        style={{ width: `${g.groupRate ?? 0}%` }}
                      />
                    </div>
                    <span className="font-medium tabular-nums text-gray-900">
                      {g.groupRate !== null ? `${g.groupRate}%` : "-"}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {!isLoading && meta && meta.pages > 1 && (
      <div className="px-4 py-3 border-t bg-white">
        <Pagination
          currentPage={page}
          onPageChange={onPageChange}
          totalPages={meta.pages}
          hasNextPage={page < meta.pages}
          hasPrevPage={page > 1}
        />
      </div>
    )}
  </div>
);

export default GroupBreakdownTable;
