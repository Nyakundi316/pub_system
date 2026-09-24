import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError, idParam, wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { auditFromReq } from '../lib/audit';
import { applyStockMovement } from '../lib/inventory';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

// ---- Stock items -------------------------------------------------------------

router.get(
  '/stock-items',
  requirePermission('inventory.view'),
  wrap(async (req, res) => {
    const { search, category, supplierId, status } = req.query;
    const items = await prisma.stockItem.findMany({
      where: {
        category: category ? String(category) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        OR: search
          ? [
              { name: { contains: String(search), mode: 'insensitive' } },
              { sku: { contains: String(search), mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: { supplier: true },
      orderBy: { name: 'asc' },
    });

    // status filter is derived, not a column
    const flagged = items.map((i) => ({
      ...i,
      low: i.currentStock.lte(i.reorderPoint),
      over: i.parLevel.gt(0) && i.currentStock.gt(i.parLevel),
    }));
    const filtered =
      status === 'low' ? flagged.filter((i) => i.low) : status === 'over' ? flagged.filter((i) => i.over) : flagged;

    res.json(serialize(filtered));
  }),
);

router.get(
  '/stock-items/:id',
  requirePermission('inventory.view'),
  wrap(async (req, res) => {
    const item = await prisma.stockItem.findUnique({
      where: { id: idParam(req) },
      include: { supplier: true, movements: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!item) throw ApiError.notFound('Stock item not found');
    res.json(serialize(item));
  }),
);

const stockItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().min(1),
  supplierId: z.number().int().positive().nullable().optional(),
  costPrice: z.number().nonnegative().optional(),
  reorderPoint: z.number().nonnegative().optional(),
  parLevel: z.number().nonnegative().optional(),
  currentStock: z.number().optional(),
  isActive: z.boolean().optional(),
});

router.post(
  '/stock-items',
  requirePermission('inventory.adjust'),
  wrap(async (req, res) => {
    const data = stockItemSchema.parse(req.body);
    const item = await prisma.stockItem.create({ data });
    await auditFromReq(req, { action: 'stock_item.create', entity: 'StockItem', entityId: item.id, newValue: item });
    res.status(201).json(serialize(item));
  }),
);

router.patch(
  '/stock-items/:id',
  requirePermission('inventory.adjust'),
  wrap(async (req, res) => {
    const id = idParam(req);
    // currentStock is never edited directly here — it only moves via movements.
    const data = stockItemSchema.partial().omit({ currentStock: true }).parse(req.body);
    const item = await prisma.stockItem.update({ where: { id }, data });
    await auditFromReq(req, { action: 'stock_item.update', entity: 'StockItem', entityId: id, newValue: item });
    res.json(serialize(item));
  }),
);

const adjustSchema = z.object({
  quantity: z.number().refine((n) => n !== 0, 'Adjustment cannot be zero'), // signed
  reason: z.string().min(1),
  shiftId: z.number().int().positive().optional(),
});

router.post(
  '/stock-items/:id/adjust',
  requirePermission('inventory.adjust'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const { quantity, reason, shiftId } = adjustSchema.parse(req.body);
    const movement = await prisma.$transaction((tx) =>
      applyStockMovement(tx, {
        stockItemId: id,
        movementType: 'COUNT_ADJUSTMENT',
        quantity,
        referenceType: 'manual_adjust',
        userId: req.user!.id,
        shiftId,
        notes: reason,
      }),
    );
    await auditFromReq(req, { action: 'inventory.adjust', entity: 'StockItem', entityId: id, newValue: { quantity, reason } });
    res.status(201).json(serialize(movement));
  }),
);

// ---- Movement ledger ---------------------------------------------------------

router.get(
  '/stock-movements',
  requirePermission('inventory.view'),
  wrap(async (req, res) => {
    const { stockItemId, type, from, to } = req.query;
    const movements = await prisma.stockMovement.findMany({
      where: {
        stockItemId: stockItemId ? Number(stockItemId) : undefined,
        movementType: type ? (String(type) as never) : undefined,
        createdAt: {
          gte: from ? new Date(String(from)) : undefined,
          lte: to ? new Date(String(to)) : undefined,
        },
      },
      include: { stockItem: { select: { name: true, unit: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(serialize(movements));
  }),
);

// ---- Wastage -----------------------------------------------------------------

const wastageSchema = z.object({
  stockItemId: z.number().int().positive(),
  quantity: z.number().positive(),
  reason: z.string().min(1),
  shiftId: z.number().int().positive().optional(),
});

router.post(
  '/wastage',
  requirePermission('inventory.wastage'),
  wrap(async (req, res) => {
    const data = wastageSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const wastage = await tx.wastage.create({
        data: { stockItemId: data.stockItemId, quantity: data.quantity, reason: data.reason, userId: req.user!.id, shiftId: data.shiftId },
      });
      await applyStockMovement(tx, {
        stockItemId: data.stockItemId,
        movementType: 'WASTAGE',
        quantity: new Prisma.Decimal(data.quantity).negated(),
        referenceType: 'wastage',
        referenceId: wastage.id,
        userId: req.user!.id,
        shiftId: data.shiftId,
        notes: data.reason,
      });
      return wastage;
    });
    await auditFromReq(req, { action: 'inventory.wastage', entity: 'Wastage', entityId: result.id, newValue: data });
    res.status(201).json(serialize(result));
  }),
);

router.get(
  '/wastage',
  requirePermission('inventory.view'),
  wrap(async (_req, res) => {
    const rows = await prisma.wastage.findMany({
      include: { stockItem: { select: { name: true, unit: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(serialize(rows));
  }),
);

// ---- Stock counts ------------------------------------------------------------

router.get(
  '/stock-counts',
  requirePermission('inventory.count'),
  wrap(async (_req, res) => {
    const counts = await prisma.stockCount.findMany({
      include: { user: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { countDate: 'desc' },
    });
    res.json(serialize(counts));
  }),
);

router.get(
  '/stock-counts/:id',
  requirePermission('inventory.count'),
  wrap(async (req, res) => {
    const count = await prisma.stockCount.findUnique({
      where: { id: idParam(req) },
      include: { items: { include: { stockItem: true } }, user: { select: { name: true } } },
    });
    if (!count) throw ApiError.notFound('Stock count not found');
    res.json(serialize(count));
  }),
);

// Open a draft count snapshotting current (theoretical) stock for chosen items.
const openCountSchema = z.object({ stockItemIds: z.array(z.number().int().positive()).optional(), notes: z.string().optional() });

router.post(
  '/stock-counts',
  requirePermission('inventory.count'),
  wrap(async (req, res) => {
    const { stockItemIds, notes } = openCountSchema.parse(req.body);
    const items = await prisma.stockItem.findMany({
      where: stockItemIds?.length ? { id: { in: stockItemIds } } : { isActive: true },
    });
    const count = await prisma.stockCount.create({
      data: {
        userId: req.user!.id,
        notes,
        items: {
          create: items.map((i) => ({
            stockItemId: i.id,
            theoreticalQty: i.currentStock,
            actualQty: i.currentStock,
            variance: new Prisma.Decimal(0),
          })),
        },
      },
      include: { items: { include: { stockItem: true } } },
    });
    await auditFromReq(req, { action: 'stock_count.open', entity: 'StockCount', entityId: count.id });
    res.status(201).json(serialize(count));
  }),
);

// Enter actuals, compute variance, and post adjustments to reconcile stock.
const completeCountSchema = z.object({
  items: z.array(z.object({ stockItemId: z.number().int().positive(), actualQty: z.number() })),
});

router.post(
  '/stock-counts/:id/complete',
  requirePermission('inventory.count'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const { items } = completeCountSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findUnique({ where: { id }, include: { items: true } });
      if (!count) throw ApiError.notFound('Stock count not found');
      if (count.status === 'COMPLETED') throw ApiError.conflict('Count already completed');

      for (const entry of items) {
        const line = count.items.find((l) => l.stockItemId === entry.stockItemId);
        if (!line) continue;
        const actual = new Prisma.Decimal(entry.actualQty);
        const variance = line.theoreticalQty.minus(actual); // theoretical − actual
        await tx.stockCountItem.update({ where: { id: line.id }, data: { actualQty: actual, variance } });

        const delta = actual.minus(line.theoreticalQty); // move stock to the counted reality
        if (!delta.isZero()) {
          await applyStockMovement(tx, {
            stockItemId: entry.stockItemId,
            movementType: 'COUNT_ADJUSTMENT',
            quantity: delta,
            referenceType: 'stock_count',
            referenceId: id,
            userId: req.user!.id,
            notes: `Count #${id} reconciliation`,
          });
        }
      }
      return tx.stockCount.update({
        where: { id },
        data: { status: 'COMPLETED' },
        include: { items: { include: { stockItem: true } } },
      });
    });

    await auditFromReq(req, { action: 'stock_count.complete', entity: 'StockCount', entityId: id });
    res.json(serialize(result));
  }),
);

export default router;
