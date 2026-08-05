/**
 * Loyiha sozlamalari — tenant `.env` fayliga tushadigan barcha qiymatlar.
 *
 * Forma QO'LDA yozilmagan: maydonlar admin serverdagi registrdan keladi
 * (`GET /tenants/:id/settings`). Ya'ni backendga yangi sozlama qo'shilsa,
 * shu yerda maydon O'ZI paydo bo'ladi — bu faylga tegish shart emas.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import PendingChanges from './PendingChanges';

const inputCls =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

/**
 * Bitta sozlama maydoni.
 *
 * `draft` — foydalanuvchi tahrirlagan qiymat (hali saqlanmagan).
 * `undefined` bo'lsa maydon tegilmagan va serverdagi qiymat ko'rsatiladi.
 */
function SettingField({ def, draft, onChange }) {
  const [revealed, setRevealed] = useState(false);
  const touched = draft !== undefined;
  const value = touched ? draft : def.type === 'secret' ? '' : def.value;

  const reset = () => onChange('');

  const control = () => {
    switch (def.type) {
      case 'boolean': {
        // Bo'sh qiymat = standart. Standartni aniq ko'rsatib turamiz,
        // aks holda "yoqilganmi?" degan savol javobsiz qoladi.
        const effective = String(value || def.default) === 'true';
        return (
          <button
            type="button"
            role="switch"
            aria-checked={effective}
            onClick={() => onChange(effective ? 'false' : 'true')}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition',
              effective ? 'bg-brand' : 'bg-input',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all',
                effective ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </button>
        );
      }

      case 'select':
        return (
          <select
            value={value || def.default}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
          >
            {def.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            min={def.min ?? undefined}
            max={def.max ?? undefined}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.default || ''}
            className={inputCls}
          />
        );

      case 'secret':
        return (
          <div className="relative">
            <input
              type={revealed ? 'text' : 'password'}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              // Saqlangan sir hech qachon qaytarilmaydi — faqat oxirgi
              // 4 belgisi niqob sifatida ko'rsatiladi.
              placeholder={def.isSet ? def.value : "O'rnatilmagan"}
              autoComplete="new-password"
              className={cn(inputCls, 'pr-10 font-mono')}
            />
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title={revealed ? 'Yashirish' : "Ko'rsatish"}
            >
              {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.default || ''}
            className={inputCls}
          />
        );
    }
  };

  const isBoolean = def.type === 'boolean';

  return (
    <div
      className={cn(
        'py-3.5',
        isBoolean && 'flex items-start justify-between gap-4',
      )}
    >
      <div className={cn(!isBoolean && 'mb-1.5', isBoolean && 'min-w-0 flex-1')}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-foreground">{def.label}</label>

          {def.type === 'secret' && (
            <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Lock size={9} /> shifrlangan
            </span>
          )}

          {def.isOverridden && !touched && (
            <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
              o'zgartirilgan
            </span>
          )}

          {touched && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              saqlanmagan
            </span>
          )}

          <span className="font-mono text-[10px] text-muted-foreground">{def.key}</span>

          {(def.isOverridden || touched) && (
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
              title="Standart qiymatga qaytarish"
            >
              <RotateCcw size={10} /> standart
            </button>
          )}
        </div>

        {def.help && (
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            {def.help}
          </p>
        )}
      </div>

      <div className={cn(isBoolean ? 'shrink-0 pt-1' : 'max-w-md')}>{control()}</div>

      {!isBoolean && def.patternHint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{def.patternHint}</p>
      )}
    </div>
  );
}

function Group({ title, defs, drafts, onChange, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const changed = defs.filter((d) => drafts[d.key] !== undefined).length;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {changed > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              {changed} ta saqlanmagan
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-muted-foreground transition', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="divide-y divide-border border-t border-border px-5">
          {defs.map((def) => (
            <SettingField
              key={def.key}
              def={def}
              draft={drafts[def.key]}
              onChange={(v) => onChange(def.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TenantSettings({ tenantId, canEdit }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-settings', tenantId],
    queryFn: () => api.get(`/tenants/${tenantId}/settings`).then((r) => r.data),
    // Qo'llash ketayotganda holat o'zgarishini kutamiz
    refetchInterval: (q) => (q.state.data?.applyStatus === 'APPLYING' ? 3000 : false),
  });

  const save = useMutation({
    mutationFn: (values) =>
      api.patch(`/tenants/${tenantId}/settings`, { values }).then((r) => r.data),
    onSuccess: (res) => {
      setDrafts({});
      qc.invalidateQueries({ queryKey: ['tenant-settings', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      toast.success(
        res.pending?.count
          ? `Saqlandi — ${res.pending.count} ta o'zgarish qo'llashni kutmoqda`
          : 'Saqlandi',
      );
    },
    onError: (e) => {
      const msg = e.response?.data?.message;
      // Server bir nechta validatsiya xatosini massiv qilib qaytaradi
      toast.error(Array.isArray(msg) ? msg.join('; ') : msg || 'Saqlashda xatolik');
    },
  });

  const setDraft = (key, value) =>
    setDrafts((d) => {
      const next = { ...d, [key]: value };
      // Serverdagi qiymatga qaytgan bo'lsa "tahrirlangan" belgisini olamiz.
      // Maxfiy maydonda buni aniqlab bo'lmaydi (asl qiymat kelmaydi) —
      // bo'sh satr esa "standartga qaytar" bo'lgani uchun draftda qoladi.
      const def = data?.items.find((i) => i.key === key);
      if (def && def.type !== 'secret') {
        const current = def.value ?? '';
        if (value === current) delete next[key];
      }
      return next;
    });

  const { groups, visible } = useMemo(() => {
    if (!data) return { groups: [], visible: [] };
    const list = data.items.filter((i) => showAdvanced || !i.advanced);
    return {
      groups: data.groups.filter((g) => list.some((i) => i.group === g)),
      visible: list,
    };
  }, [data, showAdvanced]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Sozlamalar yuklanmoqda…
      </div>
    );
  }

  if (!data) return null;

  const dirty = Object.keys(drafts).length;

  return (
    <div className="space-y-4">
      <PendingChanges
        tenantId={tenantId}
        pending={data.pending}
        applyStatus={data.applyStatus}
        applyError={data.applyError}
      />

      {!data.encryptionReady && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">Shifrlash kaliti sozlanmagan.</span> Maxfiy
            sozlamalarni (bot token, API kalit) saqlab bo'lmaydi. admin_server
            <span className="font-mono"> .env</span> ga{' '}
            <span className="font-mono">SETTINGS_ENCRYPTION_KEY</span> qo'shing.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Settings2 size={15} />
          Bu qiymatlar tenant <span className="font-mono text-xs">.env</span> fayliga
          tushadi
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showAdvanced}
            onChange={(e) => setShowAdvanced(e.target.checked)}
            className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
          />
          Qo'shimcha sozlamalarni ko'rsatish
        </label>
      </div>

      <div className="space-y-3">
        {groups.map((group, i) => (
          <Group
            key={group}
            title={group}
            defaultOpen={i === 0}
            defs={visible.filter((it) => it.group === group)}
            drafts={drafts}
            onChange={setDraft}
          />
        ))}
      </div>

      {/* Boshqariladigan qiymatlar — faqat ko'rish uchun */}
      <div className="rounded-xl border border-border bg-muted/50 p-4">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Tizim boshqaradigan qiymatlar (o'zgartirilmaydi)
        </div>
        <div className="grid gap-1 text-xs sm:grid-cols-2">
          {Object.entries(data.managed).map(([key, value]) => (
            <div key={key} className="flex gap-2 truncate">
              <span className="font-mono text-muted-foreground">{key}</span>
              <span className="truncate font-mono text-foreground">{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Port, baza nomi va domen loyiha yozuvidan olinadi. JWT va cookie
          sirlari esa faqat serverda yaratiladi — admin bazasida saqlanmaydi.
        </p>
      </div>

      {/* Saqlash paneli — o'zgarish bo'lsa pastda "yopishib" turadi */}
      {canEdit && dirty > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
          <span className="text-sm text-muted-foreground">
            {dirty} ta maydon o'zgartirildi
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setDrafts({})}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Bekor qilish
            </button>
            <button
              onClick={() => save.mutate(drafts)}
              disabled={save.isPending}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-dark disabled:opacity-60"
            >
              {save.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              Saqlash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
