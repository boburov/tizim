import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDrive,
  KeyRound,
  Loader2,
  MemoryStick,
  Pencil,
  Plus,
  Power,
  Server,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

/**
 * ══════════════════════════════════════════════════════════════════════
 * SERVERLAR (VPS) — TENANTLAR JOYLASHADIGAN MASHINALAR
 * ══════════════════════════════════════════════════════════════════════
 *
 * Har karta bitta VPS: host, holat, resurslar, unda nechta tenant.
 * "Tekshirish" — SSH ulanib `uname/free/df` va vositalarni (node, pm2,
 * nginx, psql) o'qiydi; natija yozuvga saqlanadi va shu yerda ko'rinadi.
 *
 * ── SIR HECH QACHON KO'RINMAYDI ──
 * API kalitni qaytarmaydi — faqat "kalit bor" bayrog'i va barmoq izi.
 * Tahrirlashda kalit maydoni BO'SH keladi: bo'sh qoldirilsa eskisi
 * saqlanadi, yozilsa almashtiriladi. Bu maydonda hech qachon eski
 * qiymat turmaydi.
 */

const STATUS = {
  UNKNOWN: { label: 'Tekshirilmagan', cls: 'bg-muted text-muted-foreground', Icon: Activity },
  ONLINE: { label: 'Onlayn', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', Icon: Wifi },
  OFFLINE: { label: 'Ulanmadi', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300', Icon: WifiOff },
  ERROR: { label: 'Vosita yetishmaydi', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300', Icon: AlertTriangle },
};

const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30';

const emptyForm = {
  name: '',
  host: '',
  sshPort: 22,
  sshUser: 'root',
  authMethod: 'SSH_KEY',
  sshPrivateKey: '',
  sshPassword: '',
  rootDir: '/root',
  isLocal: false,
  maxTenants: '',
  notes: '',
  // ⚠ Ichida parol bor — hech qachon oldindan to'ldirilmaydi.
  postgresBaseUrl: '',
};

const fmtGb = (n) => (Number.isFinite(n) && n > 0 ? `${n} GB` : '—');
const fmtMb = (n) => (Number.isFinite(n) && n > 0 ? (n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${n} MB`) : '—');

export function VpsStatusBadge({ status, className }) {
  const s = STATUS[status] || STATUS.UNKNOWN;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', s.cls, className)}>
      <s.Icon size={12} /> {s.label}
    </span>
  );
}

export default function VpsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [editing, setEditing] = useState(null); // null | 'new' | vps
  const [form, setForm] = useState(emptyForm);
  const [testingId, setTestingId] = useState(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ['vps'],
    queryFn: () => api.get('/vps').then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['vps'] });
    qc.invalidateQueries({ queryKey: ['tenants'] });
  };

  const save = useMutation({
    mutationFn: (body) => {
      const payload = {
        ...body,
        sshPort: Number(body.sshPort) || 22,
        maxTenants: body.maxTenants === '' ? undefined : Number(body.maxTenants),
        // Bo'sh sir YUBORILMAYDI — "tegma" degani.
        sshPrivateKey: body.sshPrivateKey?.trim() || undefined,
        sshPassword: body.sshPassword || undefined,
        postgresBaseUrl: body.postgresBaseUrl?.trim() || undefined,
        notes: body.notes?.trim() || undefined,
      };
      if (editing === 'new') return api.post('/vps', payload);
      return api.patch(`/vps/${editing.id}`, payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success(editing === 'new' ? 'VPS qo\'shildi' : 'VPS yangilandi');
      closeForm();
    },
    onError: (e) => {
      const msg = e.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Xato');
    },
  });

  const test = useMutation({
    mutationFn: (id) => api.post(`/vps/${id}/test`).then((r) => r.data),
    onMutate: (id) => setTestingId(id),
    onSettled: () => setTestingId(null),
    onSuccess: (v) => {
      invalidate();
      if (v.status === 'ONLINE') toast.success(`${v.name}: ulanish muvaffaqiyatli`);
      else toast.error(`${v.name}: ${v.lastCheckError || STATUS[v.status]?.label}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Test bajarilmadi'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/vps/${id}`, { isActive }),
    onSuccess: (_, v) => {
      invalidate();
      toast.success(v.isActive ? 'VPS faollashtirildi' : 'VPS deaktivatsiya qilindi');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Xato'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/vps/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("VPS o'chirildi");
    },
    onError: (e) => toast.error(e.response?.data?.message || "O'chirib bo'lmadi"),
  });

  const openNew = () => {
    setForm(emptyForm);
    setEditing('new');
  };
  const openEdit = (v) => {
    setForm({
      name: v.name,
      host: v.host,
      sshPort: v.sshPort,
      sshUser: v.sshUser,
      authMethod: v.authMethod,
      sshPrivateKey: '', // hech qachon oldindan to'ldirilmaydi
      sshPassword: '',
      rootDir: v.rootDir,
      isLocal: v.isLocal,
      maxTenants: v.maxTenants ?? '',
      notes: v.notes || '',
      postgresBaseUrl: '', // sir — oldindan to'ldirilmaydi
    });
    setEditing(v);
  };
  const closeForm = () => {
    setEditing(null);
    setForm(emptyForm);
  };
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Serverlar (VPS)</h1>
          <p className="text-sm text-muted-foreground">
            Loyihalar joylashadigan mashinalar. Ulanish SSH orqali, kalit shifrlangan holda saqlanadi.
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark"
          >
            <Plus size={18} /> VPS qo'shish
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !list?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali VPS yo'q. Birinchisini qo'shing — loyihalar unga joylashadi.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => {
            const r = v.resources || {};
            const tools = r.tools || {};
            const missing = Object.entries(tools).filter(([, ver]) => ver === 'missing').map(([k]) => k);
            const full = v.maxTenants != null && v.tenantCount >= v.maxTenants;
            return (
              <div
                key={v.id}
                className={cn('rounded-xl border bg-card p-5', v.isActive ? 'border-border' : 'border-border opacity-60')}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                      <Server size={16} className="shrink-0 text-brand" />
                      <span className="truncate">{v.name}</span>
                      {v.isLocal && (
                        <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">lokal</span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {v.sshUser}@{v.host}:{v.sshPort}
                    </div>
                  </div>
                  <VpsStatusBadge status={v.status} />
                </div>

                {/* Resurslar — oxirgi testdan. Bo'lmasa "—", 0 emas. */}
                <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/60 p-2">
                    <div className="flex items-center gap-1 text-muted-foreground"><Cpu size={12} /> CPU</div>
                    <div className="mt-0.5 font-medium">{r.cpu ? `${r.cpu} yadro` : '—'}</div>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <div className="flex items-center gap-1 text-muted-foreground"><MemoryStick size={12} /> RAM</div>
                    <div className="mt-0.5 font-medium">
                      {r.memTotalMb ? `${fmtMb(r.memFreeMb)} / ${fmtMb(r.memTotalMb)}` : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <div className="flex items-center gap-1 text-muted-foreground"><HardDrive size={12} /> Disk</div>
                    <div className="mt-0.5 font-medium">
                      {r.diskTotalGb ? `${fmtGb(r.diskFreeGb)} / ${fmtGb(r.diskTotalGb)}` : '—'}
                    </div>
                  </div>
                </div>

                {v.lastCheckError && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span className="break-words">{v.lastCheckError}</span>
                  </div>
                )}

                {r.tools && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {Object.entries(tools).map(([k, ver]) => (
                      <span
                        key={k}
                        title={ver}
                        className={cn(
                          'rounded px-1.5 py-0.5 font-mono text-[10px]',
                          ver === 'missing'
                            ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {k} {ver === 'missing' ? '✗' : '✓'}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                  <Link to={`/vps/${v.id}`} className="text-muted-foreground hover:text-brand">
                    {v.tenantCount ?? 0} ta loyiha
                    {v.maxTenants != null && ` / ${v.maxTenants}`}
                    {full && <span className="ml-1 text-amber-700 dark:text-amber-300">(to'lgan)</span>}
                  </Link>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => test.mutate(v.id)}
                      disabled={testingId === v.id}
                      title="Ulanishni tekshirish"
                      className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-brand disabled:opacity-50"
                    >
                      {testingId === v.id ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />}
                    </button>
                    {isSuperAdmin && (
                      <>
                        <button
                          onClick={() => openEdit(v)}
                          title="Tahrirlash"
                          className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-brand"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => toggleActive.mutate({ id: v.id, isActive: !v.isActive })}
                          title={v.isActive ? 'Deaktivatsiya (yangi loyiha tayinlanmaydi)' : 'Faollashtirish'}
                          className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-brand"
                        >
                          <Power size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if ((v.tenantCount ?? 0) > 0) {
                              return toast.error("Loyihalari bor VPS o'chirilmaydi — avval ko'chiring yoki deaktivatsiya qiling");
                            }
                            if (confirm(`"${v.name}" VPS yozuvi o'chirilsinmi? Serverdagi hech narsa o'zgarmaydi.`))
                              remove.mutate(v.id);
                          }}
                          title="O'chirish (faqat bo'sh VPS)"
                          className="rounded p-1 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- Yaratish/tahrirlash modali --- */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">{editing === 'new' ? 'Yangi VPS' : `Tahrirlash: ${form.name}`}</h3>
              <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.name.trim() || !form.host.trim()) return toast.error('Nom va host shart');
                save.mutate(form);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Nom</label>
                  <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Hetzner-1" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Host (IP yoki domen)</label>
                  <input className={cn(inputCls, 'font-mono')} value={form.host} onChange={set('host')} placeholder="65.108.1.2" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">SSH port</label>
                  <input className={inputCls} type="number" value={form.sshPort} onChange={set('sshPort')} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">SSH foydalanuvchi</label>
                  <input className={cn(inputCls, 'font-mono')} value={form.sshUser} onChange={set('sshUser')} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Deploy ildizi</label>
                  <input className={cn(inputCls, 'font-mono')} value={form.rootDir} onChange={set('rootDir')} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Sig'im (ixtiyoriy)</label>
                  <input className={inputCls} type="number" min="1" value={form.maxTenants} onChange={set('maxTenants')} placeholder="cheksiz" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isLocal} onChange={set('isLocal')} />
                Lokal server (admin panel shu mashinada — SSH kerak emas)
              </label>

              {!form.isLocal && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Autentifikatsiya</label>
                    <select className={inputCls} value={form.authMethod} onChange={set('authMethod')}>
                      <option value="SSH_KEY">SSH kalit (tavsiya)</option>
                      <option value="PASSWORD">Parol</option>
                    </select>
                  </div>
                  {form.authMethod === 'SSH_KEY' ? (
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-sm font-medium">
                        <KeyRound size={14} /> Xususiy kalit (PEM / OpenSSH)
                      </label>
                      <textarea
                        className={cn(inputCls, 'h-28 font-mono text-xs')}
                        value={form.sshPrivateKey}
                        onChange={set('sshPrivateKey')}
                        placeholder={
                          editing !== 'new' && editing?.hasKey
                            ? `Saqlangan kalit: ${editing.sshKeyFingerprint || 'bor'} — bo'sh qoldirsangiz o'zgarmaydi`
                            : '-----BEGIN OPENSSH PRIVATE KEY-----'
                        }
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Kalit shifrlanib saqlanadi va hech qachon qaytarilmaydi.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-sm font-medium">SSH parol</label>
                      <input
                        className={inputCls}
                        type="password"
                        value={form.sshPassword}
                        onChange={set('sshPassword')}
                        placeholder={editing !== 'new' && editing?.hasPassword ? "Saqlangan — bo'sh qoldirsangiz o'zgarmaydi" : ''}
                      />
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">Postgres URL (ixtiyoriy)</label>
                <input
                  className={cn(inputCls, 'font-mono text-xs')}
                  type="password"
                  value={form.postgresBaseUrl}
                  onChange={set('postgresBaseUrl')}
                  placeholder={
                    editing !== 'new' && editing?.hasPostgresUrl
                      ? `Saqlangan: ${editing.postgresHost || 'bor'} — bo'sh qoldirsangiz o'zgarmaydi`
                      : 'postgresql://postgres:parol@127.0.0.1:5432'
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Baza nomisiz. Ichida parol bor — shifrlanadi va qaytarilmaydi.
                  Bo'sh qoldirilsa standart ishlatiladi.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Izoh</label>
                <textarea className={cn(inputCls, 'h-16')} value={form.notes} onChange={set('notes')} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
                  Bekor
                </button>
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
                >
                  {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
