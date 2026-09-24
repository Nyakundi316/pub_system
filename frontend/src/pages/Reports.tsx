import { useState } from 'react';
import { Bar, BarChart, Cell as RCell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Printer } from 'lucide-react';
import { useGet } from '../hooks/api';
import { PageHeader, Panel, StatTile } from '../components/page';
import { Button, EmptyState, Field, Input, Spinner, cx } from '../components/ui';
import { money, pct, qty, shortMoney } from '../lib/format';

type ReportKind = 'sales' | 'ranking' | 'profitability' | 'stock' | 'cash' | 'tax';
const KINDS: { key: ReportKind; label: string }[] = [
  { key: 'sales', label: 'Sales & P&L' },
  { key: 'ranking', label: 'Top & bottom' },
  { key: 'profitability', label: 'Profitability' },
  { key: 'stock', label: 'Stock' },
  { key: 'cash', label: 'Cash variance' },
  { key: 'tax', label: 'Tax' },
];
const PIE = ['#f0b429', '#3fb57f', '#5b8def', '#e5604d', '#b97e0a', '#8f897c'];

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const body = rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','));
  return [headers.join(','), ...body].join('\n');
}
function download(name: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [kind, setKind] = useState<ReportKind>('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = { from: from || undefined, to: to || undefined };
  let exportRows: Record<string, unknown>[] = [];

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        subtitle="Sales, profit, stock and cash — for any window"
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>
            <Button variant="subtle" onClick={() => download(`${kind}-report.csv`, exportRows)}><Download size={16} /> CSV</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-2 border-b border-white/5 px-5 py-4 md:px-8">
        <div className="mr-auto flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button key={k.key} onClick={() => setKind(k.key)} className={cx('rounded-lg px-3 py-1.5 text-sm font-medium', kind === k.key ? 'bg-amber-500/15 text-amber-400' : 'text-chalk-300 hover:bg-white/5')}>
              {k.label}
            </button>
          ))}
        </div>
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <div className="p-5 md:p-8">
        {kind === 'sales' && <SalesReport params={params} onRows={(r) => (exportRows = r)} />}
        {kind === 'ranking' && <Ranking params={params} onRows={(r) => (exportRows = r)} />}
        {kind === 'profitability' && <Profitability params={params} onRows={(r) => (exportRows = r)} />}
        {kind === 'stock' && <StockReport onRows={(r) => (exportRows = r)} />}
        {kind === 'cash' && <CashVariance params={params} onRows={(r) => (exportRows = r)} />}
        {kind === 'tax' && <TaxReport params={params} />}
      </div>
    </div>
  );
}

type P = { params: Record<string, string | undefined>; onRows: (r: Record<string, unknown>[]) => void };

function SalesReport({ params, onRows }: P) {
  const r = useGet<{ salesByDay: { date: string; sales: number }[]; salesByPaymentMethod: Record<string, number>; tax: number; profitAndLoss: { netSales: number; cogs: number; grossProfit: number; operatingExpenses: number; netProfit: number; grossMarginPct: number; netMarginPct: number } }>('/reports/sales', params);
  if (r.isLoading || !r.data) return <Spinner />;
  const pl = r.data.profitAndLoss;
  onRows(r.data.salesByDay);
  const methods = Object.entries(r.data.salesByPaymentMethod).map(([name, value]) => ({ name, value }));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Net sales" value={money(pl.netSales)} />
        <StatTile label="Gross profit" value={money(pl.grossProfit)} delta={pct(pl.grossMarginPct) + ' margin'} tone="green" />
        <StatTile label="Operating expenses" value={money(pl.operatingExpenses)} />
        <StatTile label="Net profit" value={money(pl.netProfit)} delta={pct(pl.netMarginPct) + ' net margin'} tone={pl.netProfit >= 0 ? 'green' : 'red'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Daily sales">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.data.salesByDay.map((d) => ({ ...d, label: d.date.slice(5) }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: '#8f897c', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tickFormatter={(v) => shortMoney(v).replace('KES ', '')} tick={{ fill: '#8f897c', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip contentStyle={{ background: '#16191c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }} formatter={(v: number) => [money(v), 'Sales']} />
                <Bar dataKey="sales" fill="#f0b429" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Payment mix">
          {methods.length === 0 ? <EmptyState title="No payments" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={methods} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {methods.map((_, i) => <RCell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#16191c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }} formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Ranking({ params, onRows }: P) {
  const top = useGet<{ rows: RankRow[] }>('/reports/top-drinks', { ...params, by: 'revenue', limit: '10' });
  const bottom = useGet<{ rows: RankRow[] }>('/reports/bottom-drinks', { ...params, limit: '10' });
  if (top.isLoading || bottom.isLoading) return <Spinner />;
  onRows((top.data?.rows ?? []) as unknown as Record<string, unknown>[]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Top 10 by revenue">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={(top.data?.rows ?? []).slice(0, 8)} margin={{ left: 8, right: 12 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#cfc9bd', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#16191c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }} formatter={(v: number) => money(v)} />
              <Bar dataKey="revenue" fill="#3fb57f" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Bottom 10 — slow & dead stock">
        <RankTable rows={bottom.data?.rows ?? []} />
      </Panel>
    </div>
  );
}

interface RankRow { productId: number; name: string; units: number; revenue: number; grossProfit: number; marginPct: number }
function RankTable({ rows }: { rows: RankRow[] }) {
  if (rows.length === 0) return <EmptyState title="Nothing to show" />;
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
        <tr><th className="py-2 pr-3">Product</th><th className="py-2 pr-3 text-right">Units</th><th className="py-2 pr-3 text-right">Revenue</th><th className="py-2 text-right">Margin</th></tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {rows.map((r) => (
          <tr key={r.productId}><td className="py-2 pr-3">{r.name}</td><td className="py-2 pr-3 text-right">{qty(r.units)}</td><td className="py-2 pr-3 text-right">{money(r.revenue)}</td><td className="py-2 text-right">{pct(r.marginPct)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Profitability({ params, onRows }: P) {
  const r = useGet<{ rows: RankRow[] }>('/reports/profitability', params);
  if (r.isLoading) return <Spinner />;
  onRows((r.data?.rows ?? []) as unknown as Record<string, unknown>[]);
  return <Panel title="Gross profit by product"><RankTable rows={r.data?.rows ?? []} /></Panel>;
}

function StockReport({ onRows }: { onRows: (r: Record<string, unknown>[]) => void }) {
  const r = useGet<{ valuation: number; itemCount: number; lowStock: StockRow[]; overStock: StockRow[] }>('/reports/stock');
  if (r.isLoading || !r.data) return <Spinner />;
  onRows(r.data.lowStock as unknown as Record<string, unknown>[]);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Stock valuation" value={money(r.data.valuation)} />
        <StatTile label="Items tracked" value={String(r.data.itemCount)} />
        <StatTile label="Low / over" value={`${r.data.lowStock.length} / ${r.data.overStock.length}`} tone="amber" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Below reorder point"><StockList rows={r.data.lowStock} /></Panel>
        <Panel title="Overstocked"><StockList rows={r.data.overStock} /></Panel>
      </div>
    </div>
  );
}
interface StockRow { id: number; name: string; currentStock: number; reorderPoint: number; parLevel: number; unit: string; costPrice: number }
const StockList = ({ rows }: { rows: StockRow[] }) =>
  rows.length === 0 ? <EmptyState title="Nothing here" /> : (
    <ul className="divide-y divide-white/5">
      {rows.map((s) => (
        <li key={s.id} className="flex items-center justify-between py-2 text-sm">
          <span>{s.name}</span>
          <span className="text-chalk-500">{qty(s.currentStock)} {s.unit}</span>
        </li>
      ))}
    </ul>
  );

function CashVariance({ params, onRows }: P) {
  const r = useGet<{ rows: { shiftId: number; cashier: string; endTime: string; openingFloat: number; closingCash: number; variance: number }[] }>('/reports/cash-variance', params);
  if (r.isLoading) return <Spinner />;
  onRows((r.data?.rows ?? []) as unknown as Record<string, unknown>[]);
  if (!r.data?.rows.length) return <EmptyState title="No closed shifts in range" />;
  return (
    <Panel title="Cash variance by shift">
      <table className="w-full text-sm">
        <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
          <tr><th className="py-2 pr-3">Shift</th><th className="py-2 pr-3">Cashier</th><th className="py-2 pr-3 text-right">Float</th><th className="py-2 pr-3 text-right">Counted</th><th className="py-2 text-right">Variance</th></tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {r.data.rows.map((row) => (
            <tr key={row.shiftId}>
              <td className="py-2 pr-3">#{row.shiftId}</td>
              <td className="py-2 pr-3">{row.cashier}</td>
              <td className="py-2 pr-3 text-right">{money(row.openingFloat)}</td>
              <td className="py-2 pr-3 text-right">{money(row.closingCash)}</td>
              <td className={cx('py-2 text-right', Math.abs(row.variance) < 1 ? 'text-pour-green' : 'text-pour-red')}>{money(row.variance, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function TaxReport({ params }: { params: Record<string, string | undefined> }) {
  const r = useGet<{ taxCollected: number; netSales: number }>('/reports/tax', params);
  if (r.isLoading || !r.data) return <Spinner />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatTile label="Tax collected (VAT 16%)" value={money(r.data.taxCollected)} tone="amber" />
      <StatTile label="Net sales (ex-tax)" value={money(r.data.netSales)} />
    </div>
  );
}
