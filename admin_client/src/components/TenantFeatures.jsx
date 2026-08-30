import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  CornerDownRight,
  Lock,
  Minus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { api } from '../api/client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOYIHA BO'LIMLARI — KATAKCHALI JADVAL.
 *
 * Shakl "User & access" ruxsat matritsasidan olingan: har qator bitta
 * bo'lim, chap ustunda KATAKCHA, sarlavhada esa hammasini birdan
 * belgilaydigan katakcha.
 *
 *   ☑ BO'LIM    — yoqilganmi (bosilsa o'zgartiriladi)
 *   MANBA       — nega shunday (tarifdanmi, qo'ldami, standartmi)
 *   BOG'LIQLIK  — nega o'chirib bo'lmaydi
 *
 * ── ⚠ KATAKCHA DARHOL SAQLAMAYDI ──
 *
 * Ruxsat matritsasida katakcha bosilsa o'sha zahoti belgilanadi. Bu
 * yerda esa bo'lim yoqish TIJORAT qarori: u pul oqimini chetlab o'tadi
 * va SABAB bilan qayd etilishi shart (`TenantCommercialChange`).
 * Shuning uchun bosilganda katakcha emas, SABAB QATORI ochiladi —
 * tasdiqlangandan keyingina holat o'zgaradi.
 *
 * Aks holda olti oydan keyin "nega bu loyihada davomat bepul?" degan
 * savolga javob beradigan hech narsa qolmasdi.
 *
 * ── ⚠ QULFLANGAN QATOR ──
 *
 * Katakcha o'chirilgan (disabled) holatda turadi: unga boshqa bo'lim
 * tayanadi. Sababi BOG'LIQLIK ustunida — bosishdan OLDIN ko'rinadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function TenantFeatures({ tenantId, canEdit }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // { key, enabled } | { bulk: true, enabled }
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCore, setShowCore] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['tenant-features', tenantId],
    queryFn: () => api.get(`/tenants/${tenantId}/features`).then((r) => r.data),
  });

  const reset = () => { setEditing(null); setReason(''); };
  const refresh = () => qc.invalidateQueries({ queryKey: ['tenant-features', tenantId] });

  const done = (msg) => (res) => {
    refresh();
    reset();
    // ⚠ Turtki yetib bormasa bu XATO EMAS — o'zgarish saqlangan va
    // keyingi heartbeat (15 daqiqa) uni baribir olib boradi. Lekin odam
    // buni bilishi kerak, aks holda "nega hali eski?" degan savol tug'iladi.
    toast.success(
      res?.data?.pushed === false
        ? `${msg} — loyihaga 15 daqiqagacha yetib boradi (server javob bermadi)`
        : `${msg} — loyihada darhol kuchga kirdi`,
    );
  };
  const fail = (e) => toast.error(e?.response?.data?.message || 'Amal bajarilmadi');

  const setMutation = useMutation({
    mutationFn: ({ key, enabled }) =>
      api.put(`/tenants/${tenantId}/features/${key}`, { enabled, reason }),
    onSuccess: done('Saqlandi'),
    onError: fail,
  });
  const clearMutation = useMutation({
    mutationFn: (key) => api.delete(`/tenants/${tenantId}/features/${key}`),
    onSuccess: done('Ustun qaror olib tashlandi'),
    onError: fail,
  });

  /**
   * OMMAVIY o'zgartirish — bitta sabab, ketma-ket so'rovlar.
   *
   * ⚠ KETMA-KET, parallel EMAS. Bog'liqlik to'sig'i har so'rovda QAYTA
   * hisoblanadi: "avval bolasini o'chir, keyin otasini" oqimi faqat
   * tartib saqlanganda ishlaydi. Parallel yuborilsa ikkalasi ham eski
   * holatni ko'rib, ikkalasi ham rad etilardi.
   *
   * ⚠ QISMAN MUVAFFAQIYAT NORMAL. To'silgan bo'lim o'tmaydi va bu xato
   * emas — shuning uchun natija "N ta bajarildi, M ta to'silgan" deb
   * aytiladi, hammasi yiqildi deb emas.
   */
  const bulk = useMutation({
    mutationFn: async ({ enabled, keys }) => {
      let ok = 0;
      const blocked = [];
      for (const key of keys) {
        try {
          await api.put(`/tenants/${tenantId}/features/${key}`, { enabled, reason });
          ok += 1;
        } catch (e) {
          blocked.push(key);
        }
      }
      return { ok, blocked };
    },
    onSuccess: ({ ok, blocked }) => {
      refresh();
      reset();
      if (!blocked.length) toast.success(`${ok} ta bo'lim o'zgartirildi`);
      else
        toast.warning(
          `${ok} ta o'zgartirildi, ${blocked.length} ta to'silgan: ${blocked.join(', ')}`,
        );
    },
    onError: fail,
  });

  const busy = setMutation.isPending || clearMutation.isPending || bulk.isPending;

  // Ota-bola tartibi: imkoniyat DOIM o'z modulidan keyin turadi, aks
  // holda "to'lov importi" ning "Excel import" ga bog'liqligi ko'rinmasdi.
  const ordered = useMemo(() => {
    if (!rows) return [];
    const parents = rows.filter((r) => !r.parentKey);
    return parents.flatMap((p) => [p, ...rows.filter((c) => c.parentKey === p.key)]);
  }, [rows]);

  const counts = useMemo(() => {
    const sw = ordered.filter((r) => !r.isCore);
    return {
      all: sw.length,
      on: sw.filter((r) => r.enabled).length,
      off: sw.filter((r) => !r.enabled).length,
      locked: sw.filter((r) => r.enabled && r.blockedBy?.length).length,
      core: ordered.filter((r) => r.isCore).length,
    };
  }, [ordered]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ordered.filter((r) => {
      if (r.isCore && !showCore) return false;
      if (q && !`${r.name} ${r.key}`.toLowerCase().includes(q)) return false;
      if (filter === 'on') return r.enabled;
      if (filter === 'off') return !r.enabled;
      if (filter === 'locked') return r.enabled && r.blockedBy?.length > 0;
      return true;
    });
  }, [ordered, query, filter, showCore]);

  /** Sarlavha katakchasi qaysi bo'limlarga ta'sir qiladi. */
  const bulkTargets = (enabled) =>
    visible
      .filter((r) => !r.isCore && r.enabled !== enabled)
      // O'chirishda to'silganlar tushmaydi — ular baribir rad etilardi.
      .filter((r) => (enabled ? true : !r.blockedBy?.length))
      .map((r) => r.key);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Yuklanmoqda…</div>;
  }
  if (!rows?.length) {
    return (
      <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
        Modul kalitlari hali sinxronlanmagan.
        <div className="mt-1 font-mono text-xs">admin_server: npm run features:sync</div>
      </div>
    );
  }

  const TABS = [
    { key: 'all', label: 'Hammasi', n: counts.all },
    { key: 'on', label: 'Ochiq', n: counts.on },
    { key: 'off', label: "O'chiq", n: counts.off },
    { key: 'locked', label: 'Qulflangan', n: counts.locked },
  ];

  const switchable = visible.filter((r) => !r.isCore);
  const allOn = switchable.length > 0 && switchable.every((r) => r.enabled);
  const someOn = switchable.some((r) => r.enabled);
  const headerState = allOn ? 'on' : someOn ? 'partial' : 'off';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <p className="text-muted-foreground">
          Katakchani bosing — <b className="text-foreground">sabab</b> so'raladi va
          shundan keyin saqlanadi. <b className="text-foreground">Qo'lda</b> qo'yilgan
          qaror tarifdan ustun turadi.{' '}
          <b className="text-foreground">Qulflangan</b> bo'limni o'chirib bo'lmaydi —
          unga boshqa bo'lim tayanadi.
        </p>
      </div>

      {/* ── Qidiruv + filtr ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bo'lim nomi yoki kaliti…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                filter === t.key
                  ? 'bg-foreground text-background'
                  : 'border border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {t.label} <span className="opacity-60">{t.n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Jadval ── */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">
                <div className="flex items-center gap-2.5">
                  <Box
                    state={headerState}
                    disabled={!canEdit || busy}
                    title={
                      allOn
                        ? "Ko'rinayotgan hamma bo'limni o'chirish"
                        : "Ko'rinayotgan hamma bo'limni yoqish"
                    }
                    onClick={() => {
                      const next = !allOn;
                      const keys = bulkTargets(next);
                      if (!keys.length) {
                        toast.info("O'zgartiradigan bo'lim yo'q");
                        return;
                      }
                      setEditing({ bulk: true, enabled: next, keys });
                      setReason('');
                    }}
                  />
                  <span>Bo'lim</span>
                </div>
              </th>
              <th className="px-4 py-3 font-medium">Manba</th>
              <th className="px-4 py-3 font-medium">Bog'liqlik</th>
              <th className="px-4 py-3 text-right font-medium">Qaror</th>
            </tr>
          </thead>
          <tbody>
            {/* Ommaviy sabab qatori — jadval boshida, ta'sir doirasi bilan */}
            {editing?.bulk && (
              <tr className="border-b border-border bg-muted/40">
                <td colSpan={4} className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                    <AlertTriangle size={13} />
                    {editing.keys.length} ta bo'lim{' '}
                    {editing.enabled ? 'yoqiladi' : "o'chiriladi"}
                  </div>
                  <ReasonBar
                    reason={reason}
                    setReason={setReason}
                    busy={busy}
                    onConfirm={() =>
                      bulk.mutate({ enabled: editing.enabled, keys: editing.keys })
                    }
                    onCancel={reset}
                  />
                </td>
              </tr>
            )}

            {visible.map((row) => (
              <FeatureRow
                key={row.key}
                row={row}
                canEdit={canEdit}
                editing={editing}
                setEditing={setEditing}
                reason={reason}
                setReason={setReason}
                onSet={setMutation.mutate}
                onClear={clearMutation.mutate}
                busy={busy}
              />
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Bunday bo'lim topilmadi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showCore}
          onChange={(e) => setShowCore(e.target.checked)}
          className="size-3.5 accent-current"
        />
        Tizim o'zagini ham ko'rsatish ({counts.core} ta) — ular sotilmaydi va
        o'chirilmaydi, lekin yuqoridagi qulflarning sababi aynan shular
      </label>
    </div>
  );
}

/**
 * Katakcha — uch holat: belgilangan, qisman (chiziqcha), bo'sh.
 *
 * ⚠ `<input type=checkbox>` EMAS: qisman holat (indeterminate) faqat
 * JS orqali qo'yiladi va uni React boshqarganda har renderda qayta
 * o'rnatish kerak bo'lardi. Tugma esa holatni ochiq ko'rsatadi.
 */
function Box({ state, disabled, onClick, title }) {
  const base =
    'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition';
  const look = disabled
    ? 'cursor-not-allowed border-border bg-muted text-muted-foreground'
    : state === 'off'
      ? 'cursor-pointer border-border bg-background hover:border-foreground/40'
      : 'cursor-pointer border-foreground bg-foreground text-background';

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'partial' ? 'mixed' : state === 'on'}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`${base} ${look}`}
    >
      {state === 'on' && <Check size={12} strokeWidth={3} />}
      {state === 'partial' && <Minus size={12} strokeWidth={3} />}
    </button>
  );
}

function ReasonBar({ reason, setReason, busy, onConfirm, onCancel }) {
  return (
    <div className="flex flex-wrap gap-2">
      <input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && reason.trim()) onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Sabab (majburiy) — masalan: shartnoma bo'yicha qo'shildi"
        className="min-w-[240px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <button
        onClick={onConfirm}
        disabled={busy || !reason.trim()}
        className="rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
      >
        Tasdiqlash
      </button>
      <button
        onClick={onCancel}
        className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
      >
        Bekor qilish
      </button>
    </div>
  );
}

const SOURCE = {
  plan: {
    label: 'Tarifdan',
    hint: 'Loyiha tarifiga kiradi',
    cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  },
  override: {
    label: "Qo'lda",
    hint: "Tarifdan ustun qo'yilgan qaror",
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  default: {
    label: 'Standart',
    hint: "Tarifda ham yo'q, qaror ham yo'q",
    cls: 'bg-muted text-muted-foreground',
  },
};

/**
 * Kalitlar ro'yxati — ko'pi bilan IKKITA, qolgani "+N".
 *
 * ⚠ To'liq ro'yxat qatorni cho'zib yuborardi: `finance` ga to'qqizta
 * bo'lim tayanadi va ular chizilganda o'sha bitta qator ekranning
 * uchdan birini egallardi. To'liq ro'yxat tooltip'da qoladi.
 */
function KeyList({ keys }) {
  const shown = keys.slice(0, 2);
  const rest = keys.length - shown.length;
  return (
    <span className="font-mono">
      {shown.join(', ')}
      {rest > 0 && <span className="text-muted-foreground"> +{rest} ta</span>}
    </span>
  );
}

function FeatureRow({
  row, canEdit, editing, setEditing, reason, setReason, onSet, onClear, busy,
}) {
  const isEditing = editing?.key === row.key;
  const src = SOURCE[row.source];
  const child = Boolean(row.parentKey);
  // ⚠ To'siq faqat O'CHIRISHGA taalluqli. O'chiq bo'limni yoqish har
  // doim mumkin — u hech kimga xalaqit bermaydi.
  const blocked = row.enabled && row.blockedBy?.length > 0;
  const locked = row.isCore || blocked || !canEdit;

  const lockNote = row.isCore
    ? "Tizim o'zagi — o'chirilmaydi"
    : blocked
      ? `Avval o'chirilishi kerak: ${row.blockedBy.join(', ')}`
      : !canEdit
        ? 'Faqat SUPER_ADMIN o\'zgartira oladi'
        : undefined;

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-muted/20">
        {/* ☑ BO'LIM */}
        <td className="px-4 py-3 align-top">
          <div className={`flex items-start gap-2.5 ${child ? 'pl-6' : ''}`}>
            <span className="mt-0.5">
              <Box
                state={row.enabled ? 'on' : 'off'}
                disabled={locked || busy}
                title={lockNote}
                onClick={() => {
                  setEditing({ key: row.key, enabled: !row.enabled });
                  setReason('');
                }}
              />
            </span>
            {child && (
              <CornerDownRight size={13} className="mt-1 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className={row.enabled ? 'font-medium' : 'font-medium text-muted-foreground'}>
                {row.name}
              </div>
              <div className="font-mono text-xs text-muted-foreground">{row.key}</div>
            </div>
          </div>
        </td>

        {/* MANBA */}
        <td className="px-4 py-3 align-top whitespace-nowrap">
          {row.isCore ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Tizim o'zagi
            </span>
          ) : (
            <span
              title={
                row.override
                  ? `${src.hint}\n\nSabab: ${row.override.reason}\n${row.override.createdBy}`
                  : src.hint
              }
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${src.cls}`}
            >
              {src.label}
            </span>
          )}
        </td>

        {/* BOG'LIQLIK */}
        <td className="px-4 py-3 align-top">
          {blocked ? (
            <div
              className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400"
              title={row.blockedBy.join(', ')}
            >
              <Lock size={12} className="mt-0.5 shrink-0" />
              <span>
                {row.permanentlyBlocked ? "O'zak tayanadi: " : "Avval o'chiring: "}
                <KeyList keys={row.blockedBy} />
              </span>
            </div>
          ) : row.requiresKeys?.length ? (
            <span className="text-xs text-muted-foreground" title={row.requiresKeys.join(', ')}>
              Talab qiladi: <KeyList keys={row.requiresKeys} />
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>

        {/* QAROR — ustun qarorni bekor qilish */}
        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
          {row.override && canEdit && !row.isCore ? (
            <button
              onClick={() => onClear(row.key)}
              disabled={busy}
              title="Ustun qarorni olib tashlash — kalit yana tarifga bo'ysunadi"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw size={12} /> tarifga
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      </tr>

      {isEditing && !editing.bulk && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={4} className="px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle size={13} />
              {editing.enabled ? `"${row.name}" yoqiladi` : `"${row.name}" o'chiriladi`}
            </div>
            <ReasonBar
              reason={reason}
              setReason={setReason}
              busy={busy}
              onConfirm={() => onSet({ key: row.key, enabled: editing.enabled })}
              onCancel={() => { setEditing(null); setReason(''); }}
            />
          </td>
        </tr>
      )}
    </>
  );
}
