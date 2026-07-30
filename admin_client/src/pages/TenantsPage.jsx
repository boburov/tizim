import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import {
  BUSY_STATUSES,
  STATUS_LABEL,
  STATUS_STYLE,
} from '../lib/tenantStatus';

export default function TenantsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/tenants').then((r) => r.data),
    refetchInterval: (q) =>
      // Provisioning/o'chirish ketayotgan bo'lsa har 4 soniyada yangilaymiz
      q.state.data?.some((t) => BUSY_STATUSES.includes(t.status)) ? 4000 : false,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Loyihalar</h1>
          <p className="text-sm text-muted-foreground">
            Yaratilgan o'quv markazlar va boshqa tizimlar
          </p>
        </div>
        <Link
          to="/tenants/new"
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark"
        >
          <Plus size={18} /> Yangi loyiha
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali loyiha yo'q. "Yangi loyiha" tugmasi bilan boshlang.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t) => (
            <Link
              key={t.id}
              to={`/tenants/${t.id}`}
              className="rounded-xl border border-border bg-card p-5 transition hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-lg"
                    style={{ background: t.brandColor }}
                  />
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.domain}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status]}`}
                >
                  {STATUS_LABEL[t.status] || t.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.systemTemplate?.name}
                </span>
              </div>
              {t.status === 'ACTIVE' && (
                <div className="mt-3 flex items-center gap-1 text-xs text-brand">
                  <ExternalLink size={13} /> https://{t.domain}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
