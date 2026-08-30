import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  CornerDownRight,
  Lock,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { api } from '../api/client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOYIHA BO'LIMLARI — JADVAL.
 *
 * 48 ta kalit bor, shuning uchun ro'yxat emas JADVAL: har bir savolga
 * o'z USTUNI javob beradi va ko'z bir qatordan ikkinchisiga tushganda
 * bir xil joydan o'qiydi.
 *
 *   BO'LIM      — nomi va texnik kaliti
 *   HOLAT       — mijoz HOZIR ko'radimi
 *   MANBA       — nega shunday (tarifdanmi, qo'ldami, standartmi)
 *   BOG'LIQLIK  — nega o'chirib bo'lmaydi
 *   AMAL        — nima qila olaman
 *
 * ── ⚠ NEGA "MANBA" USTUNI KERAK ──
 *
 * Yolg'iz "ochiq" belgisi IKKI XIL holatni bir xil ko'rsatardi:
 * "paketga kiradi" va "bu mijozga qo'lda bepul berilgan". Olti oydan
 * keyin farqni hech kim eslay olmaydi va shuning uchun hech kim tegishga
 * jur'at ham qilmaydi.
 *
 * ── ⚠ NEGA "BOG'LIQLIK" USTUNI KERAK ──
 *
 * To'siq BOSISHDAN OLDIN ko'rinishi shart. Aks holda odam o'chirgichni
 * bosadi, 409 oladi va sababini faqat xato matnidan biladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function TenantFeatures({ tenantId, canEdit }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // { key, enabled }
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCore, setShowCore] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['tenant-features', tenantId],
    queryFn: () => api.get(`/tenants/${tenantId}/features`).then((r) => r.data),
  });

  const done = (msg) => (res) => {
    qc.invalidateQueries({ queryKey: ['tenant-features', tenantId] });
    setEditing(null);
    setReason('');
    // ⚠ Turtki yetib bormasa bu XATO EMAS — o'zgarish saqlangan va
    // keyingi heartbeat (15 daqiqa) uni baribir olib boradi. Lekin odam
    // buni bilishi kerak, aks holda "nega hali eski?" degan savol tug'iladi.
    toast.success(
      res?.data?.pushed === false
        ? `${msg} — loyihaga 15 daqiqagacha yetib boradi (server javob bermadi)`
        : `${msg} — loyihada darhol kuchga kirdi`,
    );
  };
  const fail = (e) =>
    toast.error(e?.response?.data?.message || 'Amal bajarilmadi');

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
  const busy = setMutation.isPending || clearMutation.isPending;

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

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Yuklanmoqda…</div>;
  }
  if (!rows?.length) {
    return (
      <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
        Modul kalitlari hali sinxronlanmagan.
        <div className="mt-1 font-mono text-xs">
          admin_server: npm run features:sync
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'all', label: 'Hammasi', n: counts.all },
    { key: 'on', label: 'Ochiq', n: counts.on },
    { key: 'off', label: "O'chiq", n: counts.off },
    { key: 'locked', label: 'Qulflangan', n: counts.locked },
  ];

  return (
    <div className="space-y-4">
      {/* ── Qisqacha izoh: uch manba nimani anglatadi ── */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <p className="text-muted-foreground">
          Tarif standart to'plamni beradi.{' '}
          <b className="text-foreground">Qo'lda</b> qo'yilgan qaror tarifdan
          ustun turadi va sabab bilan qayd etiladi.{' '}
          <b className="text-foreground">Qulflangan</b> bo'limni o'chirib
          bo'lmaydi — unga boshqa bo'lim tayanadi.
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
        <table className="w-full min-w-[840px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Bo'lim</th>
              <th className="px-4 py-2.5 font-medium">Holat</th>
              <th className="px-4 py-2.5 font-medium">Manba</th>
              <th className="px-4 py-2.5 font-medium">Bog'liqlik</th>
              <th className="px-4 py-2.5 text-right font-medium">Amal</th>
            </tr>
          </thead>
          <tbody>
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
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Bunday bo'lim topilmadi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── O'zak ── */}
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

const SOURCE = {
  plan: {
    label: 'Tarifdan',
    hint: 'Loyiha tarifiga kiradi',
    cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  },
  override: {
    label: "Qo'lda",
    hint: 'Tarifdan ustun qo\'yilgan qaror',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  default: {
    label: 'Standart',
    hint: 'Tarifda ham yo\'q, qaror ham yo\'q',
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
  const editable = canEdit && !row.isCore && !blocked;

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-muted/20">
        {/* BO'LIM */}
        <td className="px-4 py-3 align-top">
          <div className={`flex items-start gap-1.5 ${child ? 'pl-5' : ''}`}>
            {child && (
              <CornerDownRight
                size={13}
                className="mt-1 shrink-0 text-muted-foreground"
              />
            )}
            <div className="min-w-0">
              <div className="font-medium">{row.name}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {row.key}
              </div>
            </div>
          </div>
        </td>

        {/* HOLAT */}
        <td className="px-4 py-3 align-top whitespace-nowrap">
          {row.enabled ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check size={14} /> ochiq
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <X size={14} /> o'chiq
            </span>
          )}
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
          {/* ⚠ SABAB MATNI QATORDA CHIZILMAYDI, faqat tooltip'da.
              Grandfather migratsiyasi 36 ta qatorga AYNAN bir xil sabab
              yozadi — uni har qatorda ko'rsatish ustunni bir xil
              takrorlanuvchi matn bilan to'ldirib, MANBA belgisining
              o'zini o'qib bo'lmas holga keltirardi. */}
        </td>

        {/* BOG'LIQLIK */}
        <td className="px-4 py-3 align-top">
          {blocked ? (
            <div
              className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400"
              title={row.blockedBy.join(', ')}
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                {row.permanentlyBlocked ? "O'zak tayanadi: " : "Avval o'chiring: "}
                <KeyList keys={row.blockedBy} />
              </span>
            </div>
          ) : row.requiresKeys?.length ? (
            <span
              className="text-xs text-muted-foreground"
              title={row.requiresKeys.join(', ')}
            >
              Talab qiladi: <KeyList keys={row.requiresKeys} />
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>

        {/* AMAL */}
        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
          {row.isCore ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock size={12} /> o'chirilmaydi
            </span>
          ) : blocked ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              title={`Avval o'chirilishi kerak: ${row.blockedBy.join(', ')}`}
            >
              <Lock size={12} /> qulflangan
            </span>
          ) : !canEdit ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock size={12} /> SUPER_ADMIN
            </span>
          ) : (
            <div className="inline-flex items-center gap-1.5">
              <button
                onClick={() => {
                  setEditing({ key: row.key, enabled: !row.enabled });
                  setReason('');
                }}
                disabled={busy || !editable}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {row.enabled ? "O'chirish" : 'Yoqish'}
              </button>
              {row.override && (
                <button
                  onClick={() => onClear(row.key)}
                  disabled={busy}
                  title="Ustun qarorni olib tashlash — kalit yana tarifga bo'ysunadi"
                  className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          )}
        </td>
      </tr>

      {/* Sabab formasi — o'z qatorida, jadval kengligi bo'ylab */}
      {isEditing && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={5} className="px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle size={13} />
              {editing.enabled
                ? `"${row.name}" yoqiladi`
                : `"${row.name}" o'chiriladi`}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && reason.trim()) {
                    onSet({ key: row.key, enabled: editing.enabled });
                  }
                  if (e.key === 'Escape') { setEditing(null); setReason(''); }
                }}
                placeholder="Sabab (majburiy) — masalan: shartnoma bo'yicha qo'shildi"
                className="min-w-[240px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => onSet({ key: row.key, enabled: editing.enabled })}
                disabled={busy || !reason.trim()}
                className="rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Tasdiqlash
              </button>
              <button
                onClick={() => { setEditing(null); setReason(''); }}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                Bekor qilish
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
