import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  Plus,
  LogOut,
  ShieldCheck,
  Settings,
  CreditCard,
  BarChart3,
  Plug,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import { cn } from '../lib/utils';

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
      isActive
        ? 'bg-brand text-primary-foreground'
        : 'text-muted-foreground hover:bg-muted',
    );

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-border bg-card p-4">
        <div className="mb-6 flex items-center gap-2 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-primary-foreground">
            <ShieldCheck size={20} />
          </div>
          <span className="font-semibold">Admin Panel</span>
        </div>

        <nav className="flex-1 space-y-1">
          <NavLink to="/" end className={linkClass}>
            <LayoutGrid size={18} /> Loyihalar
          </NavLink>
          <NavLink to="/tenants/new" className={linkClass}>
            <Plus size={18} /> Yangi loyiha
          </NavLink>
          <NavLink to="/usage" className={linkClass}>
            <BarChart3 size={18} /> Foydalanish
          </NavLink>
          <NavLink to="/plans" className={linkClass}>
            <CreditCard size={18} /> Tariflar
          </NavLink>
          <NavLink to="/api-services" className={linkClass}>
            <Plug size={18} /> API xizmatlar
          </NavLink>
          {user?.role === 'SUPER_ADMIN' && (
            <NavLink to="/settings" className={linkClass}>
              <Settings size={18} /> Sozlamalar
            </NavLink>
          )}
        </nav>

        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <div className="min-w-0 text-xs text-muted-foreground">
              <div className="truncate font-medium text-foreground">
                {user?.email}
              </div>
              <div>{user?.role}</div>
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={doLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
          >
            <LogOut size={18} /> Chiqish
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-background p-6">
        <Outlet />
      </main>
    </div>
  );
}
