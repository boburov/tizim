import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Copy,
  CreditCard,
  Globe,
  LayoutDashboard,
  Loader2,
  Palette,
  RefreshCw,
  Server,
  Settings2,
  Database,
  Package,
  Trash2,
  X,
} from 'lucide-react';
// lucide v1 brend ikonkalarini olib tashladi — GitHub belgisi lokal.
import Github from '../components/GithubIcon';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import TenantFeatures from '../components/TenantFeatures';
import {
  BUSY_STATUSES,
  STATUS_LABEL,
  STATUS_STYLE,
} from '../lib/tenantStatus';
import UsageLimits from '../components/UsageLimits';
import BranchLimits from '../components/BranchLimits';
import SitePreview from '../components/SitePreview';
import TenantBrand from '../components/TenantBrand';
import TenantSettings from '../components/TenantSettings';
import TenantRepo from '../components/TenantRepo';
import PendingChanges from '../components/PendingChanges';

const TABS = [
  { key: 'umumiy', label: 'Umumiy', icon: LayoutDashboard },
  { key: 'brend', label: 'Brend', icon: Palette },
  // Bo'limlar — qaysi modullar shu loyihada ochiq. Sozlamalardan
  // ALOHIDA: sozlama ".env qiymati", bu esa tijorat qarori.
  { key: 'bolimlar', label: "Bo'limlar", icon: Package },
  { key: 'sozlamalar', label: 'Sozlamalar', icon: Settings2 },
  { key: 'github', label: 'GitHub', icon: Github },
];

function copy(text) {
  navigator.clipboard.writeText(text);
  toast.success('Nusxalandi');
}

function Row({ icon: Icon, label, value, mono, copyable }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon size={15} />} {label}
      </span>
      <span className="flex items-center gap-2">
        <span className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</span>
        {copyable && value && (
          <button onClick={() => copy(value)} className="text-muted-foreground hover:text-brand">
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [delOpen, setDelOpen] = useState(false);
  const [confirmDomain, setConfirmDomain] = useState('');
  const [planKey, setPlanKey] = useState('');
  const [tab, setTab] = useState('umumiy');

  const { data: t, isLoading } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => api.get(`/tenants/${id}`).then((r) => r.data),
    // Provisioning yoki sozlama qo'llash ketayotganda holat o'zi yangilanadi
    refetchInterval: (q) =>
      BUSY_STATUSES.includes(q.state.data?.status) ||
      q.state.data?.applyStatus === 'APPLYING'
        ? 3000
        : false,
  });

  // Kutilayotgan o'zgarishlar soni — tab yonidagi belgi uchun
  const { data: settingsInfo } = useQuery({
    queryKey: ['tenant-settings', id],
    queryFn: () => api.get(`/tenants/${id}/settings`).then((r) => r.data),
    enabled: !!t && t.status !== 'DELETED',
    refetchInterval: (q) => (q.state.data?.applyStatus === 'APPLYING' ? 3000 : false),
  });

  // Limitlar va foydalanish
  const { data: usage } = useQuery({
    queryKey: ['tenant-usage', id],
    queryFn: () => api.get(`/usage/tenant/${id}`).then((r) => r.data),
    enabled: !!t && t.status !== 'DELETED',
  });

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  });

  const assignPlan = useMutation({
    mutationFn: (key) =>
      api.post(`/tenants/${id}/subscription`, { planKey: key }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-usage', id] });
      qc.invalidateQueries({ queryKey: ['tenant', id] });
      toast.success('Tarif biriktirildi');
      setPlanKey('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Xatolik'),
  });

  const remove = useMutation({
    mutationFn: () =>
      api.delete(`/tenants/${id}`, { data: { confirmDomain } }),
    onSuccess: () => {
      toast.success("O'chirish boshlandi — VPS resurslari tozalanmoqda");
      setDelOpen(false);
      setConfirmDomain('');
      qc.invalidateQueries({ queryKey: ['tenant', id] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || "O'chirib bo'lmadi"),
  });

  const purge = useMutation({
    mutationFn: () => api.delete(`/tenants/${id}/purge`),
    onSuccess: () => {
      toast.success('Arxiv yozuvi tozalandi');
      qc.invalidateQueries({ queryKey: ['tenants'] });
      navigate('/');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Xatolik'),
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
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
      </div>
    );

  // Brend va sozlamalar bo'limlarida preview yonma-yon turadi — kengroq joy kerak
  const wide = tab === 'brend' || tab === 'sozlamalar';
  const pendingCount = settingsInfo?.pending?.count ?? 0;

  return (
    <div className={wide ? 'mx-auto max-w-6xl' : 'mx-auto max-w-3xl'}>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> Loyihalar
      </Link>

      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl" style={{ background: t.brandColor }} />
          <div>
            <h1 className="text-2xl font-semibold">{t.name}</h1>
            <div className="text-sm text-muted-foreground">{t.domain}</div>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[t.status]}`}
        >
          {STATUS_LABEL[t.status] || t.status}
        </span>
      </div>

      {/* Bo'limlar */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === key
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={15} /> {label}
            {key === 'sozlamalar' && pendingCount > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'brend' && <TenantBrand tenant={t} canEdit={t.status !== 'DELETED'} />}

      {tab === 'sozlamalar' && (
        <TenantSettings tenantId={t.id} canEdit={t.status !== 'DELETED'} />
      )}

      {tab === 'bolimlar' && (
        <TenantFeatures
          tenantId={t.id}
          /* ⚠ FAQAT SUPER_ADMIN. Modulni yoqish — tijorat qarori:
             qo'llab-quvvatlash paytidagi "shunchaki yoqib qo'yaqol"
             bosimi ADMIN roliga ochilsa jimgina narx qaroriga
             aylanardi. ADMIN va VIEWER holatni ko'radi, o'zgartira
             olmaydi. */
          canEdit={isSuperAdmin && t.status !== 'DELETED'}
        />
      )}

      {tab === 'github' && <TenantRepo tenant={t} canEdit={t.status !== 'DELETED'} />}

      {tab !== 'umumiy' ? null : (
      <>
      {/* Kutilayotgan o'zgarishlar — qaysi bo'limda bo'lishidan qat'i nazar
          e'tibor talab qiladi, shuning uchun bosh sahifada ham ko'rinadi */}
      {settingsInfo && pendingCount > 0 && (
        <div className="mb-5">
          <PendingChanges
            tenantId={t.id}
            pending={settingsInfo.pending}
            applyStatus={settingsInfo.applyStatus}
            applyError={settingsInfo.applyError}
          />
        </div>
      )}

      {/* Sayt preview — tirik bo'lsa iframe, bo'lmasa brend mock */}
      <SitePreview tenant={t} />

      {/* DNS / IP bo'limi — Cloudflare uchun */}
      <div className="mb-5 rounded-xl border border-brand/20 bg-brand/5 p-5">
        <h2 className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <Globe size={17} /> DNS sozlash (Cloudflare)
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{t.dns?.note}</p>
        <div className="rounded-lg bg-card p-3 ring-1 ring-border">
          <Row label="Record turi" value={t.dns?.recordType} mono />
          <Row label="Name" value={t.dns?.name} mono copyable />
          <Row label="IP manzil" value={t.dns?.ip} mono copyable />
        </div>
      </div>

      {/* Texnik ma'lumotlar */}
      <div className="mb-5 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 font-medium text-foreground">Texnik ma'lumotlar</h2>
        <Row icon={Database} label="Baza nomi (noyob)" value={t.dbName} mono copyable />
        <Row icon={Server} label="PM2 process" value={t.pm2Name} mono copyable />
        <Row icon={Server} label="Port" value={t.port} mono />
        <Row label="Tizim" value={t.systemTemplate?.name} />
        <Row
          icon={Github}
          label="GitHub repo"
          value={t.repoFullName || (t.gitStatus === 'DISABLED' ? "O'chirilgan" : "Yo'q")}
          mono={Boolean(t.repoFullName)}
        />
        <Row label="Yaratgan" value={t.createdBy} />
      </div>

      {/* Filiallar — chegara, foydalanish va pullik paketlar.
          Tarif kartasidan OLDIN: filial chegarasi Developer Admin eng
          ko'p tegadigan sozlama va u tarifdan MUSTAQIL o'zgartiriladi. */}
      {t.status !== 'DELETED' && (
        <BranchLimits tenantId={t.id} canEdit={isSuperAdmin || user?.role === 'ADMIN'} />
      )}

      {/* Tarif va limitlar */}
      {t.status !== 'DELETED' && (
        <div className="mb-5 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-medium text-foreground">
            <CreditCard size={17} /> Tarif va limitlar
          </h2>

          <div className="mb-4 flex items-center gap-2">
            <select
              value={planKey}
              onChange={(e) => setPlanKey(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="">
                {usage?.subscription
                  ? `Hozirgi: ${usage.subscription.planName}`
                  : 'Tarif tanlanmagan'}
              </option>
              {plans?.map((p) => (
                <option key={p.id} value={p.key}>
                  {p.name} — {Number(p.price).toLocaleString('uz-UZ')} UZS
                </option>
              ))}
            </select>
            <button
              onClick={() => assignPlan.mutate(planKey)}
              disabled={!planKey || assignPlan.isPending}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
            >
              {assignPlan.isPending && (
                <Loader2 size={15} className="animate-spin" />
              )}
              Biriktirish
            </button>
          </div>

          <UsageLimits limits={usage?.limits} />

          {usage?.limits?.length > 0 && (
            <Link
              to="/usage"
              className="mt-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
            >
              <BarChart3 size={14} /> Barcha loyihalar foydalanishi
            </Link>
          )}
        </div>
      )}

      {t.status === 'FAILED' && (
        <div className="mb-5 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-5">
          <div className="mb-2 font-medium text-red-700 dark:text-red-300">Provisioning xatosi</div>
          <p className="mb-3 text-sm text-red-600 dark:text-red-300">{t.failureReason}</p>
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

      {/*
        Log panellari ATAYLAB har ikki temada ham to'q (terminal ko'rinishi).
        Shu sababli ichidagi matnlar token emas, aniq ochroq ranglar bilan
        yozilgan - `text-muted-foreground` bu to'q fonda o'qilmaydi.
      */}
      {t.provisionLog && (
        <div className="mb-5 rounded-xl border border-border bg-slate-900 p-4">
          <div className="mb-2 text-xs font-medium text-slate-400">
            Provisioning log
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
            {t.provisionLog}
          </pre>
        </div>
      )}

      {t.deprovisionLog && (
        <div className="mb-5 rounded-xl border border-orange-200 dark:border-orange-500/30 bg-slate-900 p-4">
          <div className="mb-2 text-xs font-medium text-orange-400">
            O'chirish (deprovision) log
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
            {t.deprovisionLog}
          </pre>
        </div>
      )}

      {/* --- Xavfli hudud --- */}
      {isSuperAdmin && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
            <AlertTriangle size={17} /> Xavfli hudud
          </h2>

          {t.status === 'DELETED' ? (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Bu loyiha o'chirilgan
                {t.deletedAt &&
                  ` (${new Date(t.deletedAt).toLocaleString('uz-UZ')})`}
                . Arxiv yozuvi bazada saqlanmoqda — uni butunlay tozalash mumkin.
              </p>
              <button
                onClick={() => {
                  if (confirm('Arxiv yozuvi bazadan butunlay tozalansinmi?'))
                    purge.mutate();
                }}
                disabled={purge.isPending}
                className="flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-300 transition hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
              >
                {purge.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
                Arxiv yozuvini tozalash
              </button>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Loyihani o'chirish VPS'dagi MongoDB bazasi, PM2 process, nginx
                config va fayllarni butunlay yo'q qiladi. Bu amalni{' '}
                <span className="font-medium text-red-600 dark:text-red-300">
                  qaytarib bo'lmaydi
                </span>
                .
              </p>
              <button
                onClick={() => setDelOpen(true)}
                disabled={BUSY_STATUSES.includes(t.status)}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={15} /> Loyihani o'chirish
              </button>
              {BUSY_STATUSES.includes(t.status) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Jarayon ketmoqda — tugashini kuting
                </p>
              )}
            </>
          )}
        </div>
      )}

      </>
      )}

      {/* O'chirishni tasdiqlash modali */}
      {delOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-300">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="font-semibold">Loyihani o'chirish</h3>
              </div>
              <button
                onClick={() => setDelOpen(false)}
                className="text-muted-foreground hover:text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <p className="mb-2 text-sm text-muted-foreground">
              Quyidagilar butunlay o'chiriladi:
            </p>
            <ul className="mb-4 space-y-1 text-sm text-muted-foreground">
              <li>• MongoDB bazasi (<span className="font-mono text-xs">{t.dbName}</span>)</li>
              <li>• PM2 process (<span className="font-mono text-xs">{t.pm2Name}</span>)</li>
              <li>• Nginx config va SSL sertifikat</li>
              <li>• Ilova fayllari va client build</li>
            </ul>

            <p className="mb-2 text-sm text-muted-foreground">
              Tasdiqlash uchun domenni aynan yozing:
            </p>
            <div className="mb-1 rounded bg-muted px-2 py-1 text-center font-mono text-sm">
              {t.domain}
            </div>
            <input
              autoFocus
              value={confirmDomain}
              onChange={(e) => setConfirmDomain(e.target.value)}
              placeholder={t.domain}
              className="mb-5 mt-2 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm outline-none focus:border-red-500"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDelOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Bekor qilish
              </button>
              <button
                onClick={() => remove.mutate()}
                disabled={confirmDomain !== t.domain || remove.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {remove.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Ha, o'chirilsin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
