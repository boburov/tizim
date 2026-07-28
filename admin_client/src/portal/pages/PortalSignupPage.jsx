import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Rocket } from 'lucide-react';
import { customerApi, googleLoginUrl } from '../api/customerClient';
import GoogleButton from '../components/GoogleButton';

export default function PortalSignupPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    companyName: '',
  });
  const [loading, setLoading] = useState(false);

  const setField = (key, value) => setForm((s) => ({ ...s, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await customerApi.post('/customer/auth/signup', {
        ...form,
        email: form.email.trim().toLowerCase(),
      });
      // Email yuborish sozlanmagan bo'lsa server tokenni qaytaradi (dev) —
      // bunday holda hisob darrov tasdiqlangan bo'ladi.
      toast.success(
        data.verifyToken
          ? 'Hisob yaratildi — endi kirishingiz mumkin'
          : 'Emailingizga tasdiqlash havolasi yuborildi',
      );
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white">
            <Rocket size={24} />
          </div>
          <h1 className="text-xl font-semibold">Ro'yxatdan o'tish</h1>
          <p className="text-sm text-slate-500">
            Bepul sinov bilan boshlang
          </p>
        </div>

        <GoogleButton
          href={googleLoginUrl()}
          label="Google bilan ro'yxatdan o'tish"
        />

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">yoki</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              To'liq ism
            </label>
            <input
              required
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="Ism Familiya"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="siz@example.uz"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Parol
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="Kamida 8 ta belgi"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tashkilot nomi
              <span className="ml-1 font-normal text-slate-400">(ixtiyoriy)</span>
            </label>
            <input
              value={form.companyName}
              onChange={(e) => setField('companyName', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="O'quv markaz nomi"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Ro'yxatdan o'tish
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Hisobingiz bormi?{' '}
          <Link
            to="/login"
            className="font-medium text-brand hover:underline"
          >
            Kirish
          </Link>
        </p>
      </div>
    </div>
  );
}
