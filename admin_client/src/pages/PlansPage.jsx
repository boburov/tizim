import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Check,
  Infinity as InfinityIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const INTERVAL_LABEL = {
  MONTHLY: 'oyiga',
  YEARLY: 'yiliga',
  LIFETIME: 'bir martalik',
};

const money = (v, currency = 'UZS') =>
  `${Number(v).toLocaleString('uz-UZ')} ${currency}`;

const emptyForm = {
  key: '',
  name: '',
  description: '',
  price: 0,
  interval: 'MONTHLY',
  trialDays: 0,
  sortOrder: 0,
  isPublic: true,
  features: {},
};

export default function PlansPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [editing, setEditing] = useState(null); // null | 'new' | plan object
  const [form, setForm] = useState(emptyForm);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  });

  const { data: features } = useQuery({
    queryKey: ['features'],
    queryFn: () => api.get('/plans/features').then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: (body) => {
      const payload = {
        ...body,
        price: Number(body.price),
        trialDays: Number(body.trialDays || 0),
        sortOrder: Number(body.sortOrder || 0),
        features: Object.entries(body.features)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([featureKey, value]) => ({
            featureKey,
            value: Number(value),
          })),
      };
      // Yangilashda key o'zgarmaydi
      if (editing === 'new') return api.post('/plans', payload);
      const { key, ...rest } = payload;
      return api.patch(`/plans/${editing.id}`, rest);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success(editing === 'new' ? 'Tarif yaratildi' : 'Tarif yangilandi');
      closeForm();
    },
    onError: (e) => {
      const msg = e.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Xato');
    },
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success("Tarif o'chirildi");
    },
    onError: (e) =>
      toast.error(e.response?.data?.message || "O'chirib bo'lmadi"),
  });

  const openNew = () => {
    setForm(emptyForm);
    setEditing('new');
  };

  const openEdit = (plan) => {
    const featureMap = {};
    for (const pf of plan.features) featureMap[pf.feature.key] = pf.value;
    setForm({
      key: plan.key,
      name: plan.name,
      description: plan.description || '',
      price: plan.price,
      interval: plan.interval,
      trialDays: plan.trialDays,
      sortOrder: plan.sortOrder,
      isPublic: plan.isPublic,
      features: featureMap,
    });
    setEditing(plan);
  };

  const closeForm = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const setFeature = (key, value) =>
    setForm((f) => ({ ...f, features: { ...f.features, [key]: value } }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tariflar</h1>
          <p className="text-sm text-muted-foreground">
            Narx va limitlarni belgilang — mijozlar shulardan tanlaydi
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark"
          >
            <Plus size={18} /> Yangi tarif
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !plans?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali tarif yo'q.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border bg-card p-5 ${
                p.isActive ? 'border-border' : 'border-border opacity-60'
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.key}</div>
                </div>
                {isSuperAdmin && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-brand"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`"${p.name}" tarifi o'chirilsinmi?`))
                          remove.mutate(p.id);
                      }}
                      className="rounded p-1 text-muted-foreground transition hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              <div className="mb-3">
                <span className="text-xl font-semibold">
                  {Number(p.price) === 0 ? 'Bepul' : money(p.price, p.currency)}
                </span>
                {Number(p.price) > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {' '}
                    / {INTERVAL_LABEL[p.interval]}
                  </span>
                )}
              </div>

              {p.description && (
                <p className="mb-3 text-sm text-muted-foreground">{p.description}</p>
              )}

              <ul className="space-y-1.5 border-t border-border pt-3 text-sm">
                {p.features.map((pf) => (
                  <li key={pf.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{pf.feature.name}</span>
                    <span className="font-medium text-foreground">
                      {pf.feature.type === 'BOOLEAN' ? (
                        pf.value > 0 ? (
                          <Check size={15} className="text-emerald-600 dark:text-emerald-300" />
                        ) : (
                          <X size={15} className="text-muted-foreground" />
                        )
                      ) : pf.value === -1 ? (
                        <InfinityIcon size={15} />
                      ) : (
                        `${pf.value}${pf.feature.unit ? ' ' + pf.feature.unit : ''}`
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {p.trialDays > 0 && (
                <div className="mt-3 rounded bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-center text-xs text-emerald-700 dark:text-emerald-300">
                  {p.trialDays} kun bepul sinov
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* --- Yaratish/tahrirlash modali --- */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing === 'new' ? 'Yangi tarif' : `Tahrirlash: ${form.name}`}
              </h3>
              <button
                onClick={closeForm}
                className="text-muted-foreground hover:text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              {editing === 'new' && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Key (o'zgarmas identifikator)
                  </label>
                  <input
                    value={form.key}
                    onChange={(e) =>
                      setForm({ ...form, key: e.target.value.toLowerCase() })
                    }
                    placeholder="masalan: standart"
                    className="w-full rounded-lg border border-border px-3 py-2 font-mono text-sm outline-none focus:border-brand"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">Nomi</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Standart"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Tavsif</label>
                <input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Narx (UZS)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Davri</label>
                  <select
                    value={form.interval}
                    onChange={(e) =>
                      setForm({ ...form, interval: e.target.value })
                    }
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                  >
                    <option value="MONTHLY">Oylik</option>
                    <option value="YEARLY">Yillik</option>
                    <option value="LIFETIME">Bir martalik</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Sinov (kun)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.trialDays}
                    onChange={(e) =>
                      setForm({ ...form, trialDays: e.target.value })
                    }
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Tartib raqami
                  </label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm({ ...form, sortOrder: e.target.value })
                    }
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) =>
                    setForm({ ...form, isPublic: e.target.checked })
                  }
                />
                Client panelda ko'rinsin
              </label>

              {/* Limitlar */}
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-sm font-medium">Limitlar</div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Cheksiz uchun <span className="font-mono">-1</span> yozing.
                  Yoqish/o'chirish uchun 1 yoki 0.
                </p>
                <div className="space-y-2">
                  {features?.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <label className="text-sm text-muted-foreground">
                        {f.name}
                        {f.unit && (
                          <span className="text-muted-foreground"> ({f.unit})</span>
                        )}
                      </label>
                      {f.type === 'BOOLEAN' ? (
                        <select
                          value={form.features[f.key] ?? 0}
                          onChange={(e) => setFeature(f.key, e.target.value)}
                          className="w-32 rounded border border-border px-2 py-1 text-sm"
                        >
                          <option value={1}>Yoqilgan</option>
                          <option value={0}>O'chirilgan</option>
                        </select>
                      ) : (
                        <input
                          type="number"
                          min="-1"
                          value={form.features[f.key] ?? ''}
                          onChange={(e) => setFeature(f.key, e.target.value)}
                          placeholder="—"
                          className="w-32 rounded border border-border px-2 py-1 text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeForm}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Bekor qilish
              </button>
              <button
                onClick={() => save.mutate(form)}
                disabled={save.isPending || !form.name}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="animate-spin" size={16} />}
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
