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

// ---- Suppliers ---------------------------------------------------------------

router.get(
  '/suppliers',
  requirePermission('purchasing.view'),
  wrap(async (_req, res) => {
    const suppliers = await prisma.supplier.findMany({ include: { _count: { select: { stockItems: true } } }, orderBy: { name: 'asc' } });
    res.json(serialize(suppliers));
  }),
);

const supplierSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
});

router.post(
  '/suppliers',
  requirePermission('purchasing.create'),
  wrap(async (req, res) => {
    const supplier = await prisma.supplier.create({ data: supplierSchema.parse(req.body) });
    await auditFromReq(req, { action: 'supplier.create', entity: 'Supplier', entityId: supplier.id, newValue: supplier });
    res.status(201).json(serialize(supplier));
  }),
);

router.patch(
  '/suppliers/:id',
  requirePermission('purchasing.create'),
  wrap(async (req, res) => {
    const supplier = await prisma.supplier.update({ where: { id: idParam(req) }, data: supplierSchema.partial().parse(req.body) });
    res.json(serialize(supplier));
  }),
);

// ---- Purchase orders ---------------------------------------------------------

router.get(
  '/purchase-orders',
  requirePermission('purchasing.view'),
  wrap(async (_req, res) => {
    const pos = await prisma.purchaseOrder.findMany({
      include: { supplier: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { orderDate: 'desc' },
    });
    res.json(serialize(pos));
  }),
);

router.get(
  '/purchase-orders/:id',
  requirePermission('purchasing.view'),
  wrap(async (req, res) => {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: idParam(req) },
      include: { supplier: true, items: { include: { stockItem: true } }, goodsReceived: true },
    });
    if (!po) throw ApiError.notFound('Purchase order not found');
    res.json(serialize(po));
  }),
);

const poSchema = z.object({
  supplierId: z.number().int().positive(),
  expectedDate: z.string().optional(),
  items: z.array(z.object({ stockItemId: z.number().int().positive(), quantity: z.number().positive(), unitCost: z.number().nonnegative() })).min(1),
});

router.post(
  '/purchase-orders',
  requirePermission('purchasing.create'),
  wrap(async (req, res) => {
    const body = poSchema.parse(req.body);
    const total = body.items.reduce((s, i) => s.plus(new Prisma.Decimal(i.quantity).times(i.unitCost)), new Prisma.Decimal(0));
    const po = await prisma.purchaseOrder.create({
      data: {
        supplierId: body.supplierId,
        expectedDate: body.expectedDate ? new Date(body.expectedDate) : undefined,
        createdById: req.user!.id,
        status: 'ORDERED',
        totalAmount: total,
        items: { create: body.items.map((i) => ({ stockItemId: i.stockItemId, quantity: i.quantity, unitCost: i.unitCost, lineTotal: new Prisma.Decimal(i.quantity).times(i.unitCost) })) },
      },
      include: { items: true },
    });
    await auditFromReq(req, { action: 'po.create', entity: 'PurchaseOrder', entityId: po.id, newValue: { total: total.toFixed(2) } });
    res.status(201).json(serialize(po));
  }),
);

// ---- Goods received ----------------------------------------------------------

const grnSchema = z.object({
  poId: z.number().int().positive().optional(),
  supplierId: z.number().int().positive(),
  invoiceNo: z.string().optional(),
  items: z
    .array(
      z.object({
        stockItemId: z.number().int().positive(),
        quantity: z.number().positive(),
        unitCost: z.number().nonnegative(),
        expiryDate: z.string().optional(),
        batchNo: z.string().optional(),
      }),
    )
    .min(1),
});

router.post(
  '/goods-received',
  requirePermission('purchasing.receive'),
  wrap(async (req, res) => {
    const body = grnSchema.parse(req.body);
    const total = body.items.reduce((s, i) => s.plus(new Prisma.Decimal(i.quantity).times(i.unitCost)), new Prisma.Decimal(0));

    const grn = await prisma.$transaction(async (tx) => {
      const created = await tx.goodsReceived.create({
        data: {
          poId: body.poId,
          supplierId: body.supplierId,
          receivedById: req.user!.id,
          invoiceNo: body.invoiceNo,
          totalAmount: total,
          items: { create: body.items.map((i) => ({ stockItemId: i.stockItemId, quantity: i.quantity, unitCost: i.unitCost, expiryDate: i.expiryDate ? new Date(i.expiryDate) : undefined, batchNo: i.batchNo })) },
        },
      });

      for (const line of body.items) {
        await applyStockMovement(tx, {
          stockItemId: line.stockItemId,
          movementType: 'PURCHASE_RECEIVED',
          quantity: line.quantity,
          unitCost: line.unitCost,
          referenceType: 'goods_received',
          referenceId: created.id,
          userId: req.user!.id,
        });
        // Latest landed cost becomes the item's cost basis.
        await tx.stockItem.update({ where: { id: line.stockItemId }, data: { costPrice: line.unitCost } });
      }

      if (body.poId) await tx.purchaseOrder.update({ where: { id: body.poId }, data: { status: 'RECEIVED' } });
      return created;
    });

    await auditFromReq(req, { action: 'grn.create', entity: 'GoodsReceived', entityId: grn.id, newValue: { total: total.toFixed(2) } });
    res.status(201).json(serialize(grn));
  }),
);

router.get(
  '/goods-received',
  requirePermission('purchasing.view'),
  wrap(async (_req, res) => {
    const rows = await prisma.goodsReceived.findMany({
      include: { supplier: { select: { name: true } }, receivedBy: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { receivedDate: 'desc' },
    });
    res.json(serialize(rows));
  }),
);

export default router;
