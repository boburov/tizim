import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
        ? 'bg-brand text-white'
        : 'text-slate-600 hover:bg-slate-100',
    );

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white p-4">
        <div className="mb-6 flex items-center gap-2 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
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
        </nav>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="mb-2 px-1 text-xs text-slate-500">
            <div className="font-medium text-slate-700">{user?.email}</div>
            <div>{user?.role}</div>
          </div>
          <button
            onClick={doLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} /> Chiqish
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-50 p-6">
        <Outlet />
      </main>
    </div>
  );
}
