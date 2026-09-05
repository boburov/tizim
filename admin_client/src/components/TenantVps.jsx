import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRightLeft, HardDrive, Loader2, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { VpsStatusBadge } from '../pages/VpsPage';

/**
 * TENANT → VPS BLOKI.
 *
 * Joriy server, holati va (faqat deploy qilinmagan tenant uchun)
 * almashtirish. Ishlab turgan tenantda tanlagich YO'Q — VPS'ni shunchaki
 * o'zgartirish uni "qog'ozda" ko'chirardi; buning o'rniga migratsiya
 * oqimi (3-faza) kerak va u alohida tugma bo'ladi.
 */
const CHANGEABLE = new Set(['DRAFT', 'FAILED']);

export default function TenantVps({ tenant, canEdit }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState('');

  const changeable = CHANGEABLE.has(tenant.status);

  const { data: vpsList } = useQuery({
    queryKey: ['vps'],
    queryFn: () => api.get('/vps').then((r) => r.data),
    // Ko'chirish uchun ham kerak — `changeable` bo'lmaganda ham so'raladi.
    enabled: canEdit,
  });

  const assign = useMutation({
    mutationFn: (vpsId) => api.patch(`/tenants/${tenant.id}/vps`, { vpsId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
      qc.invalidateQueries({ queryKey: ['vps'] });
      setPicked('');
      toast.success('VPS biriktirildi');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Biriktirib bo\'lmadi'),
  });

  // ── KO'CHIRISH ──
  // Ishlab turgan tenant uchun yagona to'g'ri yo'l. Manba avtomatik
  // o'chirilmaydi — buni alohida, domen tasdiqi bilan qilinadi.
  const [migrateTo, setMigrateTo] = useState('');
  const [decomOpen, setDecomOpen] = useState(false);
  const [confirmDomain, setConfirmDomain] = useState('');

  const migrate = useMutation({
    mutationFn: (targetVpsId) => api.post(`/tenants/${tenant.id}/migrate`, { targetVpsId }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['deployments', tenant.id] });
      qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
      setMigrateTo('');
      toast.success(r.data?.message || "Ko'chirish boshlandi");
    },
    onError: (e) => toast.error(e.response?.data?.message || "Ko'chirib bo'lmadi"),
  });

  const decommission = useMutation({
    mutationFn: (body) => api.post(`/tenants/${tenant.id}/decommission-source`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployments', tenant.id] });
      setDecomOpen(false);
      setConfirmDomain('');
      toast.success('Eski nusxani tozalash boshlandi');
    },
    onError: (e) => toast.error(e.response?.data?.message || "Tozalab bo'lmadi"),
  });

  const v = tenant.vps;

  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-medium text-foreground">
        <HardDrive size={17} /> Server (VPS)
      </h2>

      {v ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 p-3">
          <div className="min-w-0">
            <Link to={`/vps/${v.id}`} className="font-medium hover:text-brand">
              {v.name}
            </Link>
            {v.isLocal && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">lokal</span>}
            <div className="font-mono text-xs text-muted-foreground">{v.host}</div>
          </div>
          <div className="flex items-center gap-2">
            <VpsStatusBadge status={v.status} />
            {!v.isActive && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">deaktiv</span>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Loyiha hech qaysi VPS'ga biriktirilmagan — deploy'dan oldin server tanlang.
        </p>
      )}

      {canEdit && changeable && (
        <div className="mt-3 flex items-center gap-2">
          <select
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">{v ? 'Boshqa serverga biriktirish…' : 'Server tanlang…'}</option>
            {(vpsList || [])
              .filter((x) => x.isActive && x.id !== v?.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} — {x.host}{x.isLocal ? ' (lokal)' : ''}
                </option>
              ))}
          </select>
          <button
            disabled={!picked || assign.isPending}
            onClick={() => assign.mutate(picked)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
          >
            {assign.isPending && <Loader2 size={14} className="animate-spin" />} Biriktirish
          </button>
        </div>
      )}

      {/* ── DEPLOY QILINGAN TENANT: KO'CHIRISH ── */}
      {canEdit && !changeable && v && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ArrowRightLeft size={14} /> Boshqa serverga ko'chirish
          </h3>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Baza va fayllar nusxalanadi, nishonda o'rnatiladi va tekshiriladi. Jarayon davomida
            loyiha ESKI serverda ishlashda davom etadi. Muvaffaqiyat bo'lsa routing almashadi va
            eski serverda faqat pm2 to'xtatiladi — papka, baza va nginx qaytish yo'li sifatida qoladi.
          </p>

          <div className="flex items-center gap-2">
            <select
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={migrateTo}
              onChange={(e) => setMigrateTo(e.target.value)}
            >
              <option value="">Nishon serverni tanlang…</option>
              {(vpsList || [])
                .filter((x) => x.isActive && x.id !== v.id)
                .map((x) => {
                  const full = x.maxTenants != null && (x.tenantCount ?? 0) >= x.maxTenants;
                  return (
                    <option key={x.id} value={x.id} disabled={full}>
                      {x.name} — {x.host}
                      {x.status === 'ONLINE' ? '' : ' · tekshirilmagan'}
                      {full ? " · to'lgan" : ''}
                    </option>
                  );
                })}
            </select>
            <button
              disabled={!migrateTo || migrate.isPending}
              onClick={() => {
                const target = (vpsList || []).find((x) => x.id === migrateTo);
                if (!confirm(`"${tenant.name}" loyihasi "${target?.name}" serveriga ko'chirilsinmi?\n\nEski nusxa o'chirilmaydi.`))
                  return;
                migrate.mutate(migrateTo);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
            >
              {migrate.isPending && <Loader2 size={14} className="animate-spin" />} Ko'chirish
            </button>
          </div>

          {/* Eski nusxani tozalash — faqat oshkora, domen tasdiqi bilan */}
          <div className="mt-3">
            {!decomOpen ? (
              <button
                onClick={() => setDecomOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-300"
              >
                <Trash2 size={13} /> Eski serverdagi nusxani tozalash…
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                <div className="mb-2 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Tanlangan serverdagi papka, baza va nginx sozlamasi butunlay o'chiriladi.
                    Bu amalni qaytarib bo'lmaydi. Tasdiqlash uchun domenni yozing.
                  </span>
                </div>
                <select
                  className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={migrateTo}
                  onChange={(e) => setMigrateTo(e.target.value)}
                >
                  <option value="">Qaysi serverdan tozalansin…</option>
                  {(vpsList || [])
                    .filter((x) => x.id !== v.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} — {x.host}
                      </option>
                    ))}
                </select>
                <input
                  className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
                  placeholder={tenant.domain}
                  value={confirmDomain}
                  onChange={(e) => setConfirmDomain(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setDecomOpen(false); setConfirmDomain(''); }}
                    className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                  >
                    Bekor
                  </button>
                  <button
                    disabled={confirmDomain !== tenant.domain || !migrateTo || decommission.isPending}
                    onClick={() => decommission.mutate({ sourceVpsId: migrateTo, confirmDomain })}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Tozalash
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
