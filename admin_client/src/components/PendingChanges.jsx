/**
 * Saqlangan, lekin hali tenantga YETKAZILMAGAN o'zgarishlar.
 *
 * Nega alohida qadam: brend rangi o'zgarishi client'ni qayta qurishni
 * talab qiladi (1-2 daqiqa). Har saqlashda avtomatik build boshlansa,
 * bir necha maydonni ketma-ket tahrirlagan admin bir necha marta qurishni
 * ishga tushirib yuborardi. Shuning uchun: avval saqlanadi, keyin bitta
 * "Qo'llash" hammasini birga yetkazadi.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Hammer, Loader2, RefreshCw, Rocket } from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';

const MODE_INFO = {
  restart: {
    icon: RefreshCw,
    label: 'Server qayta ishga tushadi',
    note: 'Bir necha soniya — sayt ochiq qoladi.',
  },
  rebuild: {
    icon: Hammer,
    label: 'Client qayta quriladi',
    note: "1-2 daqiqa. Build tugaguncha sayt eski ko'rinishda ishlaydi.",
  },
  none: {
    icon: RefreshCw,
    label: "Qayta ishga tushirish shart emas",
    note: null,
  },
};

export default function PendingChanges({ tenantId, pending, applyStatus, applyError }) {
  const qc = useQueryClient();

  const apply = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/apply`).then((r) => r.data),
    onSuccess: (data) => {
      toast.success(data.message || "Qo'llash boshlandi");
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenant-settings', tenantId] });
    },
    onError: (e) => toast.error(e.response?.data?.message || "Qo'llab bo'lmadi"),
  });

  const isApplying = applyStatus === 'APPLYING';
  const count = pending?.count ?? 0;

  if (applyStatus === 'FAILED' && applyError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
          <AlertCircle size={16} /> Qo'llash muvaffaqiyatsiz
        </div>
        <p className="mb-3 text-sm text-red-600 dark:text-red-300">{applyError}</p>
        <button
          onClick={() => apply.mutate()}
          disabled={apply.isPending}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {apply.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          Qayta urinish
        </button>
      </div>
    );
  }

  if (isApplying) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
        <Loader2 size={16} className="shrink-0 animate-spin" />
        O'zgarishlar tenantga yetkazilmoqda — bu sahifa o'zi yangilanadi.
      </div>
    );
  }

  if (!count) return null;

  const mode = MODE_INFO[pending.applies] || MODE_INFO.restart;
  const ModeIcon = mode.icon;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
        <AlertCircle size={16} />
        {count} ta o'zgarish qo'llanmagan
      </div>

      <div className="mb-3 space-y-1">
        {pending.entries.slice(0, 6).map((e) => (
          <div
            key={`${e.scope}.${e.key}`}
            className="flex flex-wrap items-baseline gap-x-2 text-xs text-amber-900/80 dark:text-amber-200/80"
          >
            <span className="font-medium">{e.label}</span>
            <span className="font-mono">
              {e.from ? (
                <>
                  <span className="line-through opacity-60">{e.from || "bo'sh"}</span>
                  {' → '}
                </>
              ) : null}
              <span>{e.to || "bo'sh"}</span>
            </span>
          </div>
        ))}
        {pending.entries.length > 6 && (
          <div className="text-xs text-amber-900/60 dark:text-amber-200/60">
            va yana {pending.entries.length - 6} ta…
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => apply.mutate()}
          disabled={apply.isPending}
          className={cn(
            'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground',
            'transition hover:bg-brand-dark disabled:opacity-60',
          )}
        >
          {apply.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Rocket size={15} />
          )}
          Qo'llash
        </button>

        <span className="flex items-center gap-1.5 text-xs text-amber-900/80 dark:text-amber-200/80">
          <ModeIcon size={13} />
          {mode.label}
          {mode.note && <span className="opacity-70">— {mode.note}</span>}
        </span>
      </div>
    </div>
  );
}
