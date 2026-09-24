import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, LogOut, Search, Bell, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { NAV } from './nav';
import { cx } from '../ui';

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500 font-bold text-ink-900">CT</div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">The Copper Tap</p>
        <p className="text-[11px] text-chalk-500">Riverside · Nairobi</p>
      </div>
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const can = useAuth((s) => s.can);
  const visible = NAV.filter((n) => n.anyOf.length === 0 || can(...n.anyOf));
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {visible.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-amber-500/10 text-amber-400' : 'text-chalk-300 hover:bg-white/5 hover:text-chalk-100',
            )
          }
        >
          <Icon size={18} className="shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function StatusBar({ online }: { online: boolean }) {
  const [now, setNow] = useState(new Date());
  const user = useAuth((s) => s.user);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  return (
    <footer className="flex items-center justify-between border-t border-white/5 bg-ink-800/60 px-4 py-1.5 text-[11px] text-chalk-500">
      <div className="flex items-center gap-4">
        <span className={cx('flex items-center gap-1', online ? 'text-pour-green' : 'text-pour-red')}>
          {online ? <Wifi size={12} /> : <WifiOff size={12} />}
          {online ? 'Connected' : 'Offline'}
        </span>
        <span className="hidden sm:inline">Synced just now</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{user?.name} · {user?.roleName}</span>
        <span>{now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clear } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    const socket = getSocket();
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    setOnline(socket.connected);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
    };
  }, []);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* stateless — ignore */
    }
    clear();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-ink-900">
      {/* Sidebar — persistent on desktop, drawer on mobile */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-ink-800/40 py-4 lg:flex">
        <Brand />
        <div className="mt-6 flex-1 overflow-y-auto">
          <SideNav />
        </div>
        <button onClick={logout} className="mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-chalk-500 hover:bg-white/5 hover:text-chalk-100">
          <LogOut size={18} /> Sign out
        </button>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="absolute inset-y-0 left-0 flex w-64 animate-slide-up flex-col border-r border-white/5 bg-ink-800 py-4" onClick={(e) => e.stopPropagation()}>
            <Brand />
            <div className="mt-6 flex-1 overflow-y-auto">
              <SideNav onNavigate={() => setDrawer(false)} />
            </div>
            <button onClick={logout} className="mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-chalk-500 hover:bg-white/5">
              <LogOut size={18} /> Sign out
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/5 bg-ink-800/40 px-4 py-3">
          <button className="rounded-lg p-2 text-chalk-300 hover:bg-white/5 lg:hidden" onClick={() => setDrawer(true)}>
            <Menu size={20} />
          </button>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-chalk-500" />
            <input placeholder="Search drinks, tabs, customers…" className="input-field pl-9" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative rounded-lg p-2 text-chalk-300 hover:bg-white/5">
              <Bell size={18} />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
            </button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-600 text-sm font-semibold text-amber-400">
              {user?.name?.[0] ?? '?'}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
        <StatusBar online={online} />
      </div>
    </div>
  );
}
