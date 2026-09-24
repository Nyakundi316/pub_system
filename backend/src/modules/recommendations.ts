import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { buildRecommendations, defaultConfig, type ItemStats } from '../domain/recommendations';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

const D0 = () => new Prisma.Decimal(0);
const dayMs = 864e5;

/**
 * Turn the live inventory + sales history into the per-item statistics the
 * decision engine consumes. Revenue and margin are attributed down to each
 * stock item through the recipe cost share, so a shared spirit gets credit
 * across every cocktail it pours into.
 */
export async function buildItemStats(windowDays = 30): Promise<ItemStats[]> {
  const now = Date.now();
  const from = new Date(now - windowDays * dayMs);

  const [items, movements, saleItems, openPoItems, batches, counts] = await Promise.all([
    prisma.stockItem.findMany({ where: { isActive: true }, include: { supplier: { select: { leadTimeDays: true } } } }),
    prisma.stockMovement.findMany({ where: { createdAt: { gte: from } }, select: { stockItemId: true, quantity: true, movementType: true, createdAt: true } }),
    prisma.saleItem.findMany({
      where: { sale: { status: 'COMPLETED', saleTime: { gte: from } } },
      include: { product: { include: { ingredients: { include: { stockItem: { select: { id: true, costPrice: true } } } } } } },
    }),
    prisma.purchaseOrderItem.findMany({ where: { po: { status: { in: ['ORDERED', 'PARTIAL'] } } }, select: { stockItemId: true, quantity: true } }),
    prisma.goodsReceivedItem.findMany({ where: { expiryDate: { gte: new Date() } }, select: { stockItemId: true, expiryDate: true } }),
    prisma.stockCountItem.findMany({ where: { count: { status: 'COMPLETED', countDate: { gte: from } } }, select: { stockItemId: true, theoreticalQty: true, actualQty: true } }),
  ]);

  const usage = new Map<number, Prisma.Decimal>();
  const lastSale = new Map<number, Date>();
  for (const m of movements) {
    if ((m.movementType === 'SALE' || m.movementType === 'WASTAGE') && m.quantity.lt(0)) {
      usage.set(m.stockItemId, (usage.get(m.stockItemId) ?? D0()).plus(m.quantity.abs()));
      if (m.movementType === 'SALE') {
        const prev = lastSale.get(m.stockItemId);
        if (!prev || m.createdAt > prev) lastSale.set(m.stockItemId, m.createdAt);
      }
    }
  }

  // Attribute revenue/profit to stock items via recipe cost weight.
  const revenue = new Map<number, Prisma.Decimal>();
  const profit = new Map<number, Prisma.Decimal>();
  for (const si of saleItems) {
    const breakdown = si.product.ingredients.map((ing) => ({ id: ing.stockItem.id, cost: new Prisma.Decimal(ing.quantity).times(ing.stockItem.costPrice) }));
    const totalCost = breakdown.reduce((s, b) => s.plus(b.cost), D0());
    const lineProfit = si.lineTotal.minus(si.costAtSale.times(si.quantity));
    if (totalCost.isZero() || breakdown.length === 0) continue;
    for (const b of breakdown) {
      const weight = b.cost.dividedBy(totalCost);
      revenue.set(b.id, (revenue.get(b.id) ?? D0()).plus(si.lineTotal.times(weight)));
      profit.set(b.id, (profit.get(b.id) ?? D0()).plus(lineProfit.times(weight)));
    }
  }

  const onOrder = new Map<number, Prisma.Decimal>();
  for (const p of openPoItems) onOrder.set(p.stockItemId, (onOrder.get(p.stockItemId) ?? D0()).plus(p.quantity));

  const expiry = new Map<number, Date>();
  for (const b of batches) {
    if (!b.expiryDate) continue;
    const prev = expiry.get(b.stockItemId);
    if (!prev || b.expiryDate < prev) expiry.set(b.stockItemId, b.expiryDate);
  }

  const countByItem = new Map(counts.map((c) => [c.stockItemId, c]));

  return items.map((item): ItemStats => {
    const used = usage.get(item.id) ?? D0();
    const rev = revenue.get(item.id) ?? D0();
    const prof = profit.get(item.id) ?? D0();
    const last = lastSale.get(item.id);
    const count = countByItem.get(item.id);
    const exp = expiry.get(item.id);
    return {
      itemId: item.id,
      name: item.name,
      currentStock: item.currentStock.toNumber(),
      reorderPoint: item.reorderPoint.toNumber(),
      parLevel: item.parLevel.toNumber(),
      onOrder: (onOrder.get(item.id) ?? D0()).toNumber(),
      leadTimeDays: item.supplier?.leadTimeDays ?? env.business.safetyStockDays,
      avgDailyUsage: used.dividedBy(windowDays).toNumber(),
      marginPct: rev.gt(0) ? prof.dividedBy(rev).times(100).toDecimalPlaces(2).toNumber() : 0,
      revenue: rev.toNumber(),
      unitsSold: used.toNumber(),
      daysSinceLastSale: last ? Math.floor((now - last.getTime()) / dayMs) : null,
      nearestExpiryDays: exp ? Math.max(0, Math.floor((exp.getTime() - now) / dayMs)) : null,
      theoreticalUsage: count ? count.theoreticalQty.toNumber() : null,
      actualUsage: count ? count.actualQty.toNumber() : null,
    };
  });
}

router.get(
  '/dashboard/recommendations',
  requirePermission('recommendations.view'),
  wrap(async (req, res) => {
    const windowDays = Number(req.query.windowDays ?? 30);
    const stats = await buildItemStats(windowDays);
    const config = { ...defaultConfig, safetyStockDays: env.business.safetyStockDays };
    const recommendations = buildRecommendations(stats, config);
    res.json(serialize({ generatedAt: new Date(), windowDays, count: recommendations.length, recommendations }));
  }),
);

export default router;
