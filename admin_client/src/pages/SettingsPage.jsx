import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data: stats } = useQuery({
    queryKey: ['maintenance-stats'],
    queryFn: () => api.get('/maintenance/stats').then((r) => r.data),
    enabled: isSuperAdmin,
  });

  const reset = useMutation({
    mutationFn: () =>
      api
        .post('/maintenance/reset-database', { confirm, password })
        .then((r) => r.data),
    onSuccess: (data) => {
      toast.success(
        `Baza tozalandi: ${data.deleted.tenants} loyiha, ` +
          `${data.deleted.adminUsers} admin user o'chirildi`,
      );
      closeModal();
      queryClient.invalidateQueries();
    },
    onError: (err) => {
      toast.error(
        err.response?.data?.message || "Tozalashda xato yuz berdi",
      );
    },
  });

  const closeModal = () => {
    setOpen(false);
    setConfirm('');
    setPassword('');
  };

  const canSubmit = confirm === 'DELETE' && password.length > 0;

  if (!isSuperAdmin) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Sozlamalar</h1>
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          Bu bo'lim faqat super admin uchun.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Sozlamalar</h1>
        <p className="text-sm text-slate-500">
          Tizim boshqaruvi va xavfli amallar
        </p>
      </div>

      <div className="rounded-xl border border-red-200 bg-white p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-red-700">Xavfli hudud</h2>
            <p className="text-sm text-slate-500">
              Bu amallarni qaytarib bo'lmaydi. Ehtiyot bo'ling.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 font-medium">Bazani tozalash</div>
          <p className="mb-3 text-sm text-slate-600">
            Admin bazasidagi barcha loyihalar va qo'shimcha admin userlar
            o'chiriladi. Faqat super admin logini (.env orqali) va tizim
            shablonlari saqlanadi.
          </p>

          {stats && (
            <ul className="mb-4 space-y-1 text-sm text-slate-600">
              <li>
                O'chadi:{' '}
                <span className="font-medium text-red-600">
                  {stats.willDelete.tenants} loyiha
                </span>
                ,{' '}
                <span className="font-medium text-red-600">
                  {stats.willDelete.adminUsers} admin user
                </span>
              </li>
              <li>
                Saqlanadi:{' '}
                <span className="font-medium text-emerald-600">
                  {stats.willKeep.systemTemplates} tizim shabloni
                </span>
                , super admin login
              </li>
            </ul>
          )}

          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Diqqat: tenantlarning MongoDB bazalari, PM2 processlari va nginx
            configlari VPS'da o'chmaydi — ularni qo'lda tozalash kerak bo'ladi.
          </div>

          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            <Trash2 size={17} /> Bazani tozalash
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="font-semibold">Bazani tozalashni tasdiqlang</h3>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 transition hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-600">
              Bu amalni qaytarib bo'lmaydi. Davom etish uchun{' '}
              <span className="font-mono font-semibold text-red-600">
                DELETE
              </span>{' '}
              so'zini va parolingizni kiriting.
            </p>

            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tasdiqlash so'zi
            </label>
            <input
              autoFocus
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500"
            />

            <label className="mb-1 block text-sm font-medium text-slate-700">
              Parolingiz
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit && !reset.isPending) {
                  reset.mutate();
                }
              }}
              placeholder="••••••••"
              className="mb-5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Bekor qilish
              </button>
              <button
                onClick={() => reset.mutate()}
                disabled={!canSubmit || reset.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reset.isPending ? (
                  <>
                    <Loader2 className="animate-spin" size={16} /> Tozalanmoqda…
                  </>
                ) : (
                  <>
                    <Trash2 size={16} /> Ha, tozalansin
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
