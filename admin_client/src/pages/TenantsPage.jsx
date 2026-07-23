import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../api/client';

const STATUS_STYLE = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PROVISIONING: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  SUSPENDED: 'bg-slate-200 text-slate-500',
};

const STATUS_LABEL = {
  DRAFT: 'Qoralama',
  PROVISIONING: 'Yaratilmoqda…',
  ACTIVE: 'Faol',
  FAILED: 'Xato',
  SUSPENDED: "To'xtatilgan",
};

export default function TenantsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/tenants').then((r) => r.data),
    refetchInterval: (q) =>
      // Provisioning ketayotgan bo'lsa har 4 soniyada yangilaymiz
      q.state.data?.some((t) => t.status === 'PROVISIONING') ? 4000 : false,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Loyihalar</h1>
          <p className="text-sm text-slate-500">
            Yaratilgan o'quv markazlar va boshqa tizimlar
          </p>
        </div>
        <Link
          to="/tenants/new"
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          <Plus size={18} /> Yangi loyiha
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Hali loyiha yo'q. "Yangi loyiha" tugmasi bilan boshlang.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t) => (
            <Link
              key={t.id}
              to={`/tenants/${t.id}`}
              className="rounded-xl border border-slate-200 bg-white p-5 transition hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-lg"
                    style={{ background: t.brandColor }}
                  />
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.domain}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status]}`}
                >
                  {STATUS_LABEL[t.status] || t.status}
                </span>
                <span className="text-xs text-slate-400">
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
