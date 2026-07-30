import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import GoogleButton from '../portal/components/GoogleButton';
import { googleLoginUrl } from '../portal/api/customerClient';

/**
 * YAGONA kirish sahifasi — super admin ham, mijoz ham shu yerdan kiradi.
 * Server kim ekanini o'zi aniqlaydi, App.jsx esa sessiya turiga qarab
 * tegishli panelni ko'rsatadi (bu yerda navigate qilinmaydi).
 */
export default function LoginPage() {
  const { login } = useAuth();
  const [params] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Google callback xato bilan qaytarsa — sababini ko'rsatamiz.
  useEffect(() => {
    const error = params.get('error');
    if (!error) return;
    toast.error(error === 'google' ? 'Google orqali kirishda xatolik' : error);
  }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('Xush kelibsiz!');
      // Yo'naltirishni App.jsx sessiyaga qarab o'zi qiladi.
    } catch (err) {
      toast.error(err.response?.data?.message || 'Kirishda xatolik');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      {/* Kirishdan oldin ham temani almashtira olsin */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-xl ring-1 ring-border">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-primary-foreground">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-xl font-semibold">Tizimga kirish</h1>
          <p className="text-sm text-muted-foreground">Hisobingiz bilan davom eting</p>
        </div>

        <GoogleButton href={googleLoginUrl()} label="Google bilan kirish" />

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-accent" />
          <span className="text-xs text-muted-foreground">yoki</span>
          <span className="h-px flex-1 bg-accent" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="siz@example.uz"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Parol
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-brand-dark disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Kirish
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Hisobingiz yo'qmi?{' '}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            Ro'yxatdan o'ting
          </Link>
        </p>
      </div>
    </div>
  );
}
