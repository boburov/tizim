import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Gift,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABEL, STATUS_STYLE } from '../lib/tenantStatus';

/** Sinov muddati chegarasi — backenddagi GrantTrialDto bilan bir xil. */
const TRIAL_PRESETS = [7, 14, 30];
const TRIAL_MAX = 30;

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('uz-UZ', { dateStyle: 'medium' }) : '—';

const errMsg = (e, fallback) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || fallback;
};

/**
 * Foydalanuvchilar (mijozlar) sahifasi.
 *
 * Bu yerda ikki xil ish qilinadi: kimligini ko'rish va OBUNASINI boshqarish.
 * Shuning uchun har loyiha yonida obuna holati va uchta amal turadi —
 * sinov berish, to'xtatish, qaytarish. Loyihaning texnik tafsilotlari
 * (brend, sozlama, log) esa loyiha sahifasida qoladi.
 */
export default function UsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [search, setSearch] = useState('');
  const [trialFor, setTrialFor] = useState(null); // tenant obyekti

  const { data: customers, isLoading } = useQuery({
    queryKey: ['admin-customers', search],
    queryFn: () =>
      api
        .get('/admin/customers', { params: search ? { q: search } : undefined })
        .then((r) => r.data),
  });

  const { data: unassigned } = useQuery({
    queryKey: ['admin-unassigned-tenants'],
    queryFn: () =>
      api.get('/admin/customers/unassigned-tenants').then((r) => r.data),
  });

  const { data: checker } = useQuery({
    queryKey: ['subscription-checker'],
    queryFn: () => api.get('/subscriptions/checker').then((r) => r.data),
    refetchInterval: 60000,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-customers'] });
    qc.invalidateQueries({ queryKey: ['admin-unassigned-tenants'] });
    qc.invalidateQueries({ queryKey: ['subscription-checker'] });
    qc.invalidateQueries({ queryKey: ['tenants'] });
  };

  const setActive = useMutation({
    mutationFn: ({ id, isActive }) =>
      api.patch(`/admin/customers/${id}/active`, { isActive }),
    onSuccess: (_, v) => {
      refreshAll();
      toast.success(v.isActive ? 'Hisob ochildi' : 'Hisob bloklandi');
    },
    onError: (e) => toast.error(errMsg(e, "Bajarib bo'lmadi")),
  });

  const suspend = useMutation({
    mutationFn: ({ id, reason }) =>
      api.post(`/subscriptions/tenants/${id}/suspend`, { reason }),
    onSuccess: () => {
      refreshAll();
      toast.success("Loyiha to'xtatildi — server o'chirildi");
    },
    onError: (e) => toast.error(errMsg(e, "To'xtatib bo'lmadi")),
  });

  const resume = useMutation({
    mutationFn: (id) => api.post(`/subscriptions/tenants/${id}/resume`),
    onSuccess: () => {
      refreshAll();
      toast.success('Loyiha qayta yoqildi');
    },
    onError: (e) => toast.error(errMsg(e, "Qayta yoqib bo'lmadi")),
  });

  const runCheck = useMutation({
    mutationFn: () => api.post('/subscriptions/checker/run'),
    onSuccess: (r) => {
      refreshAll();
      const d = r.data || {};
      toast.success(
        d.checked
          ? `${d.checked} ta tugagan obuna topildi, ${d.suspended} loyiha to'xtatildi`
          : 'Muddati tugagan obuna topilmadi',
      );
    },
    onError: (e) => toast.error(errMsg(e, 'Tekshirib bo\'lmadi')),
  });

  const tenantActions = { canManage, suspend, resume, onTrial: setTrialFor };

  const totals = useMemo(() => {
    const list = customers || [];
    const tenants = list.flatMap((c) => c.tenants);
    return {
      customers: list.length,
      tenants: tenants.length,
      trialing: tenants.filter((t) => t.subscription?.status === 'TRIALING')
        .length,
      suspended: tenants.filter((t) => t.status === 'SUSPENDED').length,
    };
  }, [customers]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Foydalanuvchilar</h1>
          <p className="text-sm text-muted-foreground">
            Ro'yxatdan o'tgan mijozlar, ularning loyihalari va obuna holati
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email, ism yoki kompaniya…"
              className="w-64 rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-brand"
            />
          </div>
          {canManage && (
            <button
              onClick={() => runCheck.mutate()}
              disabled={runCheck.isPending}
              title="Muddati tugagan obunalarni hozir tekshirish"
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50"
            >
              {runCheck.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              Muddatni tekshirish
            </button>
          )}
        </div>
      </div>

      {/* Kuzatuvchi holati — "server o'chishi" qoidasi ishlayaptimi degan javob */}
      {checker && (
        <div
          className={`mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border px-4 py-3 text-sm ${
            checker.autoSuspend
              ? 'border-border bg-card text-muted-foreground'
              : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
          }`}
        >
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            {checker.autoSuspend ? (
              <ShieldCheck size={15} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle size={15} />
            )}
            {checker.autoSuspend
              ? "Obuna tugaganda server avtomatik o'chadi"
              : "Avtomatik o'chirish O'CHIRILGAN (SUBSCRIPTION_AUTOSUSPEND=false)"}
          </span>
          <span>Har {checker.intervalMinutes} daqiqada tekshiriladi</span>
          {checker.graceHours > 0 && (
            <span>Qo'shimcha muhlat: {checker.graceHours} soat</span>
          )}
          <span>
            Oxirgi tekshiruv:{' '}
            {checker.lastRunAt
              ? new Date(checker.lastRunAt).toLocaleString('uz-UZ')
              : 'hali bo\'lmagan'}
          </span>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mijozlar" value={totals.customers} />
        <Stat label="Loyihalar" value={totals.tenants} />
        <Stat label="Sinovda" value={totals.trialing} tone="emerald" />
        <Stat label="To'xtatilgan" value={totals.suspended} tone="red" />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !customers?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          {search
            ? 'Qidiruvga mos foydalanuvchi topilmadi.'
            : "Hali ro'yxatdan o'tgan foydalanuvchi yo'q."}
        </div>
      ) : (
        <div className="space-y-4">
          {customers.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              canManage={canManage}
              onToggleActive={() =>
                setActive.mutate({ id: c.id, isActive: !c.isActive })
              }
              actions={tenantActions}
            />
          ))}
        </div>
      )}

      {/* Super admin o'zi yaratgan loyihalar — egasi yo'q, lekin ularga ham
          sinov berish va to'xtatish kerak bo'ladi. */}
      {unassigned?.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-lg font-semibold">Egasiz loyihalar</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Panel orqali o'zimiz yaratganlar — mijoz hisobiga biriktirilmagan
          </p>
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            {unassigned.map((t) => (
              <TenantRow key={t.id} tenant={t} {...tenantActions} />
            ))}
          </div>
        </div>
      )}

      {trialFor && (
        <TrialDialog
          tenant={trialFor}
          onClose={() => setTrialFor(null)}
          onDone={() => {
            setTrialFor(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'red'
        ? 'text-red-600 dark:text-red-400'
        : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function CustomerCard({ customer: c, canManage, onToggleActive, actions }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {c.avatarUrl ? (
            <img
              src={c.avatarUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User size={18} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.fullName || c.email}</span>
              {!c.isActive && (
                <Badge tone="red">
                  <Ban size={11} /> Bloklangan
                </Badge>
              )}
              {!c.emailVerified && (
                <Badge tone="amber">Email tasdiqlanmagan</Badge>
              )}
              {c.googleLinked && <Badge>Google</Badge>}
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {c.email}
              {c.companyName ? ` · ${c.companyName}` : ''}
              {c.phone ? ` · ${c.phone}` : ''}
            </div>
            <div className="text-xs text-muted-foreground">
              Ro'yxatdan o'tgan: {fmtDate(c.createdAt)} · {c.tenantCount} loyiha
            </div>
          </div>
        </div>

        {canManage && (
          <button
            onClick={onToggleActive}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              c.isActive
                ? 'border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300'
                : 'border-border text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10'
            }`}
          >
            {c.isActive ? 'Bloklash' : 'Blokdan chiqarish'}
          </button>
        )}
      </div>

      {c.tenants.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {c.tenants.map((t) => (
            <TenantRow key={t.id} tenant={t} {...actions} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bitta loyiha qatori: holati, obunasi va amallar.
 *
 * Obuna holati ikki manbadan chiqadi — bazadagi status va HISOBLANGAN
 * qolgan kun. Ikkinchisi kerak, chunki muddat tugaganini kuzatuvchi 15
 * daqiqada bir marta yozadi; panel esa darrov to'g'ri ko'rsatishi kerak.
 */
function TenantRow({ tenant: t, canManage, suspend, resume, onTrial }) {
  const sub = t.subscription;
  const busy =
    (suspend.isPending && suspend.variables?.id === t.id) ||
    (resume.isPending && resume.variables === t.id);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="h-7 w-7 shrink-0 rounded"
          style={{ background: t.brandColor || '#e5e7eb' }}
        />
        <div className="min-w-0">
          <Link
            to={`/tenants/${t.id}`}
            className="truncate font-medium hover:text-brand"
          >
            {t.name}
          </Link>
          <div className="truncate text-xs text-muted-foreground">
            {t.domain}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            STATUS_STYLE[t.status] || 'bg-muted text-muted-foreground'
          }`}
        >
          {STATUS_LABEL[t.status] || t.status}
        </span>

        <SubscriptionBadge sub={sub} />

        {canManage && (
          <>
            <button
              onClick={() => onTrial(t)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-brand hover:text-brand"
            >
              <Gift size={13} /> Sinov berish
            </button>

            {t.status === 'SUSPENDED' ? (
              <button
                onClick={() => resume.mutate(t.id)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={13} />
                ) : (
                  <Play size={13} />
                )}
                Qayta yoqish
              </button>
            ) : (
              t.status === 'ACTIVE' && (
                <button
                  onClick={() => {
                    const reason = prompt(
                      `"${t.name}" to'xtatilsinmi? Server (pm2) o'chadi, ma'lumotlar saqlanadi.\n\nSabab:`,
                      "To'lov kelmadi",
                    );
                    if (reason !== null) suspend.mutate({ id: t.id, reason });
                  }}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                >
                  {busy ? (
                    <Loader2 className="animate-spin" size={13} />
                  ) : (
                    <Pause size={13} />
                  )}
                  To'xtatish
                </button>
              )
            )}
          </>
        )}
      </div>

      {t.status === 'SUSPENDED' && t.suspendReason && (
        <div className="w-full text-xs text-muted-foreground">
          ⏸ {t.suspendReason} · {fmtDate(t.suspendedAt)}
        </div>
      )}

      {sub?.trialGrantedAt && (
        <div className="w-full text-xs text-muted-foreground">
          🎁 {sub.trialDays} kunlik sinov — {sub.trialGrantedBy || 'admin'},{' '}
          {fmtDate(sub.trialGrantedAt)}
          {sub.trialNote ? ` · ${sub.trialNote}` : ''}
        </div>
      )}
    </div>
  );
}

function SubscriptionBadge({ sub }) {
  if (!sub) return <Badge tone="amber">Obuna yo'q</Badge>;

  if (sub.expired) {
    return (
      <Badge tone="red">
        <Clock size={11} /> Muddat tugagan ({fmtDate(sub.currentPeriodEnd)})
      </Badge>
    );
  }

  const left = sub.daysLeft;
  const soon = left !== null && left <= 3;

  if (sub.status === 'TRIALING') {
    return (
      <Badge tone={soon ? 'amber' : 'emerald'}>
        <Gift size={11} /> Sinov · {left} kun qoldi
      </Badge>
    );
  }

  return (
    <Badge tone={soon ? 'amber' : 'default'}>
      <CheckCircle2 size={11} /> {sub.plan?.name || 'Tarif'}
      {left !== null ? ` · ${left} kun` : ' · muddatsiz'}
    </Badge>
  );
}

function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-muted text-muted-foreground',
    emerald:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Sinov berish oynasi. */
function TrialDialog({ tenant, onClose, onDone }) {
  const [days, setDays] = useState(7);
  const [planKey, setPlanKey] = useState('');
  const [note, setNote] = useState('');

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  });

  const grant = useMutation({
    mutationFn: () =>
      api.post(`/subscriptions/tenants/${tenant.id}/trial`, {
        days: Number(days),
        planKey: planKey || undefined,
        note: note || undefined,
      }),
    onSuccess: (r) => {
      const d = r.data;
      toast.success(
        `${d.trialDays} kunlik sinov berildi — ${fmtDate(d.endsAt)} gacha` +
          (d.resumed ? ' (server qayta yoqildi)' : ''),
      );
      onDone();
    },
    onError: (e) => toast.error(errMsg(e, 'Sinov berilmadi')),
  });

  const invalid = !Number.isFinite(Number(days)) || days < 1 || days > TRIAL_MAX;
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + Number(days || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold">Bepul sinov berish</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {tenant.name} · {tenant.domain}
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Muddat</label>
            <div className="flex gap-2">
              {TRIAL_PRESETS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    Number(days) === d
                      ? 'border-brand bg-brand text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {d} kun
                </button>
              ))}
              <input
                type="number"
                min="1"
                max={TRIAL_MAX}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-20 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              1 dan {TRIAL_MAX} kungacha. Sinov bugundan boshlanadi va{' '}
              <b>{fmtDate(endsAt)}</b> da tugaydi — o'shanda server avtomatik
              to'xtaydi.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Qaysi tarif imkoniyatlari bilan
            </label>
            <select
              value={planKey}
              onChange={(e) => setPlanKey(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="">
                Avtomatik (hozirgi tarif yoki eng arzoni)
              </option>
              {plans?.map((p) => (
                <option key={p.id} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Izoh (ixtiyoriy)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan: ko'rgazmadan keyin kelishildi"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          {tenant.subscription?.trialGrantedAt && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Bu loyihaga ilgari ham sinov berilgan (
              {tenant.subscription.trialDays} kun,{' '}
              {fmtDate(tenant.subscription.trialGrantedAt)}). Yangi sinov
              eskisining o'rnini oladi.
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Bekor qilish
          </button>
          <button
            onClick={() => grant.mutate()}
            disabled={grant.isPending || invalid}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
          >
            {grant.isPending && <Loader2 className="animate-spin" size={16} />}
            Sinovni berish
          </button>
        </div>
      </div>
    </div>
  );
}
