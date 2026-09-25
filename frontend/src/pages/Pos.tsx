import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Minus, Trash2, Send, CreditCard, ShoppingBag, Check } from 'lucide-react';
import { apiError } from '../lib/api';
import { useCachedGet } from '../hooks/api';
import { newClientRef, submitSale } from '../lib/outbox';
import { useAuth } from '../store/auth';
import { usePos, posTotals } from '../store/pos';
import { Button, Field, Input, Modal, Select, Spinner, cx } from '../components/ui';
import { money, pct } from '../lib/format';
import type { Category, Product } from '../lib/types';

interface OpenTab { id: number; totalAmount: number; table?: { name: string } | null; customer?: { name: string } | null }

const METHODS = [
  ['CASH', 'Cash'], ['MOBILE_MONEY', 'M-Pesa'], ['CARD', 'Card'], ['VOUCHER', 'Voucher'], ['ROOM_CHARGE', 'Room'], ['CREDIT', 'Credit'],
] as const;

export default function Pos() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const pos = usePos();
  const [category, setCategory] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [mobileOrder, setMobileOrder] = useState(false);
  const [flash, setFlash] = useState<string>('');

  const products = useCachedGet<Product[]>('/products', { active: true });
  const categories = useCachedGet<Category[]>('/product-categories');
  const tabs = useCachedGet<OpenTab[]>('/tabs', { status: 'OPEN' });

  const shown = useMemo(() => {
    let list = products.data ?? [];
    if (category !== 'all') list = list.filter((p) => p.categoryId === category);
    if (search.trim()) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [products.data, category, search]);

  const totals = posTotals(pos.lines, pos.discount);

  // A fresh clientRef per attempt: the outbox reuses it on replay, the server dedupes on it.
  const buildPayload = () => ({
    clientRef: newClientRef(),
    soldAt: new Date().toISOString(),
    tabId: pos.tabId ?? undefined,
    customerId: pos.customerId ?? undefined,
    discountAmount: pos.discount || undefined,
    items: pos.lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
  });

  // networkMode 'always': react-query would otherwise pause the mutation offline
  // instead of letting submitSale fall through to the outbox.
  const sendToBar = useMutation({
    networkMode: 'always',
    mutationFn: () => submitSale(buildPayload(), totals.total),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['/tabs', {}] });
      setFlash(res.queued ? 'Offline — order saved, will sync' : 'Order sent to the bar');
      pos.clear();
      setMobileOrder(false);
    },
  });

  // Sale + payment in one call, so a dropped connection can't leave an unpaid order behind.
  const settle = useMutation({
    networkMode: 'always',
    mutationFn: async (payments: { method: string; amount: number }[]) => {
      const res = await submitSale({ ...buildPayload(), payments }, totals.total);
      const change = res.queued ? payments.reduce((sum, p) => sum + p.amount, 0) - totals.total : res.change ?? 0;
      return { queued: res.queued, change };
    },
    onSuccess: ({ queued, change }) => {
      qc.invalidateQueries({ queryKey: ['/tabs', {}] });
      qc.invalidateQueries({ queryKey: ['/dashboard/kpis', {}] });
      const due = change > 0.004 ? ` · change ${money(change, true)}` : '';
      setFlash(queued ? `Offline — paid, will sync${due}` : due ? `Paid${due}` : 'Payment complete');
      pos.clear();
      setPayOpen(false);
      setMobileOrder(false);
    },
  });

  const orderRail = (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Current order</h2>
          {pos.lines.length > 0 && (
            <button onClick={pos.clear} className="text-xs text-chalk-500 hover:text-pour-red">Clear</button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Select value={pos.tabId ?? ''} onChange={(e) => pos.setTab(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Walk-in (no tab)</option>
            {(tabs.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>Tab #{t.id}{t.table ? ` · ${t.table.name}` : ''}</option>
            ))}
          </Select>
          <div className="rounded-lg border border-white/10 bg-ink-900/70 px-3 py-2 text-sm text-chalk-500">
            {pos.lines.reduce((n, l) => n + l.quantity, 0)} items
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {pos.lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-chalk-500">
            <ShoppingBag size={28} />
            <p className="text-sm">Tap drinks to build the order</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {pos.lines.map((l) => (
              <li key={l.product.id} className="flex items-center gap-2 rounded-lg bg-ink-900/40 p-2 animate-pop-in">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.product.name}</p>
                  <p className="text-xs text-chalk-500">{money(l.product.sellingPrice)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => pos.setQty(l.product.id, l.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-md bg-ink-700 hover:bg-ink-600"><Minus size={13} /></button>
                  <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                  <button onClick={() => pos.setQty(l.product.id, l.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-md bg-ink-700 hover:bg-ink-600"><Plus size={13} /></button>
                </div>
                <span className="w-20 text-right text-sm font-semibold">{money(l.product.sellingPrice * l.quantity)}</span>
                <button onClick={() => pos.remove(l.product.id)} className="text-chalk-500 hover:text-pour-red"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-white/5 p-4">
        {can('sales.discount') && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-chalk-500">Discount</span>
            <Input type="number" min={0} value={pos.discount || ''} onChange={(e) => pos.setDiscount(Number(e.target.value) || 0)} className="w-28 text-right" placeholder="0" />
          </div>
        )}
        <dl className="space-y-1 text-sm">
          <Row label="Subtotal" value={money(totals.subtotal)} />
          {pos.discount > 0 && <Row label="Discount" value={`- ${money(pos.discount)}`} />}
          <Row label="Tax (16%)" value={money(totals.tax)} muted />
          <div className="mt-1 flex items-center justify-between border-t border-white/5 pt-2 text-base">
            <dt className="font-semibold">Total</dt>
            <dd className="font-bold text-amber-400">{money(totals.total, true)}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" disabled={!pos.lines.length || sendToBar.isPending} loading={sendToBar.isPending} onClick={() => sendToBar.mutate()}>
            <Send size={15} /> Send to bar
          </Button>
          <Button disabled={!pos.lines.length || !can('sales.pay')} onClick={() => setPayOpen(true)}>
            <CreditCard size={15} /> Charge
          </Button>
        </div>
        {(sendToBar.isError || settle.isError) && (
          <p className="text-xs text-pour-red">{apiError(sendToBar.error ?? settle.error)}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Category rail */}
      <aside className="flex gap-2 overflow-x-auto border-b border-white/5 p-3 lg:w-44 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <CategoryChip active={category === 'all'} label="All" onClick={() => setCategory('all')} />
        {(categories.data ?? []).map((c) => (
          <CategoryChip key={c.id} active={category === c.id} label={c.name} onClick={() => setCategory(c.id)} />
        ))}
      </aside>

      {/* Product grid */}
      <section className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center gap-3">
          <Input placeholder="Search the menu…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          {flash && <span className="flex items-center gap-1 text-sm text-pour-green animate-slide-up"><Check size={15} /> {flash}</span>}
        </div>
        {products.isLoading ? (
          <Spinner label="Loading menu…" />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => (
              <button
                key={p.id}
                onClick={() => { pos.add(p); }}
                className="group flex flex-col justify-between rounded-xl border border-white/5 bg-ink-800/70 p-3 text-left transition hover:border-amber-500/40 hover:bg-ink-700/70 active:scale-[0.98]"
              >
                <span className="text-sm font-semibold leading-snug">{p.name}</span>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-base font-bold text-amber-400">{money(p.sellingPrice)}</span>
                  <span className="text-[11px] text-chalk-500">{pct(p.grossMarginPct, 0)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Order rail — inline on desktop */}
      <aside className="hidden w-80 shrink-0 border-l border-white/5 bg-ink-800/40 lg:block">{orderRail}</aside>

      {/* Mobile: sticky summary + slide-in sheet */}
      {pos.lines.length > 0 && (
        <button onClick={() => setMobileOrder(true)} className="fixed inset-x-3 bottom-14 z-30 flex items-center justify-between rounded-xl bg-amber-500 px-4 py-3 font-semibold text-ink-900 shadow-rail lg:hidden">
          <span>{pos.lines.reduce((n, l) => n + l.quantity, 0)} items</span>
          <span>Review · {money(totals.total)}</span>
        </button>
      )}
      {mobileOrder && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOrder(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm animate-slide-up bg-ink-800" onClick={(e) => e.stopPropagation()}>{orderRail}</div>
        </div>
      )}

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} total={totals.total} onConfirm={(p) => settle.mutate(p)} pending={settle.isPending} />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-chalk-500' : 'text-chalk-300'}>{label}</dt>
      <dd className={muted ? 'text-chalk-500' : ''}>{value}</dd>
    </div>
  );
}

function CategoryChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition lg:text-left',
        active ? 'bg-amber-500/15 text-amber-400' : 'text-chalk-300 hover:bg-white/5',
      )}
    >
      {label}
    </button>
  );
}

function PaymentModal({ open, onClose, total, onConfirm, pending }: { open: boolean; onClose: () => void; total: number; onConfirm: (p: { method: string; amount: number }[]) => void; pending: boolean }) {
  const [method, setMethod] = useState('CASH');
  const [tendered, setTendered] = useState<number | ''>('');
  const exact = Math.round((total + 1e-9) * 100) / 100; // cents, half-up — what the API will ask for
  const amount = tendered === '' ? exact : Number(tendered);
  const change = Math.max(0, amount - exact);

  return (
    <Modal open={open} onClose={onClose} title="Take payment">
      <div className="space-y-4">
        <div className="rounded-xl bg-ink-900/60 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-chalk-500">Amount due</p>
          <p className="mt-1 text-3xl font-bold text-amber-400">{money(total, true)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map(([key, label]) => (
            <button key={key} onClick={() => setMethod(key)} className={cx('rounded-lg border px-2 py-2 text-sm', method === key ? 'border-amber-500/60 bg-amber-500/10 text-amber-400' : 'border-white/10 hover:bg-white/5')}>
              {label}
            </button>
          ))}
        </div>
        <Field label="Amount tendered" hint={method === 'CASH' ? 'Leave blank for exact amount' : undefined}>
          <Input type="number" min={0} value={tendered} onChange={(e) => setTendered(e.target.value === '' ? '' : Number(e.target.value))} placeholder={String(total.toFixed(2))} />
        </Field>
        {method === 'CASH' && change > 0 && <p className="text-sm text-pour-green">Change due: {money(change, true)}</p>}
        <Button className="w-full" loading={pending} disabled={amount < exact} onClick={() => onConfirm([{ method, amount }])}>
          Confirm payment
        </Button>
      </div>
    </Modal>
  );
}
