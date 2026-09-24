import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlayCircle, StopCircle, FileText } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useGet } from '../hooks/api';
import { useAuth } from '../store/auth';
import { PageHeader, Panel, StatTile } from '../components/page';
import { Badge, Button, EmptyState, Field, Input, Modal, Spinner } from '../components/ui';
import { money, dateTime } from '../lib/format';

interface Shift { id: number; userId: number; status: string; startTime: string; endTime: string | null; openingFloat: number; closingCash: number | null; variance: number | null; user: { name: string } }
interface ZReport {
  totals: { grossSales: number; cogs: number; grossProfit: number; expenses: number; transactions: number };
  salesByMethod: Record<string, number>;
  cash: { openingFloat: number; cashSales: number; cashIn: number; cashOut: number; expectedCash: number; countedCash: number | null; variance: number | null };
}

export default function Shifts() {
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const shifts = useGet<Shift[]>('/shifts', { mine: 'true' });
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState<Shift | null>(null);
  const [reportFor, setReportFor] = useState<number | null>(null);

  const mine = (shifts.data ?? []).find((s) => s.status === 'OPEN' && s.userId === user?.id);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['/shifts', { mine: 'true' }] });

  return (
    <div>
      <PageHeader
        title="Staff & shifts"
        subtitle="Drawer floats, cash counts and end-of-shift variance"
        actions={
          mine
            ? can('shifts.close') && <Button variant="danger" onClick={() => setClosing(mine)}><StopCircle size={16} /> Close my shift</Button>
            : can('shifts.open') && <Button onClick={() => setOpening(true)}><PlayCircle size={16} /> Open shift</Button>
        }
      />
      <div className="space-y-6 p-5 md:p-8">
        {mine && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="My shift" value={<Badge tone="green">open</Badge>} delta={`Started ${dateTime(mine.startTime)}`} />
            <StatTile label="Opening float" value={money(mine.openingFloat)} />
            <StatTile label="Cashier" value={mine.user.name} />
          </div>
        )}

        <Panel title="Recent shifts">
          {shifts.isLoading ? (
            <Spinner />
          ) : (shifts.data ?? []).length === 0 ? (
            <EmptyState title="No shifts yet" hint="Open a shift to start taking cash." />
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
                  <tr><th className="py-3 pr-4">Shift</th><th className="py-3 pr-4">Started</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4 text-right">Float</th><th className="py-3 pr-4 text-right">Variance</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {shifts.data!.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 font-medium">#{s.id}</td>
                      <td className="py-3 pr-4 text-chalk-500">{dateTime(s.startTime)}</td>
                      <td className="py-3 pr-4"><Badge tone={s.status === 'OPEN' ? 'green' : 'neutral'}>{s.status.toLowerCase()}</Badge></td>
                      <td className="py-3 pr-4 text-right">{money(s.openingFloat)}</td>
                      <td className="py-3 pr-4 text-right">
                        {s.variance == null ? '—' : <span className={Math.abs(s.variance) < 1 ? 'text-pour-green' : 'text-pour-red'}>{money(s.variance, true)}</span>}
                      </td>
                      <td className="py-3 text-right">
                        <button onClick={() => setReportFor(s.id)} className="rounded-md p-1.5 text-chalk-500 hover:bg-white/5" title="Z-report"><FileText size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {opening && <OpenShift onClose={() => setOpening(false)} onDone={() => { setOpening(false); invalidate(); }} />}
      {closing && <CloseShift shift={closing} onClose={() => setClosing(null)} onDone={() => { setClosing(null); invalidate(); }} />}
      {reportFor && <ZReportModal shiftId={reportFor} onClose={() => setReportFor(null)} />}
    </div>
  );
}

function OpenShift({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [float, setFloat] = useState(2000);
  const m = useMutation({ mutationFn: () => api.post('/shifts', { openingFloat: float }), onSuccess: onDone });
  return (
    <Modal open onClose={onClose} title="Open shift">
      <div className="space-y-4">
        <Field label="Opening float (cash in drawer)"><Input type="number" min={0} value={float} onChange={(e) => setFloat(Number(e.target.value))} /></Field>
        {m.isError && <p className="text-xs text-pour-red">{apiError(m.error)}</p>}
        <Button className="w-full" loading={m.isPending} onClick={() => m.mutate()}>Start shift</Button>
      </div>
    </Modal>
  );
}

function CloseShift({ shift, onClose, onDone }: { shift: Shift; onClose: () => void; onDone: () => void }) {
  const report = useGet<ZReport>(`/shifts/${shift.id}/z-report`);
  const [counted, setCounted] = useState<number | ''>('');
  const expected = report.data?.cash.expectedCash ?? 0;
  const variance = counted === '' ? null : Number(counted) - expected;
  const m = useMutation({ mutationFn: () => api.post(`/shifts/${shift.id}/close`, { closingCash: Number(counted) }), onSuccess: onDone });
  return (
    <Modal open onClose={onClose} title={`Close shift #${shift.id}`}>
      {report.isLoading ? <Spinner /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Cell label="Opening float" value={money(report.data!.cash.openingFloat)} />
            <Cell label="Cash sales" value={money(report.data!.cash.cashSales)} />
            <Cell label="Paid out" value={money(report.data!.cash.cashOut)} />
            <Cell label="Expected in drawer" value={money(expected, true)} strong />
          </div>
          <Field label="Counted cash"><Input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value === '' ? '' : Number(e.target.value))} autoFocus /></Field>
          {variance !== null && (
            <p className={`text-sm ${Math.abs(variance) < 1 ? 'text-pour-green' : 'text-pour-red'}`}>
              Variance: {money(variance, true)} {Math.abs(variance) < 1 ? '· balanced' : variance > 0 ? '· over' : '· short'}
            </p>
          )}
          {m.isError && <p className="text-xs text-pour-red">{apiError(m.error)}</p>}
          <Button className="w-full" variant="danger" loading={m.isPending} disabled={counted === ''} onClick={() => m.mutate()}>Close & post variance</Button>
        </div>
      )}
    </Modal>
  );
}

function ZReportModal({ shiftId, onClose }: { shiftId: number; onClose: () => void }) {
  const report = useGet<ZReport>(`/shifts/${shiftId}/z-report`);
  return (
    <Modal open onClose={onClose} title={`Z-report · shift #${shiftId}`} wide>
      {report.isLoading || !report.data ? <Spinner /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cell label="Gross sales" value={money(report.data.totals.grossSales)} strong />
            <Cell label="COGS" value={money(report.data.totals.cogs)} />
            <Cell label="Gross profit" value={money(report.data.totals.grossProfit)} />
            <Cell label="Transactions" value={String(report.data.totals.transactions)} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-chalk-500">Payments by method</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(report.data.salesByMethod).map(([m, v]) => <Cell key={m} label={m.replaceAll('_', ' ')} value={money(v)} />)}
              {Object.keys(report.data.salesByMethod).length === 0 && <p className="text-sm text-chalk-500">No payments.</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-chalk-500">Cash reconciliation</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Cell label="Expected" value={money(report.data.cash.expectedCash, true)} />
              <Cell label="Counted" value={report.data.cash.countedCash == null ? '—' : money(report.data.cash.countedCash, true)} />
              <Cell label="Variance" value={report.data.cash.variance == null ? '—' : money(report.data.cash.variance, true)} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

const Cell = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="rounded-lg bg-ink-900/50 p-3">
    <p className="text-xs capitalize text-chalk-500">{label}</p>
    <p className={strong ? 'mt-0.5 font-semibold text-amber-400' : 'mt-0.5 font-medium'}>{value}</p>
  </div>
);
