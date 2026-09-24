import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, PackagePlus, ClipboardList, TrendingUp, Wine } from 'lucide-react';
import { useGet } from '../hooks/api';
import { useAuth } from '../store/auth';
import { PageHeader, Panel, StatTile } from '../components/page';
import { Badge, Button, EmptyState, Spinner } from '../components/ui';
import { money, shortMoney, pct, dateShort, qty } from '../lib/format';
import type { Recommendation } from '../lib/types';

interface Kpis { todaySales: number; grossProfit: number; grossMarginPct: number; cashOnHand: number; transactions: number; openShifts: number }
interface Alerts { lowStockCount: number; lowStock: { id: number; name: string; currentStock: number; reorderPoint: number; unit: string }[]; openTabs: number; pendingPurchaseOrders: number; expiringSoon: number }
interface TopDrinks { rows: { productId: number; name: string; units: number; revenue: number; grossProfit: number; marginPct: number }[] }
interface SalesReport { salesByDay: { date: string; sales: number; transactions: number }[] }

const ACTION_TONE: Record<string, 'red' | 'amber' | 'green' | 'blue'> = {
  URGENT_REORDER: 'red', INVESTIGATE_VARIANCE: 'red', DISCONTINUE: 'amber',
  USE_FIRST_NEAR_EXPIRY: 'amber', REDUCE_ORDERS: 'blue', REVIEW_PRICE_OR_SUPPLIER: 'blue',
  INCREASE_AND_PROMOTE: 'green', PROMOTE_OR_BUNDLE: 'green',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const can = useAuth((s) => s.can);
  const kpis = useGet<Kpis>('/dashboard/kpis');
  const alerts = useGet<Alerts>('/dashboard/alerts');
  const top = useGet<TopDrinks>('/reports/top-drinks', { by: 'revenue', limit: 5 });
  const sales = useGet<SalesReport>('/reports/sales');
  const recs = useGet<{ recommendations: Recommendation[] }>('/dashboard/recommendations', undefined, { enabled: can('recommendations.view') });

  const trend = (sales.data?.salesByDay ?? []).map((d) => ({ ...d, label: dateShort(d.date) }));

  return (
    <div>
      <PageHeader
        title="Tonight at a glance"
        subtitle={new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <>
            {can('sales.create') && <Button onClick={() => navigate('/pos')}><Wine size={16} /> New sale</Button>}
            {can('inventory.count') && <Button variant="outline" onClick={() => navigate('/inventory')}><ClipboardList size={16} /> Stock count</Button>}
          </>
        }
      />

      <div className="space-y-6 p-5 md:p-8">
        {/* KPIs — first tile wider for emphasis (intentionally asymmetric) */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile className="sm:col-span-2 xl:col-span-1" label="Today's sales" value={kpis.data ? money(kpis.data.todaySales) : '—'} delta={`${kpis.data?.transactions ?? 0} transactions`} />
          <StatTile label="Gross profit" value={kpis.data ? money(kpis.data.grossProfit) : '—'} delta={kpis.data ? pct(kpis.data.grossMarginPct) + ' margin' : undefined} tone="green" />
          <StatTile label="Cash on hand" value={kpis.data ? money(kpis.data.cashOnHand) : '—'} delta={`${kpis.data?.openShifts ?? 0} open shift(s)`} />
          <StatTile label="Alerts" value={alerts.data ? alerts.data.lowStockCount + alerts.data.expiringSoon : '—'} delta={alerts.data ? `${alerts.data.lowStockCount} low · ${alerts.data.expiringSoon} expiring` : undefined} tone="amber" />
        </div>

        {/* Trend + top sellers */}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Panel title="Sales · last 30 days">
            {sales.isLoading ? (
              <Spinner label="Loading trend…" />
            ) : trend.length === 0 ? (
              <EmptyState title="No sales yet" hint="Ring up a round in the POS to see the trend build." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pour" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f0b429" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f0b429" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fill: '#8f897c', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickFormatter={(v) => shortMoney(v).replace('KES ', '')} tick={{ fill: '#8f897c', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip
                      contentStyle={{ background: '#16191c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#f4f1ea' }}
                      formatter={(v: number) => [money(v), 'Sales']}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#f0b429" strokeWidth={2} fill="url(#pour)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Top sellers" action={<Badge tone="amber">by revenue</Badge>}>
            <ol className="space-y-1">
              {(top.data?.rows ?? []).map((row, i) => (
                <li key={row.productId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-ink-700 text-xs font-semibold text-amber-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-chalk-500">{qty(row.units)} sold · {pct(row.marginPct)} margin</p>
                  </div>
                  <span className="text-sm font-semibold">{money(row.revenue)}</span>
                </li>
              ))}
              {top.data?.rows.length === 0 && <EmptyState title="Nothing sold yet" />}
            </ol>
          </Panel>
        </div>

        {/* Alerts + recommendations */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Low stock" action={<Button variant="ghost" onClick={() => navigate('/inventory')} className="text-xs"><PackagePlus size={14} /> Reorder</Button>}>
            {(alerts.data?.lowStock ?? []).length === 0 ? (
              <EmptyState title="Everything's above reorder point" />
            ) : (
              <ul className="divide-y divide-white/5">
                {alerts.data!.lowStock.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-400" />
                      <span className="text-sm">{s.name}</span>
                    </div>
                    <span className="text-xs text-chalk-500">{qty(s.currentStock)} / {qty(s.reorderPoint)} {s.unit}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Stock recommendations" action={<Badge tone="green"><TrendingUp size={12} /></Badge>}>
            {!can('recommendations.view') ? (
              <EmptyState title="Not available for your role" />
            ) : (recs.data?.recommendations ?? []).length === 0 ? (
              <EmptyState title="No actions right now" hint="The engine runs over the last 30 days of movement." />
            ) : (
              <ul className="space-y-2">
                {recs.data!.recommendations.slice(0, 5).map((r, i) => (
                  <li key={`${r.itemId}-${i}`} className="rounded-lg border border-white/5 bg-ink-900/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <Badge tone={ACTION_TONE[r.action] ?? 'neutral'}>{r.action.replaceAll('_', ' ').toLowerCase()}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-chalk-500">{r.reason}</p>
                    {r.suggestedOrderQty ? <p className="mt-1 text-xs text-amber-400">Suggested order: {qty(r.suggestedOrderQty)}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
