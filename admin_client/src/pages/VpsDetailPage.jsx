import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Server } from 'lucide-react';
import { api } from '../api/client';
import { STATUS_LABEL, STATUS_STYLE } from '../lib/tenantStatus';
import { VpsStatusBadge } from './VpsPage';

/** VPS tafsiloti — unda turgan loyihalar va oxirgi test jurnali. */
export default function VpsDetailPage() {
  const { id } = useParams();
  const { data: v, isLoading } = useQuery({
    queryKey: ['vps', id],
    queryFn: () => api.get(`/vps/${id}`).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
      </div>
    );
  }
  if (!v) return <div className="text-muted-foreground">VPS topilmadi</div>;

  return (
    <div>
      <Link to="/vps" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand">
        <ArrowLeft size={15} /> Serverlar
      </Link>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Server size={22} className="text-brand" /> {v.name}
          </h1>
          <div className="mt-1 font-mono text-sm text-muted-foreground">
            {v.sshUser}@{v.host}:{v.sshPort} · {v.rootDir}
          </div>
        </div>
        <VpsStatusBadge status={v.status} />
      </div>

      <div className="mb-5 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-medium">Loyihalar ({v.tenants?.length ?? 0})</h2>
        {!v.tenants?.length ? (
          <p className="text-sm text-muted-foreground">Bu serverda hali loyiha yo'q.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2">Loyiha</th>
                <th className="pb-2">Domen</th>
                <th className="pb-2">Port</th>
                <th className="pb-2">Holat</th>
                <th className="pb-2">Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {v.tenants.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-2">
                    <Link to={`/tenants/${t.id}`} className="font-medium hover:text-brand">{t.name}</Link>
                  </td>
                  <td className="py-2 font-mono text-xs">{t.domain}</td>
                  <td className="py-2 font-mono text-xs">{t.port}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[t.status] || ''}`}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {t.lastHeartbeatAt ? new Date(t.lastHeartbeatAt).toLocaleString('uz-UZ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {v.lastCheckLog && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-2 font-medium">
            Oxirgi test{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {v.lastCheckedAt ? new Date(v.lastCheckedAt).toLocaleString('uz-UZ') : ''}
            </span>
          </h2>
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs">{v.lastCheckLog}</pre>
        </div>
      )}
    </div>
  );
}
