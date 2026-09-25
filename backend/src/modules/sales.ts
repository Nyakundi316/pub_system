import { Router, type Request } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ApiError, idParam, wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { auditFromReq } from '../lib/audit';
import { applyStockMovement } from '../lib/inventory';
import { bus } from '../lib/events';
import { resolveSoldAt } from '../domain/offlineSync';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * The shift a sale belongs to. Live sales go to the user's open shift; a sale
 * replayed from the offline queue goes to whichever shift was running when it
 * was rung up, even if that shift has since been closed.
 */
async function getOpenShiftId(userId: number, provided?: number, at?: Date): Promise<number | undefined> {
  if (provided) return provided;
  const shift = at
    ? await prisma.shift.findFirst({
        where: { userId, startTime: { lte: at }, OR: [{ endTime: null }, { endTime: { gte: at } }] },
        orderBy: { startTime: 'desc' },
      })
    : await prisma.shift.findFirst({ where: { userId, status: 'OPEN' }, orderBy: { startTime: 'desc' } });
  return shift?.id;
}

const holds = (req: Request, permission: string) =>
  req.user!.permissions.includes(permission) || req.user!.permissions.includes('*');

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

const paymentsSchema = z
  .array(
    z.object({
      method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'VOUCHER', 'ROOM_CHARGE', 'CREDIT']),
      amount: z.number().positive(),
      reference: z.string().optional(),
    }),
  )
  .min(1);
type PaymentInput = z.infer<typeof paymentsSchema>[number];

const createSaleSchema = z.object({
  // Offline sync: a till-minted id makes the call safe to replay, soldAt keeps
  // the real time of sale, and payments settle it in the same transaction.
  clientRef: z.string().uuid().optional(),
  soldAt: z.coerce.date().optional(),
  payments: paymentsSchema.optional(),
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
    if (saleDiscount.gt(0) && !holds(req, 'sales.discount')) {
      throw ApiError.forbidden('Discounts require manager approval (sales.discount)');
    }
    if (body.payments && !holds(req, 'sales.pay')) throw ApiError.forbidden('Taking payment requires sales.pay');

    // A replay of a sale we already have: hand back what was stored, touch nothing.
    if (body.clientRef) {
      const existing = await findReplay(body.clientRef);
      if (existing) return res.status(200).json(existing);
    }

    const when = resolveSoldAt(body.soldAt, new Date());
    if (!when.ok) throw ApiError.badRequest(when.reason);
    const saleTime = when.at;

    const products = await prisma.product.findMany({
      where: { id: { in: body.items.map((i) => i.productId) } },
      include: { ingredients: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const taxRate = D(env.business.defaultTaxRate);
    const shiftId = await getOpenShiftId(req.user!.id, body.shiftId, body.soldAt ? saleTime : undefined);

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

    const run = () => prisma.$transaction(async (tx) => {
      if (body.tabId) {
        const tab = await tx.tab.findUnique({ where: { id: body.tabId }, select: { status: true } });
        if (!tab) throw ApiError.notFound(`Tab #${body.tabId} not found`);
        if (tab.status !== 'OPEN') throw ApiError.conflict(`Tab #${body.tabId} is closed`);
      }

      const created = await tx.sale.create({
        data: {
          clientRef: body.clientRef,
          saleTime,
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
            at: saleTime,
          });
        }
      }

      const settled = body.payments
        ? await settleSale(tx, { saleId: created.id, payments: body.payments, shiftId, userId: req.user!.id, at: saleTime })
        : null;

      if (body.tabId) await refreshTabTotal(tx, body.tabId);
      return { sale: settled?.sale ?? created, items: created.items, change: settled?.change };
    });

    let result: Awaited<ReturnType<typeof run>>;
    try {
      result = await run();
    } catch (err) {
      // Two copies of the same queued sale raced; the other one won.
      if (body.clientRef && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await findReplay(body.clientRef);
        if (existing) return res.status(200).json(existing);
      }
      throw err;
    }
    const { sale, items, change } = result;

    await auditFromReq(req, {
      action: 'sale.create',
      entity: 'Sale',
      entityId: sale.id,
      newValue: { totalAmount: totalAmount.toFixed(4), items: items.length, ...(body.clientRef && { clientRef: body.clientRef, soldAt: saleTime }) },
    });
    bus.publish({ type: 'order.created', saleId: sale.id, tabId: body.tabId ?? null, total: totalAmount.toNumber() });
    if (body.payments) {
      await auditFromReq(req, { action: 'sale.pay', entity: 'Sale', entityId: sale.id, newValue: { methods: body.payments.map((p) => p.method) } });
      bus.publish({ type: 'order.paid', saleId: sale.id });
    }
    res.status(201).json({ ...(serialize({ ...sale, items }) as object), ...(change !== undefined && { change: change.toNumber() }) });
  }),
);

/** The stored sale for a clientRef, shaped like a fresh create response. */
async function findReplay(clientRef: string) {
  const sale = await prisma.sale.findUnique({ where: { clientRef }, include: { items: true, payments: true } });
  if (!sale) return null;
  const { payments, ...rest } = sale;
  const paid = payments.reduce((sum, p) => sum.plus(p.amount), D(0));
  const change = sale.status === 'COMPLETED' ? paid.minus(sale.totalAmount).toNumber() : undefined;
  return { ...(serialize(rest) as object), change, replayed: true };
}

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

/**
 * Record payments against an open sale and complete it: credit/room charges
 * become customer debt, loyalty accrues. Runs inside the caller's transaction;
 * the caller refreshes the tab total.
 */
async function settleSale(
  tx: Tx,
  { saleId, payments, shiftId, userId, at }: { saleId: number; payments: PaymentInput[]; shiftId?: number; userId: number; at?: Date },
) {
  const sale = await tx.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw ApiError.notFound('Sale not found');
  if (sale.status === 'VOID') throw ApiError.conflict('Cannot pay a voided sale');
  if (sale.status === 'COMPLETED') throw ApiError.conflict('Sale already paid');

  // Totals carry 4dp of tax; money changes hands in cents.
  const due = sale.totalAmount.toDecimalPlaces(2);
  const paid = payments.reduce((sum, p) => sum.plus(p.amount), D(0));
  if (paid.lt(due)) {
    throw ApiError.badRequest(`Payment ${paid.toFixed(2)} is short of total ${due.toFixed(2)}`);
  }

  await tx.payment.createMany({
    data: payments.map((p) => ({ saleId, shiftId, userId, method: p.method, amount: p.amount, reference: p.reference, paidAt: at })),
  });

  // Credit / room-charge payments become customer debt.
  const onCredit = payments.filter((p) => p.method === 'CREDIT' || p.method === 'ROOM_CHARGE');
  if (onCredit.length > 0 && sale.customerId) {
    const owed = onCredit.reduce((sum, p) => sum.plus(p.amount), D(0));
    await tx.customer.update({ where: { id: sale.customerId }, data: { creditBalance: { increment: owed } } });
  }

  if (sale.customerId) {
    const points = Math.floor((sale.totalAmount.toNumber() / 100) * env.business.loyaltyPointsPerUnit);
    if (points > 0) {
      await tx.loyaltyTransaction.create({ data: { customerId: sale.customerId, saleId, pointsEarned: points } });
      await tx.customer.update({ where: { id: sale.customerId }, data: { loyaltyPoints: { increment: points } } });
    }
  }

  const updated = await tx.sale.update({ where: { id: saleId }, data: { status: 'COMPLETED', shiftId } });
  const change = paid.minus(sale.totalAmount);
  return { sale: updated, tabId: sale.tabId, change: change.isNegative() ? D(0) : change };
}

const paySchema = z.object({
  shiftId: z.number().int().positive().optional(),
  payments: paymentsSchema,
});

router.post(
  '/sales/:id/pay',
  requirePermission('sales.pay'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const body = paySchema.parse(req.body);
    const shiftId = await getOpenShiftId(req.user!.id, body.shiftId);

    const result = await prisma.$transaction(async (tx) => {
      const settled = await settleSale(tx, { saleId: id, payments: body.payments, shiftId, userId: req.user!.id });
      if (settled.tabId) await refreshTabTotal(tx, settled.tabId);
      return settled;
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
