import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useGet } from '../hooks/api';
import { PageHeader } from '../components/page';
import { Badge, EmptyState, Modal, Spinner, cx } from '../components/ui';
import { money, pct, qty } from '../lib/format';
import type { Category, Product } from '../lib/types';

interface ProductDetail extends Product {
  ingredients: { stockItemId: number; quantity: number; unit: string; stockItem: { name: string; costPrice: number } }[];
}

export default function Products() {
  const [category, setCategory] = useState<number | 'all'>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const products = useGet<Product[]>('/products');
  const categories = useGet<Category[]>('/product-categories');
  const detail = useGet<ProductDetail>(`/products/${openId}`, undefined, { enabled: openId !== null });

  const shown = (products.data ?? []).filter((p) => category === 'all' || p.categoryId === category);

  return (
    <div>
      <PageHeader title="Products & menu" subtitle="Prices, costs and pour margins across the menu" />
      <div className="grid gap-6 p-5 md:p-8 lg:grid-cols-[200px_1fr]">
        <aside className="space-y-0.5">
          <CatButton active={category === 'all'} label="All products" onClick={() => setCategory('all')} />
          {(categories.data ?? []).map((c) => (
            <CatButton key={c.id} active={category === c.id} label={c.name} onClick={() => setCategory(c.id)} />
          ))}
        </aside>

        <section>
          {products.isLoading ? (
            <Spinner label="Loading menu…" />
          ) : shown.length === 0 ? (
            <EmptyState title="No products in this category" />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
                  <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Margin</th><th className="px-4 py-3 text-right">Pour cost</th><th className="px-4 py-3"></th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {shown.map((p) => (
                    <tr key={p.id} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setOpenId(p.id)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium">
                          {p.name}
                          {p.productType === 'RECIPE' && <FlaskConical size={13} className="text-chalk-500" />}
                          {!p.isActive && <Badge tone="red">inactive</Badge>}
                        </div>
                        <div className="text-xs text-chalk-500">{p.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-400">{money(p.sellingPrice)}</td>
                      <td className="px-4 py-3 text-right text-chalk-500">{money(p.costPrice, true)}</td>
                      <td className="px-4 py-3 text-right"><span className={cx(p.grossMarginPct >= 65 ? 'text-pour-green' : p.grossMarginPct < 45 ? 'text-pour-red' : '')}>{pct(p.grossMarginPct)}</span></td>
                      <td className="px-4 py-3 text-right text-chalk-500">{pct(p.pourCostPct)}</td>
                      <td className="px-4 py-3 text-right text-xs text-chalk-500">{p.category?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Modal open={openId !== null} onClose={() => setOpenId(null)} title={detail.data?.name ?? 'Product'}>
        {detail.isLoading || !detail.data ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat label="Price" value={money(detail.data.sellingPrice)} />
              <MiniStat label="Cost" value={money(detail.data.costPrice, true)} />
              <MiniStat label="Margin" value={pct(detail.data.grossMarginPct)} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-chalk-500">Recipe</p>
              {detail.data.ingredients.length === 0 ? (
                <p className="text-sm text-chalk-500">No recipe — sold as a service line or simple item.</p>
              ) : (
                <ul className="divide-y divide-white/5 rounded-lg border border-white/5">
                  {detail.data.ingredients.map((ing) => (
                    <li key={ing.stockItemId} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{ing.stockItem.name}</span>
                      <span className="text-chalk-500">{qty(ing.quantity)} {ing.unit} · {money(ing.quantity * ing.stockItem.costPrice, true)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const CatButton = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
  <button onClick={onClick} className={cx('w-full rounded-lg px-3 py-2 text-left text-sm', active ? 'bg-amber-500/15 text-amber-400' : 'text-chalk-300 hover:bg-white/5')}>{label}</button>
);

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-ink-900/50 py-3">
    <p className="text-xs text-chalk-500">{label}</p>
    <p className="mt-0.5 font-semibold">{value}</p>
  </div>
);
