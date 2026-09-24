import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Receipt } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useGet } from '../hooks/api';
import { useAuth } from '../store/auth';
import { PageHeader, Panel } from '../components/page';
import { Badge, Button, EmptyState, Spinner, cx } from '../components/ui';
import { money, timeShort } from '../lib/format';

interface TableRow { id: number; name: string; area: string | null; status: string; tabs: { id: number; openedBy?: { name: string } }[] }
interface TabRow { id: number; totalAmount: number; openedAt: string; table?: { name: string } | null; customer?: { name: string } | null; openedBy?: { name: string }; sales: { status: string }[] }

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: 'border-white/10 bg-ink-800/70',
  OCCUPIED: 'border-amber-500/40 bg-amber-500/5',
  RESERVED: 'border-pour-blue/40 bg-pour-blue/5',
  DIRTY: 'border-pour-red/30 bg-pour-red/5',
};

export default function Tables() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const tables = useGet<TableRow[]>('/tables');
  const tabs = useGet<TabRow[]>('/tabs', { status: 'OPEN' });

  const openTab = useMutation({
    mutationFn: (tableId: number) => api.post('/tabs', { tableId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/tables', {}] }); qc.invalidateQueries({ queryKey: ['/tabs', { status: 'OPEN' }] }); },
  });
  const closeTab = useMutation({
    mutationFn: (id: number) => api.patch(`/tabs/${id}`, { action: 'close' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/tables', {}] }); qc.invalidateQueries({ queryKey: ['/tabs', { status: 'OPEN' }] }); },
  });

  return (
    <div>
      <PageHeader title="Tables & tabs" subtitle="Open the floor, keep an eye on live tabs" />
      <div className="grid gap-6 p-5 md:p-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-chalk-300">Floor</h2>
          {tables.isLoading ? (
            <Spinner label="Loading floor…" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(tables.data ?? []).map((t) => {
                const openTabId = t.tabs[0]?.id;
                return (
                  <div key={t.id} className={cx('rounded-xl border p-4 transition', STATUS_TONE[t.status] ?? STATUS_TONE.AVAILABLE)}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-lg font-semibold">{t.name}</p>
                        <p className="text-xs text-chalk-500">{t.area ?? 'Floor'}</p>
                      </div>
                      <Badge tone={t.status === 'OCCUPIED' ? 'amber' : t.status === 'DIRTY' ? 'red' : t.status === 'RESERVED' ? 'blue' : 'neutral'}>
                        {t.status.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="mt-4">
                      {openTabId ? (
                        <span className="text-xs text-chalk-500">Tab #{openTabId} open</span>
                      ) : can('tables.manage') ? (
                        <Button variant="subtle" className="w-full text-xs" loading={openTab.isPending} onClick={() => openTab.mutate(t.id)}>
                          <DoorOpen size={14} /> Open tab
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <Panel title="Open tabs">
          {(tabs.data ?? []).length === 0 ? (
            <EmptyState icon={<Receipt size={24} />} title="No open tabs" />
          ) : (
            <ul className="divide-y divide-white/5">
              {tabs.data!.map((tab) => {
                const unpaid = tab.sales.filter((s) => s.status === 'OPEN').length;
                return (
                  <li key={tab.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Tab #{tab.id}{tab.table ? ` · ${tab.table.name}` : ''}</p>
                      <p className="text-xs text-chalk-500">
                        {tab.customer?.name ?? 'Walk-in'} · opened {timeShort(tab.openedAt)}
                        {unpaid > 0 && <span className="text-amber-400"> · {unpaid} unpaid</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{money(tab.totalAmount)}</span>
                      {can('tables.manage') && (
                        <Button variant="ghost" className="text-xs" disabled={unpaid > 0 || closeTab.isPending} onClick={() => closeTab.mutate(tab.id)}>
                          Close
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {closeTab.isError && <p className="mt-2 text-xs text-pour-red">{apiError(closeTab.error)}</p>}
        </Panel>
      </div>
    </div>
  );
}
