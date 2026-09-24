import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { grossMarginPct } from '../domain/costing';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

const D0 = () => new Prisma.Decimal(0);
const CASH_OUT = new Set(['CASH_DROP', 'PETTY_CASH', 'PAYOUT', 'SAFE_DROP']);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get(
  '/dashboard/kpis',
  requirePermission('reports.view', 'shifts.view'),
  wrap(async (_req, res) => {
    const from = startOfToday();
    const [sales, openShifts] = await Promise.all([
      prisma.sale.findMany({ where: { status: 'COMPLETED', saleTime: { gte: from } }, include: { items: true } }),
      prisma.shift.findMany({ where: { status: 'OPEN' }, include: { payments: true, cashMovements: true } }),
    ]);

    let revenue = D0();
    let cogs = D0();
    for (const s of sales) {
      revenue = revenue.plus(s.totalAmount);
      cogs = cogs.plus(s.items.reduce((is, it) => is.plus(it.costAtSale.times(it.quantity)), D0()));
    }
    const grossProfit = revenue.minus(cogs);

    // Cash physically expected across the currently open drawers.
    let cashOnHand = D0();
    for (const shift of openShifts) {
      const cashSales = shift.payments.filter((p) => p.method === 'CASH').reduce((s, p) => s.plus(p.amount), D0());
      const cashIn = shift.cashMovements.filter((m) => m.type === 'FLOAT_IN').reduce((s, m) => s.plus(m.amount), D0());
      const cashOut = shift.cashMovements.filter((m) => CASH_OUT.has(m.type)).reduce((s, m) => s.plus(m.amount), D0());
      cashOnHand = cashOnHand.plus(shift.openingFloat).plus(cashSales).plus(cashIn).minus(cashOut);
    }

    res.json(
      serialize({
        todaySales: revenue,
        grossProfit,
        grossMarginPct: grossMarginPct(revenue.eq(0) ? 1 : revenue, cogs).toNumber(),
        cashOnHand,
        transactions: sales.length,
        openShifts: openShifts.length,
      }),
    );
  }),
);

router.get(
  '/dashboard/alerts',
  requirePermission('reports.view', 'inventory.view'),
  wrap(async (_req, res) => {
    const items = await prisma.stockItem.findMany({ where: { isActive: true } });
    const lowStock = items.filter((i) => i.currentStock.lte(i.reorderPoint));
    const [openTabs, pendingPos, expiringSoon] = await Promise.all([
      prisma.tab.count({ where: { status: 'OPEN' } }),
      prisma.purchaseOrder.count({ where: { status: { in: ['ORDERED', 'PARTIAL'] } } }),
      prisma.goodsReceivedItem.count({ where: { expiryDate: { gte: new Date(), lte: new Date(Date.now() + 14 * 864e5) } } }),
    ]);

    res.json(
      serialize({
        lowStockCount: lowStock.length,
        lowStock: lowStock.slice(0, 8).map((i) => ({ id: i.id, name: i.name, currentStock: i.currentStock, reorderPoint: i.reorderPoint, unit: i.unit })),
        openTabs,
        pendingPurchaseOrders: pendingPos,
        expiringSoon,
      }),
    );
  }),
);

export default router;
