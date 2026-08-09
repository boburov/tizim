import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ExternalLink,
  Gauge,
  Loader2,
  Plug,
  Users,
} from 'lucide-react';
import { api } from '../api/client';

const num = (v) => Number(v ?? 0).toLocaleString('uz-UZ');

/**
 * Sotiladigan API xizmatlar ro'yxati.
 *
 * Bu Tariflar sahifasidan ALOHIDA: u yerda o'quv markazlarga (tenant)
 * sotiladigan tizim tariflari, bu yerda esa kalit bilan ishlaydigan
 * API mahsulotlari — limitlari ham boshqacha (so'rov tezligi, parallel slot).
 */
export default function ApiServicesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['api-services'],
    queryFn: () => api.get('/api-services').then((r) => r.data),
    refetchInterval: 60000,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">API xizmatlar</h1>
        <p className="text-sm text-muted-foreground">
          Kalit bilan sotiladigan xizmatlar — tarif, muddat va so'rovlar hisobi
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali xizmat yo'q.
          <div className="mt-1 text-xs">
            Boshlash uchun: <code className="font-mono">npm run seed:api</code>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((s) => (
            <Link
              key={s.id}
              to={`/api-services/${s.id}`}
              className="rounded-xl border border-border bg-card p-5 transition hover:border-brand"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    <Plug size={17} className="shrink-0 text-brand" />
                    <span className="truncate">{s.name}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {s.key}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    s.isActive
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {s.isActive ? 'Faol' : "O'chiq"}
                </span>
              </div>

              {s.description && (
                <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                  {s.description}
                </p>
              )}

              <div className="mb-3 flex flex-wrap gap-2">
                {s.tiers.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                  >
                    <b>${Number(t.price)}</b>
                    <span className="text-muted-foreground">
                      {' · '}
                      {t.concurrency} slot · {t.rateLimitRpm} rpm
                    </span>
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users size={13} /> {s.activeSubscriptions} faol /{' '}
                  {s.subscriptionCount} obuna
                </span>
                <span className="flex items-center gap-1">
                  <Activity size={13} /> {num(s.usage30d.ok)} so'rov / 30 kun
                </span>
                {s.usage30d.rejected > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-300">
                    <Gauge size={13} /> {num(s.usage30d.rejected)} rad etilgan
                  </span>
                )}
              </div>

              {s.baseUrl && (
                <div className="mt-2 flex items-center gap-1 truncate font-mono text-xs text-muted-foreground">
                  <ExternalLink size={12} className="shrink-0" /> {s.baseUrl}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
