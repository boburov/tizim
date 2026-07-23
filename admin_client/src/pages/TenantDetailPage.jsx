import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Copy,
  Globe,
  Loader2,
  RefreshCw,
  Server,
  Database,
} from 'lucide-react';
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

function copy(text) {
  navigator.clipboard.writeText(text);
  toast.success('Nusxalandi');
}

function Row({ icon: Icon, label, value, mono, copyable }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
      <span className="flex items-center gap-2 text-sm text-slate-500">
        {Icon && <Icon size={15} />} {label}
      </span>
      <span className="flex items-center gap-2">
        <span className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</span>
        {copyable && value && (
          <button onClick={() => copy(value)} className="text-slate-400 hover:text-brand">
            <Copy size={14} />
          </button>
        )}
      </span>
    </div>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();

  const { data: t, isLoading } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => api.get(`/tenants/${id}`).then((r) => r.data),
    refetchInterval: (q) =>
      q.state.data?.status === 'PROVISIONING' ? 3000 : false,
  });

  const retry = useMutation({
    mutationFn: () => api.post(`/tenants/${id}/retry`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', id] });
      toast.success('Qayta urinish boshlandi');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Xatolik'),
  });

  if (isLoading || !t)
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={15} /> Loyihalar
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl" style={{ background: t.brandColor }} />
          <div>
            <h1 className="text-2xl font-semibold">{t.name}</h1>
            <div className="text-sm text-slate-500">{t.domain}</div>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[t.status]}`}
        >
          {STATUS_LABEL[t.status] || t.status}
        </span>
      </div>

      {/* DNS / IP bo'limi — Cloudflare uchun */}
      <div className="mb-5 rounded-xl border border-brand/20 bg-brand/5 p-5">
        <h2 className="mb-2 flex items-center gap-2 font-medium text-slate-800">
          <Globe size={17} /> DNS sozlash (Cloudflare)
        </h2>
        <p className="mb-3 text-sm text-slate-600">{t.dns?.note}</p>
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <Row label="Record turi" value={t.dns?.recordType} mono />
          <Row label="Name" value={t.dns?.name} mono copyable />
          <Row label="IP manzil" value={t.dns?.ip} mono copyable />
        </div>
      </div>

      {/* Texnik ma'lumotlar */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 font-medium text-slate-800">Texnik ma'lumotlar</h2>
        <Row icon={Database} label="Baza nomi (noyob)" value={t.dbName} mono copyable />
        <Row icon={Server} label="PM2 process" value={t.pm2Name} mono copyable />
        <Row icon={Server} label="Port" value={t.port} mono />
        <Row label="Tizim" value={t.systemTemplate?.name} />
        <Row label="Bot token" value={t.botToken ? '•••• (o\'rnatilgan)' : "Yo'q"} />
        <Row label="Yaratgan" value={t.createdBy} />
      </div>

      {t.status === 'FAILED' && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="mb-2 font-medium text-red-700">Provisioning xatosi</div>
          <p className="mb-3 text-sm text-red-600">{t.failureReason}</p>
          <button
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {retry.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Qayta urinish
          </button>
        </div>
      )}

      {t.provisionLog && (
        <div className="rounded-xl border border-slate-200 bg-slate-900 p-4">
          <div className="mb-2 text-xs font-medium text-slate-400">
            Provisioning log
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
            {t.provisionLog}
          </pre>
        </div>
      )}
    </div>
  );
}
