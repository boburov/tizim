import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, LogOut, Rocket } from 'lucide-react';
import { customerApi } from '../api/customerClient';
import { useAuth } from '../../context/AuthContext';

const STATUS_LABELS = {
  DRAFT: 'Qoralama',
  PROVISIONING: 'Tayyorlanmoqda',
  ACTIVE: 'Faol',
  FAILED: 'Xatolik',
  SUSPENDED: "To'xtatilgan",
  DEPROVISIONING: "O'chirilmoqda",
  DELETED: "O'chirilgan",
};

const STATUS_STYLES = {
  ACTIVE: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  PROVISIONING: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  FAILED: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300',
  SUSPENDED: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300',
};

export default function PortalHomePage() {
  const { customer, logout } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customerApi
      .get('/customer/tenants')
      .then((res) => setTenants(res.data))
      .catch(() => toast.error('Loyihalarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-primary-foreground">
              <Rocket size={18} />
            </div>
            <span className="font-semibold">Mening kabinetim</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">
                {customer?.fullName || customer?.email}
              </p>
              <p className="text-xs text-muted-foreground">{customer?.email}</p>
            </div>
            {customer?.avatarUrl && (
              <img
                src={customer.avatarUrl}
                alt=""
                className="size-9 rounded-full"
              />
            )}
            <button
              type="button"
              onClick={logout}
              title="Chiqish"
              className="rounded-lg border p-2 text-muted-foreground transition hover:bg-muted"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">Loyihalarim</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Yaratgan tizimlaringiz va ularning holati
        </p>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Yuklanmoqda…
          </p>
        ) : !tenants.length ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Hozircha loyihangiz yo'q
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tenants.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.domain}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_STYLES[t.status] || 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {STATUS_LABELS[t.status] || t.status}
                  </span>
                </div>

                {t.status === 'ACTIVE' && (
                  <a
                    href={`https://${t.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
                  >
                    Ochish
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
