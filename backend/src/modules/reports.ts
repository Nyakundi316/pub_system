import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { grossMarginPct, profitAndLoss } from '../domain/costing';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);
router.use(requirePermission('reports.view'));

const D0 = () => new Prisma.Decimal(0);

/** Resolve a from/to window, defaulting to the trailing 30 days. */
function range(req: { query: Record<string, unknown> }) {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 30 * 864e5);
  return { from, to };
}

async function completedSaleItems(from: Date, to: Date) {
  return prisma.saleItem.findMany({
    where: { sale: { status: 'COMPLETED', saleTime: { gte: from, lte: to } } },
    include: { product: { select: { name: true, categoryId: true, category: { select: { name: true } } } } },
  });
}

// ---- Sales summary + P&L -----------------------------------------------------

router.get(
  '/reports/sales',
  wrap(async (req, res) => {
    const { from, to } = range(req);
    const [sales, payments, expenseAgg] = await Promise.all([
      prisma.sale.findMany({ where: { status: 'COMPLETED', saleTime: { gte: from, lte: to } }, include: { items: true } }),
      prisma.payment.findMany({ where: { sale: { status: 'COMPLETED', saleTime: { gte: from, lte: to } } } }),
      prisma.expense.aggregate({ _sum: { amount: true }, where: { expenseDate: { gte: from, lte: to } } }),
    ]);

    const byMethod: Record<string, Prisma.Decimal> = {};
    for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? D0()).plus(p.amount);

    const byDay: Record<string, { sales: Prisma.Decimal; count: number }> = {};
    let netSales = D0();
    let cogs = D0();
    let tax = D0();
    for (const s of sales) {
      const day = s.saleTime.toISOString().slice(0, 10);
      byDay[day] = { sales: (byDay[day]?.sales ?? D0()).plus(s.totalAmount), count: (byDay[day]?.count ?? 0) + 1 };
      netSales = netSales.plus(s.subtotal.minus(s.discountAmount));
      tax = tax.plus(s.taxAmount);
      cogs = cogs.plus(s.items.reduce((is, it) => is.plus(it.costAtSale.times(it.quantity)), D0()));
    }

    const opex = expenseAgg._sum.amount ?? D0();
    const pnl = profitAndLoss({ netSales, cogs, operatingExpenses: opex });

    res.json(
      serialize({
        period: { from, to },
        transactions: sales.length,
        salesByPaymentMethod: byMethod,
        salesByDay: Object.entries(byDay).map(([date, v]) => ({ date, sales: v.sales, transactions: v.count })).sort((a, b) => a.date.localeCompare(b.date)),
        tax,
        profitAndLoss: pnl,
      }),
    );
  }),
);

// ---- Top / bottom drinks -----------------------------------------------------

interface ProductAgg {
  productId: number;
  name: string;
  category: string | null;
  units: Prisma.Decimal;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
}

async function aggregateProducts(from: Date, to: Date): Promise<ProductAgg[]> {
  const items = await completedSaleItems(from, to);
  const map = new Map<number, ProductAgg>();
  for (const it of items) {
    const cur =
      map.get(it.productId) ??
      { productId: it.productId, name: it.product.name, category: it.product.category?.name ?? null, units: D0(), revenue: D0(), cost: D0() };
    cur.units = cur.units.plus(it.quantity);
    cur.revenue = cur.revenue.plus(it.lineTotal);
    cur.cost = cur.cost.plus(it.costAtSale.times(it.quantity));
    map.set(it.productId, cur);
  }
  return [...map.values()];
}

function decorate(a: ProductAgg) {
  const grossProfit = a.revenue.minus(a.cost);
  return {
    productId: a.productId,
    name: a.name,
    category: a.category,
    units: a.units,
    revenue: a.revenue,
    grossProfit,
    marginPct: grossMarginPct(a.revenue.eq(0) ? 1 : a.revenue, a.cost).toNumber(),
  };
}

router.get(
  '/reports/top-drinks',
  wrap(async (req, res) => {
    const { from, to } = range(req);
    const limit = Number(req.query.limit ?? 10);
    const by = String(req.query.by ?? 'revenue'); // revenue | units | profit | margin
    const rows = (await aggregateProducts(from, to)).map(decorate);
    const key = (r: ReturnType<typeof decorate>) =>
      by === 'units' ? r.units.toNumber() : by === 'profit' ? r.grossProfit.toNumber() : by === 'margin' ? r.marginPct : r.revenue.toNumber();
    rows.sort((a, b) => key(b) - key(a));
    res.json(serialize({ period: { from, to }, by, rows: rows.slice(0, limit) }));
  }),
);

router.get(
  '/reports/bottom-drinks',
  wrap(async (req, res) => {
    const { from, to } = range(req);
    const limit = Number(req.query.limit ?? 10);
    const sold = new Map((await aggregateProducts(from, to)).map((a) => [a.productId, a]));
    // Include products with zero sales in the window as the true tail.
    const products = await prisma.product.findMany({ where: { isActive: true }, include: { category: { select: { name: true } } } });
    const rows = products.map((p) => {
      const agg = sold.get(p.id);
      return decorate(
        agg ?? { productId: p.id, name: p.name, category: p.category?.name ?? null, units: D0(), revenue: D0(), cost: D0() },
      );
    });
    rows.sort((a, b) => a.units.toNumber() - b.units.toNumber() || a.revenue.toNumber() - b.revenue.toNumber());
    res.json(serialize({ period: { from, to }, rows: rows.slice(0, limit) }));
  }),
);

router.get(
  '/reports/profitability',
  wrap(async (req, res) => {
    const { from, to } = range(req);
    const rows = (await aggregateProducts(from, to)).map(decorate).sort((a, b) => b.grossProfit.toNumber() - a.grossProfit.toNumber());
    res.json(serialize({ period: { from, to }, rows }));
  }),
);

// ---- Stock valuation, low & over --------------------------------------------

router.get(
  '/reports/stock',
  wrap(async (_req, res) => {
    const items = await prisma.stockItem.findMany({ where: { isActive: true }, include: { supplier: { select: { name: true } } } });
    let valuation = D0();
    const low: unknown[] = [];
    const over: unknown[] = [];
    for (const i of items) {
      valuation = valuation.plus(i.currentStock.times(i.costPrice));
      if (i.currentStock.lte(i.reorderPoint)) low.push(i);
      if (i.parLevel.gt(0) && i.currentStock.gt(i.parLevel)) over.push(i);
    }
    res.json(serialize({ valuation, itemCount: items.length, lowStock: low, overStock: over }));
  }),
);

// ---- Stock variance / shrinkage (from completed counts) ---------------------

router.get(
  '/reports/stock-variance',
  wrap(async (req, res) => {
    const { from, to } = range(req);
    const counts = await prisma.stockCount.findMany({
      where: { status: 'COMPLETED', countDate: { gte: from, lte: to } },
      include: { items: { include: { stockItem: { select: { name: true, unit: true, costPrice: true } } } } },
      orderBy: { countDate: 'desc' },
    });
    const rows = counts.flatMap((c) =>
      c.items
        .filter((i) => !i.variance.isZero())
        .map((i) => ({
          countId: c.id,
          countDate: c.countDate,
          item: i.stockItem.name,
          unit: i.stockItem.unit,
          theoretical: i.theoreticalQty,
          actual: i.actualQty,
          variance: i.variance,
          costImpact: i.variance.times(i.stockItem.costPrice),
        })),
    );
    res.json(serialize({ period: { from, to }, rows }));
  }),
);

// ---- Cash variance per shift -------------------------------------------------

router.get(
  '/reports/cash-variance',
  wrap(async (req, res) => {
    const { from, to } = range(req);
    const shifts = await prisma.shift.findMany({
      where: { status: 'CLOSED', endTime: { gte: from, lte: to } },
      include: { user: { select: { name: true } } },
      orderBy: { endTime: 'desc' },
    });
    res.json(
      serialize({
        period: { from, to },
        rows: shifts.map((s) => ({ shiftId: s.id, cashier: s.user.name, endTime: s.endTime, openingFloat: s.openingFloat, closingCash: s.closingCash, variance: s.variance })),
      }),
    );
  }),
);

// ---- Tax -----------------------------------------------------------------

router.get(
  '/reports/tax',
  wrap(async (req, res) => {
    const { from, to } = range(req);
    const agg = await prisma.sale.aggregate({
      _sum: { taxAmount: true, subtotal: true, discountAmount: true },
      where: { status: 'COMPLETED', saleTime: { gte: from, lte: to } },
    });
    res.json(
      serialize({
        period: { from, to },
        taxCollected: agg._sum.taxAmount ?? 0,
        netSales: (agg._sum.subtotal ?? D0()).minus(agg._sum.discountAmount ?? 0),
      }),
    );
  }),
);

export default router;
