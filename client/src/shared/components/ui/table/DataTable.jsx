import { cn } from "@/shared/utils/cn";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";

/**
 * DataTable - qayta ishlatiladigan jadval.
 *
 * Desktopda klassik jadval, mobil (< md) da har bir qator kartaga aylanadi.
 * Yuklash (skeleton) va empty holatlari ichida boshqariladi.
 *
 * Props:
 *   columns: [{ key, header, className?, headerClassName?, cell: (row, i) => node }]
 *   rows:    massiv
 *   rowKey:  (row) => string
 *   onRowClick?: (row) => void           // qator bosilsa
 *   renderCard: (row, i) => node         // mobil karta ko'rinishi
 *   isLoading, skeletonRows, empty (node)
 */
const DataTable = ({
  columns = [],
  rows = [],
  rowKey = (r) => r._id,
  onRowClick,
  renderCard,
  isLoading = false,
  skeletonRows = 6,
  empty = null,
  className = "",
  rowClassName = "",
}) => {
  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        {/* Desktop skeleton */}
        <div className="hidden overflow-hidden rounded-lg border bg-white md:block">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b px-4 py-3 last:border-0"
            >
              {columns.map((c) => (
                <Skeleton key={c.key} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
        {/* Mobil skeleton */}
        <div className="space-y-2 md:hidden">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return empty || <EmptyState />;
  }

  return (
    <div className={className}>
      {/* ===== Desktop: jadval ===== */}
      <div className="hidden overflow-hidden rounded-lg border bg-white md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.headerClassName}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer hover:bg-muted/50",
                    rowClassName,
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn("px-4 py-2.5", c.className)}
                    >
                      {c.cell(row, i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Mobil: kartalar ===== */}
      <div className="space-y-2 md:hidden">
        {rows.map((row, i) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "rounded-lg border bg-white p-3",
              onRowClick && "cursor-pointer transition-colors active:bg-muted/50",
            )}
          >
            {renderCard ? renderCard(row, i) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DataTable;
