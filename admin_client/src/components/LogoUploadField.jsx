import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ImageUp, Loader2, Trash2 } from 'lucide-react';
import { api } from '../api/client';

/**
 * LOGO YUKLASH.
 *
 * ── ⚠ NEGA FAQAT MAVJUD LOYIHADA ──
 *
 * Marshrut `POST /tenants/:id/logo`, ya'ni tenant `id` KERAK. Yaratish
 * formasida u hali yo'q. Vaqtinchalik yuklash (staging) yo'li yetim
 * fayllar va ularni tozalash ishini olib kelardi — foydasi esa bitta
 * klik. Shuning uchun yaratish sahifasida faqat eslatma chiqadi.
 *
 * ── ⚠ REBUILD ──
 *
 * Logo `VITE_APP_LOGO` orqali yetkaziladi, ya'ni u BUILD paytida
 * client ichiga tushadi. Yuklash qo'llashni darhol boshlaydi va sayt
 * 1-2 daqiqada qayta quriladi. Buni foydalanuvchiga aytish shart:
 * aks holda u "yukladim, ko'rinmayapti" deb qayta-qayta yuklardi.
 */
const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_KB = 512;

export default function LogoUploadField({ tenantId, value, onChanged }) {
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const [broken, setBroken] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
    qc.invalidateQueries({ queryKey: ['tenants'] });
  };

  const uploadMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      // ⚠ `Content-Type` QO'YILMAYDI: multipart chegarasini (boundary)
      // brauzer o'zi yozadi. Qo'lda yozilsa server bo'limlarni ajrata
      // olmaydi va "Fayl yuborilmadi" deb qaytaradi.
      return api.post(`/tenants/${tenantId}/logo`, fd).then((r) => r.data);
    },
    onSuccess: (data) => {
      setBroken(false);
      toast.success(data.message || 'Logo saqlandi');
      onChanged?.(data.logoUrl);
      invalidate();
    },
    onError: (err) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Yuklashda xatolik');
    },
  });

  const removeMut = useMutation({
    mutationFn: () => api.delete(`/tenants/${tenantId}/logo`).then((r) => r.data),
    onSuccess: (data) => {
      toast.success(data.message || "Logo o'chirildi");
      onChanged?.(null);
      invalidate();
    },
    onError: () => toast.error("O'chirishda xatolik"),
  });

  const busy = uploadMut.isPending || removeMut.isPending;

  const pick = (e) => {
    const file = e.target.files?.[0];
    // Bir xil faylni qayta tanlash ishlashi uchun input tozalanadi.
    e.target.value = '';
    if (!file) return;

    // Klient tomonidagi tekshiruv — server baribir qayta tekshiradi
    // (magic baytlar bo'yicha). Bu faqat 512 KB ni bekorga yubormaslik
    // uchun.
    if (file.size > MAX_KB * 1024) {
      toast.error(`Fayl juda katta (${Math.round(file.size / 1024)} KB). Chegara — ${MAX_KB} KB`);
      return;
    }
    uploadMut.mutate(file);
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">Logo</label>

      <div className="flex items-start gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {value && !broken ? (
            <img
              src={value}
              alt="Logo"
              className="size-full object-contain"
              onError={() => setBroken(true)}
            />
          ) : (
            <ImageUp size={20} className="text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            >
              {uploadMut.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ImageUp size={14} />
              )}
              {value ? 'Almashtirish' : 'Yuklash'}
            </button>

            {value && (
              <button
                type="button"
                disabled={busy}
                onClick={() => removeMut.mutate()}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <Trash2 size={14} /> O'chirish
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={pick}
            className="hidden"
          />

          <p className="mt-2 text-xs text-muted-foreground">
            PNG, JPEG yoki WebP · {MAX_KB} KB gacha. Yuklangach sayt qayta
            quriladi (1-2 daqiqa). Logo bo'lmasa nomning bosh harfi brend
            rangida ko'rsatiladi.
          </p>

          {broken && value && (
            <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} /> Rasm ochilmadi — havola buzilgan
              bo'lishi mumkin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
