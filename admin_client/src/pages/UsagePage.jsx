import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Wifi, WifiOff } from 'lucide-react';
import { api } from '../api/client';
import { STATUS_LABEL, STATUS_STYLE } from '../lib/tenantStatus';
import UsageLimits from '../components/UsageLimits';

const timeAgo = (date) => {
  if (!date) return 'hech qachon';
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1) return 'hozir';
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
};

export default function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['usage-overview'],
    queryFn: () => api.get('/usage').then((r) => r.data),
    refetchInterval: 60000, // har daqiqada yangilanadi
  });

  const exceededCount = data?.filter((t) => t.exceeded?.length).length ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Foydalanish</h1>
        <p className="text-sm text-muted-foreground">
          Har loyihaning limitlari va hozirgi holati
        </p>
      </div>

      {exceededCount > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={17} />
          {exceededCount} ta loyihada limit oshgan — tarifni oshirish kerak
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali loyiha yo'q.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <Link
                    to={`/tenants/${t.id}`}
                    className="font-medium hover:text-brand"
                  >
                    {t.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{t.domain}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status]}`}
                  >
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-xs ${
                      t.online ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'
                    }`}
                    title={`Oxirgi aloqa: ${timeAgo(t.lastHeartbeatAt)}`}
                  >
                    {t.online ? <Wifi size={12} /> : <WifiOff size={12} />}
                    {timeAgo(t.lastHeartbeatAt)}
                  </span>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Tarif:</span>
                <span className="font-medium">
                  {t.planName || (
                    <span className="text-amber-600 dark:text-amber-300">biriktirilmagan</span>
                  )}
                </span>
              </div>

              <UsageLimits limits={t.limits} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
