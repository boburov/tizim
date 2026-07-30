import { AlertTriangle, Infinity as InfinityIcon } from 'lucide-react';
import { formatLimit, usageColor } from '../lib/tenantStatus';

/**
 * Tarif limitlari va hozirgi foydalanish. `limits` — /usage/tenant/:id
 * javobidagi massiv.
 */
export default function UsageLimits({ limits, compact = false }) {
  if (!limits?.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Tarif biriktirilmagan — limitlar yo'q
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {limits.map((l) => {
        const unlimited = l.value === -1;
        const isBool = l.type === 'BOOLEAN';

        return (
          <div key={l.key}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {l.name}
                {l.exceeded && (
                  <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />
                )}
              </span>
              <span
                className={
                  l.exceeded ? 'font-medium text-red-600 dark:text-red-300' : 'text-muted-foreground'
                }
              >
                {isBool ? (
                  l.value > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-300">Yoqilgan</span>
                  ) : (
                    <span className="text-muted-foreground">O'chirilgan</span>
                  )
                ) : unlimited ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {l.usage ?? 0} / <InfinityIcon size={14} />
                  </span>
                ) : (
                  <>
                    {l.usage ?? 0} / {formatLimit(l.value)}
                    {l.unit ? ` ${l.unit}` : ''}
                  </>
                )}
              </span>
            </div>

            {/* Progress bar faqat raqamli va cheklangan limitlar uchun */}
            {!isBool && !unlimited && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${usageColor(l.percent)}`}
                  style={{ width: `${Math.min(l.percent ?? 0, 100)}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
