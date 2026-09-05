import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { api } from '../api/client';
import OwnerCredentialsFields, {
  ownerCredentialsValid,
} from './OwnerCredentialsFields';

/**
 * ══════════════════════════════════════════════════════════════════════
 * LOYIHA EGASI — LOGIN KO'RINADI, PAROL KO'RINMAYDI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── ⚠ "PAROLNI KO'RSATISH" TUGMASI OLIB TASHLANDI ──
 *
 * Ilgari parol tenant bazasida ochiq matnda yotardi va shu yerda ko'z
 * tugmasi bilan ko'rsatilardi. Endi u `scrypt` hash: qaytarib bo'lmaydi
 * va hech bir endpoint uni bermaydi.
 *
 * Buning o'rniga IKKI aniq amal:
 *   • "Parolni qayta o'rnatish" — yangi parol yaratiladi va BIR MARTA
 *     ko'rsatiladi. Ikkinchi marta olib bo'lmaydi.
 *   • "Parolni himoyalash" — eski ochiq yozuvni parolni O'ZGARTIRMASDAN
 *     hash'ga o'giradi (mijoz o'z paroli bilan kirishda davom etadi).
 *
 * Sabab: parolni ko'rish uchun uni qaytariladigan shaklda saqlash kerak,
 * ya'ni bitta baza nusxasi har bir markazning to'liq huquqli hisobini
 * ochib berardi. Qo'llab-quvvatlash uchun "ko'rish" shart emas.
 *
 * ── HOLAT HAR SAFAR TENANTDAN O'QILADI ──
 * Admin bazasida nusxa yo'q — ikkinchi haqiqat manbai bo'lmasin.
 */
export default function TenantOwner({ tenantId, canEdit }) {
  const qc = useQueryClient();
  // ⚠ Faqat qayta o'rnatishdan KEYIN, bir marta ko'rsatiladigan parol.
  // U hech qayerda saqlanmaydi va sahifa yangilansa yo'qoladi — ataylab.
  const [oneTime, setOneTime] = useState(null);
  const [copied, setCopied] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ownerUsername: 'owner', ownerPassword: '' });

  const key = ['tenant-owner', tenantId];

  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: () => api.get(`/tenants/${tenantId}/owner`).then((r) => r.data),
    // Ulanib bo'lmasa server 200 + `reachable:false` qaytaradi, ya'ni
    // qayta urinishning ma'nosi yo'q — sabab javobning ichida.
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: (payload) =>
      api.post(`/tenants/${tenantId}/owner`, payload).then((r) => r.data),
    onSuccess: () => {
      toast.success('Ega hisobi yaratildi');
      setCreating(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Yaratishda xatolik');
    },
  });

  const resetMut = useMutation({
    mutationFn: () =>
      api.post(`/tenants/${tenantId}/owner/password/reset`).then((r) => r.data),
    onSuccess: (r) => {
      // Parol FAQAT shu yerda va FAQAT hozir. Serverda hash qoldi.
      setOneTime(r.password);
      toast.success('Yangi parol yaratildi — nusxa oling');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Qayta o\'rnatishda xatolik');
    },
  });

  const upgradeMut = useMutation({
    mutationFn: () =>
      api.post(`/tenants/${tenantId}/owner/password/upgrade`).then((r) => r.data),
    onSuccess: (r) => {
      toast.success(r.message || 'Parol himoyalandi');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Xatolik');
    },
  });

  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      toast.error("Nusxa olinmadi — qo'lda belgilab oling");
    }
  };

  const card = 'rounded-xl border border-border bg-card p-6';

  if (isLoading) {
    return (
      <div className={`${card} flex items-center gap-2 text-sm text-muted-foreground`}>
        <Loader2 size={15} className="animate-spin" /> Yuklanmoqda...
      </div>
    );
  }

  if (isError) {
    return (
      <div className={card}>
        <p className="text-sm text-red-600 dark:text-red-400">
          Ma'lumotni olishda xatolik.
        </p>
      </div>
    );
  }

  // Baza hali yaratilmagan (DRAFT/PROVISIONING) yoki tenant javob bermayapti.
  if (!data.reachable) {
    return (
      <div className={card}>
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Loyiha bazasiga ulanib bo'lmadi</p>
            <p className="mt-0.5 text-xs opacity-90">
              Provisioning tugaganini tekshiring. {data.error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Ega yo'q: yaratish taklif qilinadi ──
  if (!data.exists) {
    return (
      <div className={`${card} space-y-5`}>
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <KeyRound size={14} /> Ega hisobi
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bu loyihada ega hisobi yo'q — ya'ni tizimga kirishning yo'li yo'q.
          </p>
        </div>

        {!canEdit ? null : !creating ? (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <UserPlus size={15} /> Ega yaratish
          </button>
        ) : (
          <div className="space-y-4 border-t border-border pt-5">
            <OwnerCredentialsFields
              value={form}
              onChange={setForm}
              disabled={createMut.isPending}
            />
            <div className="flex gap-2">
              <button
                disabled={!ownerCredentialsValid(form) || createMut.isPending}
                onClick={() =>
                  createMut.mutate({
                    ownerUsername: form.ownerUsername.trim(),
                    ownerPassword: form.ownerPassword,
                  })
                }
                className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {createMut.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                Yaratish
              </button>
              <button
                onClick={() => setCreating(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Ega mavjud: login + parol ──
  const owner = data.owner;

  const Row = ({ label, value, mono }) => (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className={mono ? 'font-mono text-sm' : 'text-sm font-medium'}>
          {value}
        </span>
        <button
          onClick={() => copy(label, value)}
          className="text-muted-foreground transition hover:text-foreground"
          title="Nusxa olish"
        >
          {copied === label ? (
            <Check size={14} className="text-emerald-600" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      </span>
    </div>
  );

  return (
    <div className={`${card} space-y-1`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <KeyRound size={14} /> Ega hisobi
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Mijoz shu login bilan o'z tizimiga kiradi. Parol ko'rsatilmaydi —
            faqat qayta o'rnatiladi.
          </p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            owner.hashed
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
          }`}
        >
          {owner.hashed ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
          {owner.hashed ? 'Himoyalangan' : 'Ochiq saqlangan'}
        </span>
      </div>

      <Row label="Login" value={owner.username} mono />

      {!owner.passwordSet && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Parol o'rnatilmagan — mijoz kira olmaydi. Qayta o'rnating.
        </div>
      )}

      {/* ── ESKI OCHIQ YOZUV ── */}
      {owner.passwordSet && !owner.hashed && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              Bu hisobning paroli bazada OCHIQ saqlangan. Uni himoyalash mumkin —
              mijozning paroli O'ZGARMAYDI, u avvalgidek kirishda davom etadi.
            </span>
          </div>
          {canEdit && (
            <button
              disabled={upgradeMut.isPending}
              onClick={() => upgradeMut.mutate()}
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50 dark:border-amber-500/40"
            >
              {upgradeMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Parolni himoyalash
            </button>
          )}
        </div>
      )}

      {/* ── BIR MARTALIK PAROL ── */}
      {oneTime && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="mb-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
            Yangi parol — FAQAT HOZIR ko'rinadi. Yopilsa qayta olib bo'lmaydi.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded bg-card px-2 py-1.5 font-mono text-sm ring-1 ring-border">
              {oneTime}
            </code>
            <button
              onClick={() => copy('Yangi parol', oneTime)}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              {copied === 'Yangi parol' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
            <button
              onClick={() => setOneTime(null)}
              className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Yopish
            </button>
          </div>
        </div>
      )}

      {!owner.isActive && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Hisob faol emas — mijoz kira olmaydi.
        </div>
      )}

      {canEdit && (
        <div className="mt-4 border-t border-border pt-4">
          <button
            disabled={resetMut.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  "Parol qayta o'rnatilsinmi?\n\nYangi parol BIR MARTA ko'rsatiladi va uni qayta olib bo'lmaydi.\nEganing tirik seanslari bekor qilinadi — u yangi parol bilan qaytadan kiradi.",
                )
              )
                return;
              resetMut.mutate();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
          >
            {resetMut.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Parolni qayta o'rnatish
          </button>
        </div>
      )}
    </div>
  );
}
