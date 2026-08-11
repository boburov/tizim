import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  ExternalLink,
  Gauge,
  Loader2,
  Plus,
  Radio,
  Server,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const num = (v) => Number(v ?? 0).toLocaleString('uz-UZ');

/**
 * "Hisob tirikmi?" — oxirgi so'rov qachon kelganini odam tilida aytadi.
 *
 * Bu shunchaki chiroyli sana emas: xizmat usage yuborishni to'xtatsa
 * (integratsiya buzilgan, tarmoq yopiq) raqamlar qotib qoladi va buni
 * faqat shu ko'rsatkich fosh qiladi.
 */
function liveness(lastRequestAt) {
  if (!lastRequestAt) {
    return { text: "hali so'rov yo'q", tone: 'muted', live: false };
  }
  const min = Math.floor((Date.now() - new Date(lastRequestAt)) / 60000);
  if (min < 5) return { text: 'hozir ishlayapti', tone: 'live', live: true };
  if (min < 60) return { text: `${min} daqiqa oldin`, tone: 'ok', live: false };
  const h = Math.floor(min / 60);
  if (h < 24) return { text: `${h} soat oldin`, tone: 'ok', live: false };
  return { text: `${Math.floor(h / 24)} kun oldin`, tone: 'muted', live: false };
}

const LIVE_TONE = {
  live: 'text-emerald-600 dark:text-emerald-400',
  ok: 'text-muted-foreground',
  muted: 'text-muted-foreground',
};

/**
 * Sotiladigan API xizmatlar ro'yxati.
 *
 * Bu Tariflar sahifasidan ALOHIDA: u yerda o'quv markazlarga (tenant)
 * sotiladigan tizim tariflari, bu yerda esa kalit bilan ishlaydigan
 * API mahsulotlari — limitlari ham boshqacha (so'rov tezligi, parallel slot).
 */
export default function ApiServicesPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['api-services'],
    queryFn: () => api.get('/api-services').then((r) => r.data),
    refetchInterval: 60000,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">API xizmatlar</h1>
          <p className="text-sm text-muted-foreground">
            Kalit bilan sotiladigan xizmatlar — tarif, muddat va so'rovlar hisobi
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark"
          >
            <Plus size={18} /> Yangi xizmat
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> Yuklanmoqda…
        </div>
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Hali xizmat yo'q.
          <div className="mt-1 text-xs">
            {isSuperAdmin
              ? '"Yangi xizmat" tugmasi bilan qo\'shing — yoki serverda '
              : 'Serverda '}
            <code className="font-mono">npm run seed:api</code>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((s) => {
            const live = liveness(s.lastRequestAt);
            return (
              <Link
                key={s.id}
                to={`/api-services/${s.id}`}
                className="rounded-xl border border-border bg-card p-5 transition hover:border-brand"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                      <Server size={17} className="shrink-0 text-brand" />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {s.key}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      s.isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {s.isActive ? 'Faol' : "O'chiq"}
                  </span>
                </div>

                {s.description && (
                  <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                    {s.description}
                  </p>
                )}

                <div className="mb-3 flex flex-wrap gap-2">
                  {s.tiers.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-lg border border-border px-2 py-1 text-xs"
                    >
                      <b>${Number(t.price)}</b>
                      <span className="text-muted-foreground">
                        {' · '}
                        {t.concurrency} slot · {t.rateLimitRpm} rpm
                      </span>
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users size={13} /> {s.activeSubscriptions} faol /{' '}
                    {s.subscriptionCount} obuna
                  </span>
                  <span className="flex items-center gap-1">
                    <Activity size={13} /> {num(s.usage30d.ok)} so'rov / 30 kun
                  </span>
                  <span className="flex items-center gap-1">
                    Bugun: <b className="text-foreground">{num(s.usageToday?.ok)}</b>
                  </span>
                  {s.usage30d.rejected > 0 && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-300">
                      <Gauge size={13} /> {num(s.usage30d.rejected)} rad etilgan
                    </span>
                  )}
                </div>

                <div
                  className={`mt-2 flex items-center gap-1.5 text-xs ${LIVE_TONE[live.tone]}`}
                >
                  <Radio size={12} className={live.live ? 'animate-pulse' : ''} />
                  Oxirgi so'rov: {live.text}
                </div>

                {s.baseUrl && (
                  <div className="mt-2 flex items-center gap-1 truncate font-mono text-xs text-muted-foreground">
                    <ExternalLink size={12} className="shrink-0" /> {s.baseUrl}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {creating && <NewServiceModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/**
 * Yangi xizmat qo'shish.
 *
 * Xizmat yozuvi paneldan yaratilishi MUHIM: aks holda serverdagi bazaga
 * yangi xizmat qo'shish uchun har safar SSH bilan kirib seed skriptini
 * ishga tushirish kerak bo'lardi. Tariflar xizmat ochilgandan keyin
 * uning sahifasida qo'shiladi.
 */
function NewServiceModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    key: '',
    name: '',
    description: '',
    baseUrl: '',
    docsUrl: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: () =>
      api.post('/api-services', {
        key: form.key.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        baseUrl: form.baseUrl.trim() || undefined,
        docsUrl: form.docsUrl.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-services'] });
      toast.success("Xizmat yaratildi — endi unga tarif qo'shing");
      onClose();
    },
    onError: (e) => {
      const m = e.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Xato');
    },
  });

  // Backenddagi KEY_RE bilan bir xil qoida — xatoni serverga bormasdan aytamiz
  const keyOk = /^[a-z][a-z0-9-]{1,48}$/.test(form.key.trim());
  const valid = keyOk && form.name.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Yangi API xizmat</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Key (o'zgarmas identifikator)
            </label>
            <input
              value={form.key}
              onChange={(e) =>
                setForm((f) => ({ ...f, key: e.target.value.toLowerCase() }))
              }
              placeholder="edu-pronauns"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand"
            />
            {form.key && !keyOk && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Kichik harf, raqam va "-" — kamida 2 belgi.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Nomi</label>
            <input
              value={form.name}
              onChange={set('name')}
              placeholder="Talaffuz baholash"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Tavsif</label>
            <input
              value={form.description}
              onChange={set('description')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Xizmat manzili
              </label>
              <input
                value={form.baseUrl}
                onChange={set('baseUrl')}
                placeholder="https://speech.example.org"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Hujjat havolasi
              </label>
              <input
                value={form.docsUrl}
                onChange={set('docsUrl')}
                placeholder="https://github.com/…"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>

          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Xizmat yaratilgach uning sahifasida tariflar (slot, tezlik,
            ustuvorlik) va obunalar qo'shiladi. Kalit obuna bilan birga
            beriladi.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Bekor qilish
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!valid || create.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="animate-spin" size={16} />}
            Yaratish
          </button>
        </div>
      </div>
    </div>
  );
}
