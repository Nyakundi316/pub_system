import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ApiError, idParam, wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { auditFromReq } from '../lib/audit';
import { applyStockMovement } from '../lib/inventory';
import { bus } from '../lib/events';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

async function getOpenShiftId(userId: number, provided?: number): Promise<number | undefined> {
  if (provided) return provided;
  const shift = await prisma.shift.findFirst({ where: { userId, status: 'OPEN' }, orderBy: { startTime: 'desc' } });
  return shift?.id;
}

/** Recompute a tab's running total from its non-void sales. */
async function refreshTabTotal(tx: Tx, tabId: number) {
  const sales = await tx.sale.findMany({ where: { tabId, status: { not: 'VOID' } }, select: { totalAmount: true } });
  const total = sales.reduce((sum, s) => sum.plus(s.totalAmount), new Prisma.Decimal(0));
  await tx.tab.update({ where: { id: tabId }, data: { totalAmount: total } });
}

// ---- Create a sale (send order to bar) --------------------------------------

const itemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(), // override for happy-hour/member pricing
  discountAmount: z.number().nonnegative().optional(),
});

const createSaleSchema = z.object({
  tabId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
  shiftId: z.number().int().positive().optional(),
  discountAmount: z.number().nonnegative().optional(),
  items: z.array(itemSchema).min(1),
});

router.post(
  '/sales',
  requirePermission('sales.create'),
  wrap(async (req, res) => {
    const body = createSaleSchema.parse(req.body);
    const saleDiscount = D(body.discountAmount ?? 0);
    if (saleDiscount.gt(0) && !(req.user!.permissions.includes('sales.discount') || req.user!.permissions.includes('*'))) {
      throw ApiError.forbidden('Discounts require manager approval (sales.discount)');
    }

    const products = await prisma.product.findMany({
      where: { id: { in: body.items.map((i) => i.productId) } },
      include: { ingredients: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const taxRate = D(env.business.defaultTaxRate);
    const shiftId = await getOpenShiftId(req.user!.id, body.shiftId);

    // Build lines
    let subtotal = D(0);
    let taxableSubtotal = D(0);
    const lines = body.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw ApiError.badRequest(`Unknown product ${item.productId}`);
      const qty = D(item.quantity);
      const unitPrice = item.unitPrice !== undefined ? D(item.unitPrice) : product.sellingPrice;
      const lineDiscount = D(item.discountAmount ?? 0);
      const lineTotal = qty.times(unitPrice).minus(lineDiscount);
      subtotal = subtotal.plus(lineTotal);
      if (product.taxable) taxableSubtotal = taxableSubtotal.plus(lineTotal);
      return { product, qty, unitPrice, lineDiscount, lineTotal, costAtSale: product.costPrice };
    });

    // Apportion the sale-level discount across the taxable base, then tax it.
    const taxableShare = subtotal.gt(0) ? saleDiscount.times(taxableSubtotal).dividedBy(subtotal) : D(0);
    const taxAmount = taxableSubtotal.minus(taxableShare).times(taxRate).toDecimalPlaces(4);
    const totalAmount = subtotal.minus(saleDiscount).plus(taxAmount);

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          tabId: body.tabId,
          customerId: body.customerId,
          shiftId,
          userId: req.user!.id,
          subtotal,
          discountAmount: saleDiscount,
          taxAmount,
          totalAmount,
          status: 'OPEN',
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              quantity: l.qty,
              unitPrice: l.unitPrice,
              discountAmount: l.lineDiscount,
              lineTotal: l.lineTotal,
              costAtSale: l.costAtSale,
            })),
          },
        },
        include: { items: true },
      });

      // Deduct stock from each product's recipe (SIMPLE items map 1:1 to a stock item).
      for (const line of lines) {
        for (const ing of line.product.ingredients) {
          await applyStockMovement(tx, {
            stockItemId: ing.stockItemId,
            movementType: 'SALE',
            quantity: D(ing.quantity).times(line.qty).negated(),
            referenceType: 'sale',
            referenceId: created.id,
            userId: req.user!.id,
            shiftId,
          });
        }
      }

      if (body.tabId) await refreshTabTotal(tx, body.tabId);
      return created;
    });

    await auditFromReq(req, { action: 'sale.create', entity: 'Sale', entityId: sale.id, newValue: { totalAmount: totalAmount.toFixed(4), items: sale.items.length } });
    bus.publish({ type: 'order.created', saleId: sale.id, tabId: body.tabId ?? null, total: totalAmount.toNumber() });
    res.status(201).json(serialize(sale));
  }),
);

// ---- Read --------------------------------------------------------------------

router.get(
  '/sales',
  requirePermission('sales.create', 'reports.view'),
  wrap(async (req, res) => {
    const { status, from, to, tabId } = req.query;
    const sales = await prisma.sale.findMany({
      where: {
        status: status ? (String(status) as never) : undefined,
        tabId: tabId ? Number(tabId) : undefined,
        saleTime: { gte: from ? new Date(String(from)) : undefined, lte: to ? new Date(String(to)) : undefined },
      },
      include: { items: { include: { product: { select: { name: true } } } }, payments: true, user: { select: { name: true } } },
      orderBy: { saleTime: 'desc' },
      take: 200,
    });
    res.json(serialize(sales));
  }),
);

router.get(
  '/sales/:id',
  requirePermission('sales.create', 'reports.view'),
  wrap(async (req, res) => {
    const sale = await prisma.sale.findUnique({
      where: { id: idParam(req) },
      include: { items: { include: { product: true } }, payments: true, customer: true, tab: true },
    });
    if (!sale) throw ApiError.notFound('Sale not found');
    res.json(serialize(sale));
  }),
);

// ---- Payment -----------------------------------------------------------------

const paySchema = z.object({
  shiftId: z.number().int().positive().optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'VOUCHER', 'ROOM_CHARGE', 'CREDIT']),
        amount: z.number().positive(),
        reference: z.string().optional(),
      }),
    )
    .min(1),
});

router.post(
  '/sales/:id/pay',
  requirePermission('sales.pay'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const body = paySchema.parse(req.body);
    const shiftId = await getOpenShiftId(req.user!.id, body.shiftId);

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id }, include: { customer: true } });
      if (!sale) throw ApiError.notFound('Sale not found');
      if (sale.status === 'VOID') throw ApiError.conflict('Cannot pay a voided sale');
      if (sale.status === 'COMPLETED') throw ApiError.conflict('Sale already paid');

      const paid = body.payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
      if (paid.lt(sale.totalAmount)) {
        throw ApiError.badRequest(`Payment ${paid.toFixed(2)} is short of total ${sale.totalAmount.toFixed(2)}`);
      }

      await tx.payment.createMany({
        data: body.payments.map((p) => ({ saleId: id, shiftId, userId: req.user!.id, method: p.method, amount: p.amount, reference: p.reference })),
      });

      // Credit / room-charge payments become customer debt.
      const onCredit = body.payments.filter((p) => p.method === 'CREDIT' || p.method === 'ROOM_CHARGE');
      if (onCredit.length > 0 && sale.customerId) {
        const owed = onCredit.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
        await tx.customer.update({ where: { id: sale.customerId }, data: { creditBalance: { increment: owed } } });
      }

      // Loyalty accrual
      if (sale.customerId) {
        const points = Math.floor((sale.totalAmount.toNumber() / 100) * env.business.loyaltyPointsPerUnit);
        if (points > 0) {
          await tx.loyaltyTransaction.create({ data: { customerId: sale.customerId, saleId: id, pointsEarned: points } });
          await tx.customer.update({ where: { id: sale.customerId }, data: { loyaltyPoints: { increment: points } } });
        }
      }

      const updated = await tx.sale.update({ where: { id }, data: { status: 'COMPLETED', shiftId } });
      if (sale.tabId) await refreshTabTotal(tx, sale.tabId);
      return { sale: updated, change: paid.minus(sale.totalAmount) };
    });

    await auditFromReq(req, { action: 'sale.pay', entity: 'Sale', entityId: id, newValue: { methods: body.payments.map((p) => p.method) } });
    bus.publish({ type: 'order.paid', saleId: id });
    res.json({ ...(serialize(result.sale) as object), change: result.change.toNumber() });
  }),
);

// ---- Void --------------------------------------------------------------------

const voidSchema = z.object({ reason: z.string().min(3) });

router.post(
  '/sales/:id/void',
  requirePermission('sales.void'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const { reason } = voidSchema.parse(req.body);

    const updated = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { items: { include: { product: { include: { ingredients: true } } } }, loyaltyTransactions: true },
      });
      if (!sale) throw ApiError.notFound('Sale not found');
      if (sale.status === 'VOID') throw ApiError.conflict('Sale already voided');

      // Put the stock back — reverse every deduction this sale made.
      for (const item of sale.items) {
        for (const ing of item.product.ingredients) {
          await applyStockMovement(tx, {
            stockItemId: ing.stockItemId,
            movementType: 'SALE',
            quantity: D(ing.quantity).times(item.quantity),
            referenceType: 'sale_void',
            referenceId: id,
            userId: req.user!.id,
            notes: `Void: ${reason}`,
          });
        }
      }

      // Claw back loyalty points that were granted.
      for (const lt of sale.loyaltyTransactions) {
        if (lt.pointsEarned > 0) {
          await tx.customer.update({ where: { id: lt.customerId }, data: { loyaltyPoints: { decrement: lt.pointsEarned } } });
        }
      }

      const result = await tx.sale.update({ where: { id }, data: { status: 'VOID', voidReason: reason } });
      if (sale.tabId) await refreshTabTotal(tx, sale.tabId);
      return result;
    });

    await auditFromReq(req, { action: 'sale.void', entity: 'Sale', entityId: id, newValue: { reason } });
    bus.publish({ type: 'order.void', saleId: id });
    res.json(serialize(updated));
  }),
);

export default router;
