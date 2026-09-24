import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Star } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useGet } from '../hooks/api';
import { useAuth } from '../store/auth';
import { PageHeader } from '../components/page';
import { Button, EmptyState, Field, Input, Modal, Spinner } from '../components/ui';
import { money, dateShort, dateTime } from '../lib/format';

interface Customer { id: number; name: string; phone: string | null; email: string | null; loyaltyPoints: number; creditBalance: number }
interface CustomerDetail extends Customer {
  sales: { id: number; saleTime: string; totalAmount: number; items: { product: { name: string }; quantity: number }[] }[];
  loyaltyTransactions: { id: number; pointsEarned: number; pointsRedeemed: number; createdAt: string }[];
}

export default function Customers() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useGet<Customer[]>('/customers', { search: search || undefined });
  const detail = useGet<CustomerDetail>(`/customers/${openId}`, undefined, { enabled: openId !== null });

  return (
    <div>
      <PageHeader
        title="Customers & loyalty"
        subtitle="Regulars, points and running credit"
        actions={can('customers.manage') && <Button onClick={() => setAdding(true)}><UserPlus size={16} /> Add customer</Button>}
      />
      <div className="p-5 md:p-8">
        <Input placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
        {list.isLoading ? (
          <Spinner label="Loading customers…" />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState title="No customers yet" hint="Add regulars to track loyalty and credit." />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
                <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3 text-right">Points</th><th className="px-4 py-3 text-right">Credit</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {list.data!.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setOpenId(c.id)}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-chalk-500">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1 text-amber-400"><Star size={13} /> {c.loyaltyPoints}</span></td>
                    <td className="px-4 py-3 text-right">{c.creditBalance > 0 ? <span className="text-pour-red">{money(c.creditBalance)}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={openId !== null} onClose={() => setOpenId(null)} title={detail.data?.name ?? 'Customer'} wide>
        {detail.isLoading || !detail.data ? <Spinner /> : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-chalk-500">Recent visits</p>
              {detail.data.sales.length === 0 ? <p className="text-sm text-chalk-500">No purchases yet.</p> : (
                <ul className="space-y-2">
                  {detail.data.sales.map((s) => (
                    <li key={s.id} className="rounded-lg bg-ink-900/40 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span>{dateShort(s.saleTime)}</span>
                        <span className="font-semibold">{money(s.totalAmount)}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-chalk-500">{s.items.map((i) => `${i.quantity}× ${i.product.name}`).join(', ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-chalk-500">Loyalty · {detail.data.loyaltyPoints} pts</p>
              {detail.data.loyaltyTransactions.length === 0 ? <p className="text-sm text-chalk-500">No loyalty activity.</p> : (
                <ul className="space-y-1.5 text-sm">
                  {detail.data.loyaltyTransactions.map((t) => (
                    <li key={t.id} className="flex items-center justify-between">
                      <span className="text-chalk-500">{dateTime(t.createdAt)}</span>
                      <span className={t.pointsEarned ? 'text-pour-green' : 'text-pour-red'}>{t.pointsEarned ? `+${t.pointsEarned}` : `-${t.pointsRedeemed}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {adding && <AddCustomer onClose={() => setAdding(false)} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ['/customers', { search: search || undefined }] }); }} />}
    </div>
  );
}

function AddCustomer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const m = useMutation({ mutationFn: () => api.post('/customers', { name, phone: phone || undefined }), onSuccess: onDone });
  return (
    <Modal open onClose={onClose} title="Add customer">
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547…" /></Field>
        {m.isError && <p className="text-xs text-pour-red">{apiError(m.error)}</p>}
        <Button className="w-full" loading={m.isPending} disabled={!name} onClick={() => m.mutate()}>Save customer</Button>
      </div>
    </Modal>
  );
}
