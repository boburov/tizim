import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ApiKeyDialog from '../components/ApiKeyDialog';
import ApiUsageChart from '../components/ApiUsageChart';

const STATUS_LABEL = {
  ACTIVE: 'Faol',
  SUSPENDED: "To'xtatilgan",
  EXPIRED: "Muddati o'tgan",
  CANCELED: 'Bekor qilingan',
};

const STATUS_STYLE = {
  ACTIVE:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  SUSPENDED: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  EXPIRED: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  CANCELED: 'bg-muted text-muted-foreground',
};

const num = (v) => Number(v ?? 0).toLocaleString('uz-UZ');

/** "12 kun qoldi" / "3 kun oldin tugagan" / "muddatsiz". */
function expiryLabel(expiresAt) {
  if (!expiresAt) return { text: 'Muddatsiz', tone: 'muted' };
  const days = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
  if (days < 0) return { text: `${-days} kun oldin tugagan`, tone: 'bad' };
  if (days === 0) return { text: 'Bugun tugaydi', tone: 'bad' };
  if (days <= 7) return { text: `${days} kun qoldi`, tone: 'warn' };
  return { text: `${days} kun qoldi`, tone: 'muted' };
}

const TONE = {
  bad: 'text-red-600 dark:text-red-300',
  warn: 'text-amber-600 dark:text-amber-300',
  muted: 'text-muted-foreground',
};

export default function ApiServiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [newKey, setNewKey] = useState(null); // ochiq matndagi kalit (bir marta)
  const [expanded, setExpanded] = useState(null); // ochilgan obuna id
  const [editingTier, setEditingTier] = useState(null);
  const [newSub, setNewSub] = useState(false);

  const { data: service, isLoading } = useQuery({
    queryKey: ['api-service', id],
    queryFn: () => api.get(`/api-services/${id}`).then((r) => r.data),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['api-service', id] });
    qc.invalidateQueries({ queryKey: ['api-services'] });
  };

  const fail = (e) => {
    const msg = e.response?.data?.message;
    toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Xato');
  };

  const changeTier = useMutation({
    mutationFn: ({ sid, tierId }) =>
      api.patch(`/api-services/subscriptions/${sid}/tier`, { tierId }),
    onSuccess: () => {
      refresh();
      toast.success('Tarif almashtirildi — ~1 daqiqada kuchga kiradi');
    },
    onError: fail,
  });

  const extend = useMutation({
    mutationFn: ({ sid, months }) =>
      api.patch(`/api-services/subscriptions/${sid}/extend`, { months }),
    onSuccess: (r) => {
      refresh();
      const until = new Date(r.data.expiresAt).toLocaleDateString('uz-UZ');
      toast.success(`Uzaytirildi — ${until} gacha`);
    },
    onError: fail,
  });

  const changeStatus = useMutation({
    mutationFn: ({ sid, status }) =>
      api.patch(`/api-services/subscriptions/${sid}/status`, { status }),
    onSuccess: (r) => {
      refresh();
      toast.success(
        r.data.status === 'ACTIVE'
          ? 'Obuna tiklandi'
          : "Obuna to'xtatildi — ~1 daqiqada kuchga kiradi",
      );
    },
    onError: fail,
  });

  const createKey = useMutation({
    mutationFn: (sid) => api.post(`/api-services/subscriptions/${sid}/keys`, {}),
    onSuccess: (r) => {
      refresh();
      setNewKey(r.data.apiKey);
    },
    onError: fail,
  });

  const revokeKey = useMutation({
    mutationFn: (keyId) => api.delete(`/api-services/keys/${keyId}`),
    onSuccess: () => {
      refresh();
      toast.success('Kalit bekor qilindi — ~1 daqiqada kuchga kiradi');
    },
    onError: fail,
  });

  const saveTier = useMutation({
    mutationFn: (t) =>
      api.patch(`/api-services/tiers/${t.id}`, {
        name: t.name,
        price: Number(t.price),
        concurrency: Number(t.concurrency),
        rateLimitRpm: Number(t.rateLimitRpm),
        priority: Number(t.priority),
        monthlyQuota: Number(t.monthlyQuota),
      }),
    onSuccess: () => {
      refresh();
      setEditingTier(null);
      toast.success('Tarif yangilandi — ~1 daqiqada kuchga kiradi');
    },
    onError: fail,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
      </div>
    );
  }
  if (!service) return <div>Xizmat topilmadi</div>;

  return (
    <div>
      <Link
        to="/api-services"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand"
      >
        <ArrowLeft size={15} /> API xizmatlar
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{service.name}</h1>
          <div className="font-mono text-sm text-muted-foreground">
            {service.key}
            {service.baseUrl ? ` · ${service.baseUrl}` : ''}
          </div>
        </div>
        <button
          onClick={() => setNewSub(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark"
        >
          <Plus size={18} /> Yangi obuna
        </button>
      </div>

      {/* ---------- Tariflar ---------- */}
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Tariflar
      </h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {service.tiers.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border bg-card p-5 ${
              t.isActive ? 'border-border' : 'border-border opacity-60'
            }`}
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {t.key}
                </div>
              </div>
              {isSuperAdmin && (
                <button
                  onClick={() => setEditingTier({ ...t })}
                  className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-brand"
                  title="Tahrirlash"
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>

            <div className="mb-3">
              <span className="text-2xl font-semibold">
                ${Number(t.price)}
              </span>
              <span className="text-sm text-muted-foreground"> / oyiga</span>
            </div>

            <ul className="space-y-1.5 border-t border-border pt-3 text-sm">
              <Row label="Parallel slot" value={t.concurrency} />
              <Row label="Tezlik" value={`${t.rateLimitRpm} req/min`} />
              <Row
                label="Navbat ustuvorligi"
                value={t.priority === 1 ? '1 (eng oldin)' : t.priority}
              />
              <Row
                label="Oylik kvota"
                value={t.monthlyQuota === -1 ? 'Cheksiz' : num(t.monthlyQuota)}
              />
            </ul>
          </div>
        ))}
      </div>

      {/* ---------- Obunalar ---------- */}
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Obunalar
      </h2>
      {!service.subscriptions.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali obuna yo'q.
        </div>
      ) : (
        <div className="space-y-3">
          {service.subscriptions.map((sub) => {
            const exp = expiryLabel(sub.expiresAt);
            const open = expanded === sub.id;
            const activeKeys = sub.keys.filter((k) => !k.revokedAt);
            const busy =
              changeTier.isPending ||
              extend.isPending ||
              changeStatus.isPending;

            return (
              <div
                key={sub.id}
                className="rounded-xl border border-border bg-card"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                  <button
                    onClick={() => setExpanded(open ? null : sub.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {open ? (
                      <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {sub.consumer.label}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {activeKeys.length} faol kalit ·{' '}
                        {num(sub.usage30d.ok)} so'rov / 30 kun
                        {sub.usage30d.avgMs != null &&
                          ` · ${sub.usage30d.avgMs} ms`}
                      </div>
                    </div>
                  </button>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[sub.effectiveStatus]
                    }`}
                  >
                    {STATUS_LABEL[sub.effectiveStatus]}
                  </span>

                  <span className={`text-xs ${TONE[exp.tone]}`}>{exp.text}</span>

                  {/* Tarifni almashtirish */}
                  <select
                    value={sub.tierId}
                    disabled={busy}
                    onChange={(e) =>
                      changeTier.mutate({ sid: sub.id, tierId: e.target.value })
                    }
                    className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                    title="Tarifni almashtirish"
                  >
                    {service.tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — ${Number(t.price)}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1">
                    <ExtendMenu
                      disabled={busy}
                      onPick={(months) => extend.mutate({ sid: sub.id, months })}
                    />

                    {sub.status === 'SUSPENDED' ? (
                      <IconBtn
                        title="Tiklash"
                        disabled={busy}
                        onClick={() =>
                          changeStatus.mutate({ sid: sub.id, status: 'ACTIVE' })
                        }
                      >
                        <Play size={15} />
                      </IconBtn>
                    ) : (
                      <IconBtn
                        title="To'xtatish"
                        disabled={busy}
                        onClick={() =>
                          changeStatus.mutate({
                            sid: sub.id,
                            status: 'SUSPENDED',
                          })
                        }
                      >
                        <Pause size={15} />
                      </IconBtn>
                    )}

                    <IconBtn
                      title="Yangi kalit"
                      disabled={createKey.isPending}
                      onClick={() => createKey.mutate(sub.id)}
                    >
                      <KeyRound size={15} />
                    </IconBtn>
                  </div>
                </div>

                {open && (
                  <div className="space-y-4 border-t border-border p-4">
                    <ApiUsageChart subscriptionId={sub.id} />

                    <div>
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        Kalitlar
                      </div>
                      <div className="space-y-1.5">
                        {sub.keys.map((k) => (
                          <div
                            key={k.id}
                            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm ${
                              k.revokedAt ? 'opacity-50' : ''
                            }`}
                          >
                            <code className="font-mono">{k.masked}</code>
                            {k.label && (
                              <span className="text-xs text-muted-foreground">
                                {k.label}
                              </span>
                            )}
                            <span className="flex-1" />
                            <span className="text-xs text-muted-foreground">
                              {k.revokedAt
                                ? 'bekor qilingan'
                                : k.lastUsedAt
                                  ? `oxirgi: ${new Date(k.lastUsedAt).toLocaleString('uz-UZ')}`
                                  : 'hali ishlatilmagan'}
                            </span>
                            {!k.revokedAt && (
                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `${k.masked} kaliti bekor qilinsinmi? Bu qaytarib bo'lmaydi.`,
                                    )
                                  )
                                    revokeKey.mutate(k.id);
                                }}
                                className="rounded p-1 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                                title="Bekor qilish"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {newKey && <ApiKeyDialog apiKey={newKey} onClose={() => setNewKey(null)} />}

      {editingTier && (
        <TierModal
          tier={editingTier}
          onChange={setEditingTier}
          onSave={() => saveTier.mutate(editingTier)}
          saving={saveTier.isPending}
          onClose={() => setEditingTier(null)}
        />
      )}

      {newSub && (
        <NewSubscriptionModal
          service={service}
          onClose={() => setNewSub(false)}
          onCreated={(key) => {
            setNewSub(false);
            refresh();
            setNewKey(key);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </li>
  );
}

function IconBtn({ children, title, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-muted hover:text-brand disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** "+1 / +3 / +12 oy" — bosilganda ochiladi, tanlangach yopiladi. */
function ExtendMenu({ onPick, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconBtn
        title="Uzaytirish"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarPlus size={15} />
      </IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {[1, 3, 12].map((m) => (
              <button
                key={m}
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm transition hover:bg-muted"
              >
                +{m} oy
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TierModal({ tier, onChange, onSave, onClose, saving }) {
  const set = (k) => (e) => onChange({ ...tier, [k]: e.target.value });

  return (
    <Modal title={`Tarif: ${tier.name}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nom">
          <input
            value={tier.name}
            onChange={set('name')}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Narx ($ / oyiga)">
            <input
              type="number"
              min="0"
              value={tier.price}
              onChange={set('price')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Parallel slot">
            <input
              type="number"
              min="1"
              max="64"
              value={tier.concurrency}
              onChange={set('concurrency')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Tezlik (req/min)">
            <input
              type="number"
              min="1"
              value={tier.rateLimitRpm}
              onChange={set('rateLimitRpm')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Ustuvorlik (1 = oldin)">
            <input
              type="number"
              min="1"
              max="9"
              value={tier.priority}
              onChange={set('priority')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <Field label="Oylik kvota (-1 = cheksiz)">
          <input
            type="number"
            min="-1"
            value={tier.monthlyQuota}
            onChange={set('monthlyQuota')}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>

        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Slot va ustuvorlik xizmatning o'zida majburlanadi. Bitta so'rov
          tezligi o'zgarmaydi — yuqori tarif bir vaqtda ko'proq so'rov
          o'tkazadi va navbatda oldinda turadi.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Bekor
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NewSubscriptionModal({ service, onClose, onCreated }) {
  const qc = useQueryClient();
  const [consumerId, setConsumerId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [tierId, setTierId] = useState(service.tiers[0]?.id ?? '');
  const [months, setMonths] = useState(1);

  const { data: consumers } = useQuery({
    queryKey: ['api-consumers'],
    queryFn: () => api.get('/api-services/consumers').then((r) => r.data),
  });

  // Shu xizmatga allaqachon obuna bo'lganlar ro'yxatdan chiqariladi —
  // baza baribir rad etardi, lekin xatoni oldindan ko'rsatgan yaxshi.
  const taken = new Set(service.subscriptions.map((s) => s.consumerId));
  const available = (consumers ?? []).filter((c) => !taken.has(c.id));

  const create = useMutation({
    mutationFn: async () => {
      let id = consumerId;
      if (id === '__new__') {
        const created = await api.post('/api-services/consumers', {
          label: newLabel.trim(),
        });
        id = created.data.id;
        qc.invalidateQueries({ queryKey: ['api-consumers'] });
      }
      return api.post(`/api-services/${service.id}/subscriptions`, {
        consumerId: id,
        tierId,
        months: Number(months),
      });
    },
    onSuccess: (r) => {
      toast.success('Obuna yaratildi');
      onCreated(r.data.apiKey);
    },
    onError: (e) => {
      const msg = e.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Xato');
    },
  });

  const valid =
    tierId &&
    (consumerId === '__new__' ? newLabel.trim().length >= 2 : Boolean(consumerId));

  return (
    <Modal title="Yangi obuna" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Mijoz">
          <select
            value={consumerId}
            onChange={(e) => setConsumerId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— tanlang —</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.email ? ` (${c.email})` : ''}
              </option>
            ))}
            <option value="__new__">+ Yangi mijoz</option>
          </select>
        </Field>

        {consumerId === '__new__' && (
          <Field label="Yangi mijoz nomi">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Masalan: Bilim markazi"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
        )}

        <Field label="Tarif">
          <select
            value={tierId}
            onChange={(e) => setTierId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {service.tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — ${Number(t.price)}/oy · {t.concurrency} slot ·{' '}
                {t.rateLimitRpm} rpm
              </option>
            ))}
          </select>
        </Field>

        <Field label="Muddat">
          <select
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value={1}>1 oy</option>
            <option value={3}>3 oy</option>
            <option value={6}>6 oy</option>
            <option value={12}>12 oy</option>
            <option value={0}>Muddatsiz</option>
          </select>
        </Field>

        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Obuna bilan birga birinchi API kalit yaratiladi va bir marta
          ko'rsatiladi.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => create.mutate()}
            disabled={!valid || create.isPending}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
          >
            {create.isPending ? 'Yaratilmoqda…' : 'Yaratish'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Bekor
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
