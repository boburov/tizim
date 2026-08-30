import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Lock,
  Package,
  RotateCcw,
  X,
} from 'lucide-react';
import { api } from '../api/client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOYIHA MODULLARI — YOQISH/O'CHIRISH.
 *
 * ── UCH XIL MANBA, UCH XIL MA'NO ──
 *
 *   `plan`     — tarif beradi. Odatiy holat, hech kim aralashmagan.
 *   `override` — QO'LDA qo'yilgan qaror, tarifdan ustun. Sababi bilan.
 *   `default`  — tarifda ham yo'q, qaror ham yo'q → o'chiq.
 *
 * Manbani ko'rsatish SHART: "ochiq" degan bitta belgi "paketga kiradi"
 * va "qo'lda bepul berilgan" ni ajratmasdi, va olti oydan keyin hech
 * kim tegishga jur'at qilmasdi.
 *
 * ── ⚠ NEGA SABAB MAJBURIY ──
 *
 * Bu qaror pul oqimini chetlab o'tadi. Sababsiz yozuv — kelajakdagi
 * javobsiz savol. Shuning uchun forma sababsiz yuborilmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function TenantFeatures({ tenantId, canEdit }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // { key, enabled }
  const [reason, setReason] = useState('');

  const { data: rows, isLoading } = useQuery({
    queryKey: ['tenant-features', tenantId],
    queryFn: () => api.get(`/tenants/${tenantId}/features`).then((r) => r.data),
  });

  const done = (msg) => (res) => {
    qc.invalidateQueries({ queryKey: ['tenant-features', tenantId] });
    setEditing(null);
    setReason('');
    // ⚠ Turtki yetib bormasa bu XATO EMAS — o'zgarish saqlangan va
    // keyingi heartbeat (15 daqiqa) uni baribir olib boradi. Lekin
    // odam buni BILISHI kerak, aks holda "nega hali ham eski?" degan
    // savol tug'iladi.
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

  // Imkoniyatlar (capability) otasi ostida chiziladi — ro'yxat tekis
  // bo'lsa "davomat-excel" ning "davomat" ga bog'liqligi ko'rinmasdi.
  //
  // ⚠ O'ZAK bo'limlar ALOHIDA, pastda: ular hech qachon o'chirilmaydi,
  // ya'ni ular uchun o'chirgich chizish yolg'on va'da bo'lardi. Lekin
  // ular ro'yxatda TURISHI kerak — yuqoridagi qulflangan yozuvlarning
  // sababi aynan shular.
  const modules = rows.filter((r) => !r.parentKey && !r.isCore);
  const coreRows = rows.filter((r) => r.isCore);
  const childrenOf = (key) => rows.filter((r) => r.parentKey === key);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-medium">
          <Package size={15} /> Bo'limlar shu loyihada
        </div>
        <p className="text-muted-foreground">
          Tarif standart to'plamni beradi. Qo'lda qo'yilgan qaror tarifdan
          ustun turadi va sabab bilan qayd etiladi.
        </p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {modules.map((row) => (
          <FeatureRow
            key={row.key}
            row={row}
            depth={0}
            canEdit={canEdit}
            editing={editing}
            setEditing={setEditing}
            reason={reason}
            setReason={setReason}
            onSet={setMutation.mutate}
            onClear={clearMutation.mutate}
            busy={setMutation.isPending || clearMutation.isPending}
          >
            {childrenOf(row.key).map((child) => (
              <FeatureRow
                key={child.key}
                row={child}
                depth={1}
                // ⚠ Otasi o'chiq bo'lsa bolani tahrirlash MA'NOSIZ:
                // yoqilsa ham amalda o'chiq qoladi (ota zanjiri).
                canEdit={canEdit && row.enabled}
                editing={editing}
                setEditing={setEditing}
                reason={reason}
                setReason={setReason}
                onSet={setMutation.mutate}
                onClear={clearMutation.mutate}
                busy={setMutation.isPending || clearMutation.isPending}
              />
            ))}
          </FeatureRow>
        ))}
      </div>

      {coreRows.length > 0 && (
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Tizim o'zagi — {coreRows.length} ta bo'lim (o'chirilmaydi)
          </summary>
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Bular ilova ishlashi uchun zarur va sotilmaydi. Ro'yxatda turishi
            sabab: yuqoridagi ba'zi bo'limlar aynan shularga tayanadi va
            shuning uchun qulflangan.
            <div className="mt-2 flex flex-wrap gap-1.5">
              {coreRows.map((r) => (
                <span
                  key={r.key}
                  className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px]"
                >
                  {r.key}
                </span>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

const SOURCE_BADGE = {
  plan: { label: 'Tarifdan', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' },
  override: { label: "Qo'lda", cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  default: { label: 'Standart', cls: 'bg-muted text-muted-foreground' },
};

function FeatureRow({
  row, depth, canEdit, editing, setEditing, reason, setReason,
  onSet, onClear, busy, children,
}) {
  const isEditing = editing?.key === row.key;
  const badge = SOURCE_BADGE[row.source];
  // ⚠ To'siq faqat O'CHIRISHGA taalluqli. Yoqilgan bo'lim to'silgan
  // bo'lsa uni o'chirib bo'lmaydi; o'chiq bo'limni esa yoqish har doim
  // mumkin (u hech kimga xalaqit bermaydi).
  const blocked = row.enabled && row.blockedBy?.length > 0;

  return (
    <>
      <div className={`p-4 ${depth ? 'bg-muted/20 pl-10' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{row.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                {badge.label}
              </span>
              {row.enabled ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check size={13} /> ochiq
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <X size={13} /> o'chiq
                </span>
              )}
            </div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">{row.key}</div>

            {row.requiresKeys?.length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                Talab qiladi: {row.requiresKeys.join(', ')}
              </div>
            )}

            {blocked && (
              <div className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>
                  {row.permanentlyBlocked
                    ? "Tizim o'zagi shu bo'limga tayanadi, shuning uchun hozircha o'chirib bo'lmaydi: "
                    : "O'chirish uchun avval bularni o'chiring: "}
                  <span className="font-mono">{row.blockedBy.join(', ')}</span>
                </span>
              </div>
            )}

            {row.override && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-500/25 dark:bg-amber-500/10">
                <div className="font-medium">
                  {row.override.enabled ? 'Majburan yoqilgan' : "Majburan o'chirilgan"}
                  {row.planGrants && !row.override.enabled && ' (tarifda bor edi)'}
                </div>
                <div className="mt-0.5 text-muted-foreground">{row.override.reason}</div>
                <div className="mt-0.5 text-muted-foreground">
                  {row.override.createdBy} ·{' '}
                  {new Date(row.override.createdAt).toLocaleDateString('uz-UZ')}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {blocked ? (
              // ⚠ TO'SIQ OLDINDAN KO'RSATILADI, bosilgandan keyin emas.
              // Aks holda odam o'chirgichni bosib 409 olardi va sababini
              // faqat xato matnidan bilardi.
              <span
                className="flex items-center gap-1 text-xs text-muted-foreground"
                title={`Avval o'chirilishi kerak: ${row.blockedBy.join(', ')}`}
              >
                <Lock size={13} />
                {row.permanentlyBlocked ? "o'zakka bog'liq" : "bog'liqlik"}
              </span>
            ) : !canEdit ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock size={13} /> SUPER_ADMIN
              </span>
            ) : (
              <>
                <button
                  onClick={() => {
                    setEditing({ key: row.key, enabled: !row.enabled });
                    setReason('');
                  }}
                  disabled={busy}
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
                    <RotateCcw size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle size={13} />
              {editing.enabled
                ? `"${row.name}" yoqiladi`
                : `"${row.name}" o'chiriladi`}
            </div>
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Sabab (majburiy) — masalan: shartnoma bo'yicha qo'shildi"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onSet({ key: row.key, enabled: editing.enabled })}
                disabled={busy || !reason.trim()}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Tasdiqlash
              </button>
              <button
                onClick={() => { setEditing(null); setReason(''); }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        )}
      </div>
      {children}
    </>
  );
}
