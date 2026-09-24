import { useState } from 'react';
import { useGet } from '../hooks/api';
import { PageHeader } from '../components/page';
import { Badge, EmptyState, Spinner, TabBar } from '../components/ui';
import { money, dateShort } from '../lib/format';

type Tab = 'suppliers' | 'orders' | 'received';
interface Supplier { id: number; name: string; contactPerson: string | null; phone: string | null; leadTimeDays: number; paymentTerms: string | null; _count: { stockItems: number } }
interface PO { id: number; supplier: { name: string }; orderDate: string; expectedDate: string | null; status: string; totalAmount: number; _count: { items: number } }
interface GRN { id: number; supplier: { name: string }; receivedDate: string; invoiceNo: string | null; totalAmount: number; receivedBy: { name: string }; _count: { items: number } }

const PO_TONE: Record<string, 'amber' | 'green' | 'blue' | 'neutral'> = { ORDERED: 'amber', PARTIAL: 'blue', RECEIVED: 'green', DRAFT: 'neutral', CANCELLED: 'red' as never };

export default function Purchasing() {
  const [tab, setTab] = useState<Tab>('orders');
  const suppliers = useGet<Supplier[]>('/suppliers', undefined, { enabled: tab === 'suppliers' });
  const orders = useGet<PO[]>('/purchase-orders', undefined, { enabled: tab === 'orders' });
  const received = useGet<GRN[]>('/goods-received', undefined, { enabled: tab === 'received' });

  return (
    <div>
      <PageHeader title="Purchasing" subtitle="Suppliers, orders and deliveries" />
      <div className="px-5 md:px-8">
        <TabBar active={tab} onChange={setTab} tabs={[{ key: 'orders', label: 'Purchase orders' }, { key: 'received', label: 'Goods received' }, { key: 'suppliers', label: 'Suppliers' }]} />
      </div>
      <div className="p-5 md:p-8">
        {tab === 'orders' && (orders.isLoading ? <Spinner /> : (orders.data ?? []).length === 0 ? <EmptyState title="No purchase orders" /> : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
                <tr><th className="px-4 py-3">PO</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Ordered</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.data!.map((po) => (
                  <tr key={po.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium">#{po.id}<span className="ml-1 text-xs text-chalk-500">· {po._count.items} lines</span></td>
                    <td className="px-4 py-3">{po.supplier.name}</td>
                    <td className="px-4 py-3 text-chalk-500">{dateShort(po.orderDate)}</td>
                    <td className="px-4 py-3 text-chalk-500">{po.expectedDate ? dateShort(po.expectedDate) : '—'}</td>
                    <td className="px-4 py-3"><Badge tone={PO_TONE[po.status] ?? 'neutral'}>{po.status.toLowerCase()}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold">{money(po.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'received' && (received.isLoading ? <Spinner /> : (received.data ?? []).length === 0 ? <EmptyState title="No deliveries logged" /> : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
                <tr><th className="px-4 py-3">GRN</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">By</th><th className="px-4 py-3 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {received.data!.map((g) => (
                  <tr key={g.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium">#{g.id}<span className="ml-1 text-xs text-chalk-500">· {g._count.items} lines</span></td>
                    <td className="px-4 py-3">{g.supplier.name}</td>
                    <td className="px-4 py-3 text-chalk-500">{dateShort(g.receivedDate)}</td>
                    <td className="px-4 py-3 text-chalk-500">{g.invoiceNo ?? '—'}</td>
                    <td className="px-4 py-3 text-chalk-500">{g.receivedBy.name}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(g.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'suppliers' && (suppliers.isLoading ? <Spinner /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(suppliers.data ?? []).map((s) => (
              <div key={s.id} className="card p-4">
                <p className="font-semibold">{s.name}</p>
                <p className="mt-1 text-sm text-chalk-500">{s.contactPerson ?? 'No contact'} · {s.phone ?? '—'}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-chalk-500">
                  <Badge tone="blue">{s.leadTimeDays}d lead</Badge>
                  <span>{s.paymentTerms ?? 'Terms n/a'}</span>
                  <span className="ml-auto">{s._count.stockItems} items</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
