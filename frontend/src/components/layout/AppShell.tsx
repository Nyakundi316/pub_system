import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, LogOut, Search, Bell, Wifi, WifiOff, CloudUpload, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useOutbox, startOutboxSync, flushOutbox, retryQueued, discardQueued } from '../../lib/outbox';
import { money } from '../../lib/format';
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

function sinceLabel(then: Date, now: Date) {
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  return mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `at ${then.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}`;
}

/** What the till's offline queue is doing, and a way to deal with anything the server bounced. */
function SyncStatus({ now }: { now: Date }) {
  const { entries, syncing, lastSyncedAt } = useOutbox();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<string | null>(null); // Discard takes two taps — it throws a sale away
  const pending = entries.filter((e) => e.state === 'pending').length;
  const failed = entries.filter((e) => e.state === 'failed');

  useEffect(() => {
    if (!failed.length) setOpen(false);
  }, [failed.length]);

  return (
    <div className="relative flex items-center gap-3">
      {pending > 0 ? (
        <button onClick={() => flushOutbox()} className="flex items-center gap-1 text-amber-400 hover:text-amber-300" title="Sync now">
          {syncing ? <RefreshCw size={12} className="animate-spin" /> : <CloudUpload size={12} />}
          {pending} {pending === 1 ? 'sale' : 'sales'} waiting to sync
        </button>
      ) : (
        <span className="hidden sm:inline">{lastSyncedAt ? `Synced ${sinceLabel(lastSyncedAt, now)}` : 'All sales synced'}</span>
      )}

      {failed.length > 0 && (
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded bg-pour-red/15 px-1.5 py-0.5 font-medium text-pour-red">
          <AlertTriangle size={12} /> {failed.length} need attention
        </button>
      )}

      {open && (
        <div className="absolute bottom-7 left-0 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-ink-800 p-3 text-xs text-chalk-300 shadow-rail animate-slide-up">
          <p className="mb-2 text-chalk-500">
            These offline sales were rejected when they synced, so they're not in the books or the stock count yet.
          </p>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {failed.map((e) => (
              <li key={e.clientRef} className="rounded-lg bg-ink-900/60 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-chalk-100">{money(e.total, true)}</span>
                  <span className="text-chalk-500">
                    {new Date(e.payload.soldAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    {e.payload.payments ? ' · paid' : ' · to bar'}
                    {e.payload.tabId ? ` · Tab #${e.payload.tabId}` : ''}
                  </span>
                </div>
                <p className="mt-1 text-pour-red">{e.error}</p>
                <div className="mt-2 flex justify-end gap-3">
                  <button
                    onClick={() => (armed === e.clientRef ? discardQueued(e.clientRef) : setArmed(e.clientRef))}
                    onBlur={() => setArmed(null)}
                    className={armed === e.clientRef ? 'font-medium text-pour-red' : 'text-chalk-500 hover:text-pour-red'}
                  >
                    {armed === e.clientRef ? 'Tap again to discard' : 'Discard'}
                  </button>
                  <button onClick={() => retryQueued(e.clientRef)} className="font-medium text-amber-400 hover:text-amber-300">Retry</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
        <SyncStatus now={now} />
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
  useEffect(() => startOutboxSync(), []);

  useEffect(() => {
    const socket = getSocket();
    const up = () => {
      setOnline(true);
      void flushOutbox(); // the API is back — don't wait for the heartbeat
    };
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
