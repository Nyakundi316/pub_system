import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Trash2, SlidersHorizontal } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useGet } from '../hooks/api';
import { useAuth } from '../store/auth';
import { PageHeader } from '../components/page';
import { Badge, Button, Field, Input, Modal, Select, Spinner, TabBar, EmptyState } from '../components/ui';
import { money, qty, dateTime } from '../lib/format';
import type { StockItem } from '../lib/types';

type Tab = 'stock' | 'low' | 'over' | 'movements' | 'wastage';
interface Movement { id: number; movementType: string; quantity: number; createdAt: string; stockItem: { name: string; unit: string }; user?: { name: string } }
interface WastageRow { id: number; quantity: number; reason: string; createdAt: string; stockItem: { name: string; unit: string }; user?: { name: string } }

export default function Inventory() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [tab, setTab] = useState<Tab>('stock');
  const [search, setSearch] = useState('');
  const [wasteFor, setWasteFor] = useState<StockItem | null>(null);
  const [adjustFor, setAdjustFor] = useState<StockItem | null>(null);

  const statusParam = tab === 'low' ? 'low' : tab === 'over' ? 'over' : undefined;
  const stock = useGet<StockItem[]>('/stock-items', { status: statusParam, search: search || undefined }, { enabled: ['stock', 'low', 'over'].includes(tab) });
  const movements = useGet<Movement[]>('/stock-movements', undefined, { enabled: tab === 'movements' });
  const wastage = useGet<WastageRow[]>('/wastage', undefined, { enabled: tab === 'wastage' });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['/stock-items', { status: undefined, search: undefined }] });
    qc.invalidateQueries({ queryKey: ['/stock-items', { status: statusParam, search: search || undefined }] });
    qc.invalidateQueries({ queryKey: ['/stock-movements', {}] });
    qc.invalidateQueries({ queryKey: ['/wastage', {}] });
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Live stock levels, the movement ledger and shrinkage"
        actions={can('inventory.count') && <Button variant="outline"><PackagePlus size={16} /> New stock count</Button>}
      />
      <div className="px-5 md:px-8">
        <TabBar
          active={tab}
          onChange={(t) => setTab(t)}
          tabs={[
            { key: 'stock', label: 'Current stock' },
            { key: 'low', label: 'Low' },
            { key: 'over', label: 'Over' },
            { key: 'movements', label: 'Movements' },
            { key: 'wastage', label: 'Wastage' },
          ]}
        />
      </div>

      <div className="p-5 md:p-8">
        {['stock', 'low', 'over'].includes(tab) && (
          <>
            <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
            {stock.isLoading ? (
              <Spinner label="Loading stock…" />
            ) : (stock.data ?? []).length === 0 ? (
              <EmptyState title={tab === 'low' ? 'Nothing below reorder point' : tab === 'over' ? 'Nothing overstocked' : 'No items'} />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 text-right">On hand</th>
                      <th className="px-4 py-3 text-right">Reorder / Par</th>
                      <th className="px-4 py-3 text-right">Value</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {stock.data!.map((s) => (
                      <tr key={s.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-chalk-500">{s.sku} · {s.supplier?.name ?? 'No supplier'}</div>
                        </td>
                        <td className="px-4 py-3 text-chalk-500">{s.category ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={s.low ? 'text-amber-400' : ''}>{qty(s.currentStock)} {s.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-chalk-500">{qty(s.reorderPoint)} / {qty(s.parLevel)}</td>
                        <td className="px-4 py-3 text-right">{money(s.currentStock * s.costPrice)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {can('inventory.wastage') && <button title="Record wastage" onClick={() => setWasteFor(s)} className="rounded-md p-1.5 text-chalk-500 hover:bg-white/5 hover:text-pour-red"><Trash2 size={15} /></button>}
                            {can('inventory.adjust') && <button title="Adjust" onClick={() => setAdjustFor(s)} className="rounded-md p-1.5 text-chalk-500 hover:bg-white/5"><SlidersHorizontal size={15} /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'movements' && (
          movements.isLoading ? <Spinner /> : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
                  <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">By</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(movements.data ?? []).map((m) => (
                    <tr key={m.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-chalk-500">{dateTime(m.createdAt)}</td>
                      <td className="px-4 py-3">{m.stockItem.name}</td>
                      <td className="px-4 py-3"><Badge tone={m.quantity < 0 ? 'red' : 'green'}>{m.movementType.replaceAll('_', ' ').toLowerCase()}</Badge></td>
                      <td className={`px-4 py-3 text-right ${m.quantity < 0 ? 'text-pour-red' : 'text-pour-green'}`}>{m.quantity > 0 ? '+' : ''}{qty(m.quantity)} {m.stockItem.unit}</td>
                      <td className="px-4 py-3 text-chalk-500">{m.user?.name ?? 'system'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'wastage' && (
          wastage.isLoading ? <Spinner /> : (wastage.data ?? []).length === 0 ? <EmptyState title="No wastage recorded" /> : (
            <div className="card divide-y divide-white/5">
              {wastage.data!.map((w) => (
                <div key={w.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{w.stockItem.name} · {qty(w.quantity)} {w.stockItem.unit}</p>
                    <p className="text-xs text-chalk-500">{w.reason} — {w.user?.name} · {dateTime(w.createdAt)}</p>
                  </div>
                  <Badge tone="red">wastage</Badge>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {wasteFor && <WastageModal item={wasteFor} onClose={() => setWasteFor(null)} onDone={() => { setWasteFor(null); refresh(); }} />}
      {adjustFor && <AdjustModal item={adjustFor} onClose={() => setAdjustFor(null)} onDone={() => { setAdjustFor(null); refresh(); }} />}
    </div>
  );
}

function WastageModal({ item, onClose, onDone }: { item: StockItem; onClose: () => void; onDone: () => void }) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const m = useMutation({ mutationFn: () => api.post('/wastage', { stockItemId: item.id, quantity, reason }), onSuccess: onDone });
  return (
    <Modal open onClose={onClose} title={`Record wastage · ${item.name}`}>
      <div className="space-y-4">
        <Field label={`Quantity (${item.unit})`}><Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></Field>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Breakage, spillage, expiry…" /></Field>
        {m.isError && <p className="text-xs text-pour-red">{apiError(m.error)}</p>}
        <Button className="w-full" variant="danger" loading={m.isPending} disabled={!reason || quantity <= 0} onClick={() => m.mutate()}>Record wastage</Button>
      </div>
    </Modal>
  );
}

function AdjustModal({ item, onClose, onDone }: { item: StockItem; onClose: () => void; onDone: () => void }) {
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/stock-items/${item.id}/adjust`, { quantity: direction === 'add' ? amount : -amount, reason }),
    onSuccess: onDone,
  });
  return (
    <Modal open onClose={onClose} title={`Adjust stock · ${item.name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}>
            <option value="add">Add</option>
            <option value="remove">Remove</option>
          </Select>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Found stock, correction…" /></Field>
        <p className="text-xs text-chalk-500">Current on hand: {qty(item.currentStock)} {item.unit}</p>
        {m.isError && <p className="text-xs text-pour-red">{apiError(m.error)}</p>}
        <Button className="w-full" loading={m.isPending} disabled={!reason || amount <= 0} onClick={() => m.mutate()}>Post adjustment</Button>
      </div>
    </Modal>
  );
}
