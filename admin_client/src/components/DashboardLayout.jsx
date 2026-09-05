import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  Plus,
  LogOut,
  Settings,
  CreditCard,
  BarChart3,
  Server,
  Bot,
  Users,
  HardDrive,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import NesterLogo from './NesterLogo';
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
        {/* Logo brend rangli plitka ICHIDA emas: belgining o'zi binafsha
            gradient, indigo fon ustida u yo'qolib ketardi. */}
        <div className="mb-6 flex items-center gap-2.5 px-1">
          <NesterLogo size={34} className="shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="font-semibold">Nester</div>
            <div className="text-xs text-muted-foreground">Admin panel</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <NavLink to="/" end className={linkClass}>
            <LayoutGrid size={18} /> Loyihalar
          </NavLink>
          <NavLink to="/tenants/new" className={linkClass}>
            <Plus size={18} /> Yangi loyiha
          </NavLink>
          <NavLink to="/users" className={linkClass}>
            <Users size={18} /> Foydalanuvchilar
          </NavLink>
          <NavLink to="/vps" className={linkClass}>
            <HardDrive size={18} /> Serverlar (VPS)
          </NavLink>
          <NavLink to="/usage" className={linkClass}>
            <BarChart3 size={18} /> Foydalanish
          </NavLink>
          <NavLink to="/plans" className={linkClass}>
            <CreditCard size={18} /> Tariflar
          </NavLink>
          <NavLink to="/api-services" className={linkClass}>
            <Server size={18} /> API xizmatlar
          </NavLink>
          <NavLink to="/bots" className={linkClass}>
            <Bot size={18} /> Telegram botlar
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
