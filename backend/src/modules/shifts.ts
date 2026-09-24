import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError, idParam, wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { auditFromReq } from '../lib/audit';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

const CASH_OUT = new Set(['CASH_DROP', 'PETTY_CASH', 'PAYOUT', 'SAFE_DROP']);

/**
 * The heart of cash control: reconstruct what should be in the drawer and how
 * the shift sold. Shared by the X-report (mid-shift peek) and Z-report (close).
 */
async function buildShiftReport(shiftId: number) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      user: { select: { name: true } },
      payments: { include: { sale: { select: { status: true } } } },
      cashMovements: true,
      sales: { where: { status: 'COMPLETED' }, include: { items: true } },
      expenses: true,
    },
  });
  if (!shift) throw ApiError.notFound('Shift not found');

  const byMethod: Record<string, Prisma.Decimal> = {};
  for (const p of shift.payments) {
    if (p.sale.status === 'VOID') continue;
    byMethod[p.method] = (byMethod[p.method] ?? new Prisma.Decimal(0)).plus(p.amount);
  }

  const cashSales = byMethod.CASH ?? new Prisma.Decimal(0);
  const cashIn = shift.cashMovements
    .filter((m) => m.type === 'FLOAT_IN')
    .reduce((s, m) => s.plus(m.amount), new Prisma.Decimal(0));
  const cashOut = shift.cashMovements
    .filter((m) => CASH_OUT.has(m.type))
    .reduce((s, m) => s.plus(m.amount), new Prisma.Decimal(0));

  const expectedCash = shift.openingFloat.plus(cashSales).plus(cashIn).minus(cashOut);

  const grossSales = shift.sales.reduce((s, sale) => s.plus(sale.totalAmount), new Prisma.Decimal(0));
  const cogs = shift.sales.reduce(
    (s, sale) => s.plus(sale.items.reduce((is, it) => is.plus(it.costAtSale.times(it.quantity)), new Prisma.Decimal(0))),
    new Prisma.Decimal(0),
  );
  const expenses = shift.expenses.reduce((s, e) => s.plus(e.amount), new Prisma.Decimal(0));

  const variance = shift.closingCash != null ? shift.closingCash.minus(expectedCash) : null;

  return serialize({
    shift: { id: shift.id, user: shift.user.name, status: shift.status, startTime: shift.startTime, endTime: shift.endTime, openingFloat: shift.openingFloat, closingCash: shift.closingCash },
    salesByMethod: byMethod,
    totals: {
      grossSales,
      cogs,
      grossProfit: grossSales.minus(cogs),
      expenses,
      transactions: shift.sales.length,
    },
    cash: { openingFloat: shift.openingFloat, cashSales, cashIn, cashOut, expectedCash, countedCash: shift.closingCash, variance },
  });
}

// ---- Shifts ------------------------------------------------------------------

router.get(
  '/shifts',
  requirePermission('shifts.view'),
  wrap(async (req, res) => {
    const mine = req.query.mine === 'true';
    const shifts = await prisma.shift.findMany({
      where: mine ? { userId: req.user!.id } : undefined,
      include: { user: { select: { name: true } } },
      orderBy: { startTime: 'desc' },
      take: 100,
    });
    res.json(serialize(shifts));
  }),
);

const openSchema = z.object({ openingFloat: z.number().nonnegative() });

router.post(
  '/shifts',
  requirePermission('shifts.open'),
  wrap(async (req, res) => {
    const { openingFloat } = openSchema.parse(req.body);
    const existing = await prisma.shift.findFirst({ where: { userId: req.user!.id, status: 'OPEN' } });
    if (existing) throw ApiError.conflict('You already have an open shift');
    const shift = await prisma.shift.create({ data: { userId: req.user!.id, openingFloat } });
    await auditFromReq(req, { action: 'shift.open', entity: 'Shift', entityId: shift.id, newValue: { openingFloat } });
    res.status(201).json(serialize(shift));
  }),
);

const closeSchema = z.object({ closingCash: z.number().nonnegative() });

router.post(
  '/shifts/:id/close',
  requirePermission('shifts.close'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const { closingCash } = closeSchema.parse(req.body);
    const shift = await prisma.shift.findUnique({ where: { id } });
    if (!shift) throw ApiError.notFound('Shift not found');
    if (shift.status === 'CLOSED') throw ApiError.conflict('Shift already closed');

    // Compute expected cash, then persist variance.
    const report = (await buildShiftReport(id)) as { cash: { expectedCash: number } };
    const variance = new Prisma.Decimal(closingCash).minus(report.cash.expectedCash);
    const updated = await prisma.shift.update({
      where: { id },
      data: { status: 'CLOSED', endTime: new Date(), closingCash, variance },
    });
    await auditFromReq(req, { action: 'shift.close', entity: 'Shift', entityId: id, newValue: { closingCash, variance: variance.toFixed(4) } });
    res.json(serialize(updated));
  }),
);

router.get('/shifts/:id/x-report', requirePermission('shifts.view'), wrap(async (req, res) => res.json(await buildShiftReport(idParam(req)))));
router.get('/shifts/:id/z-report', requirePermission('shifts.view'), wrap(async (req, res) => res.json(await buildShiftReport(idParam(req)))));

// ---- Cash movements ----------------------------------------------------------

const cashSchema = z.object({
  shiftId: z.number().int().positive(),
  type: z.enum(['FLOAT_IN', 'CASH_DROP', 'PETTY_CASH', 'PAYOUT', 'SAFE_DROP']),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

router.post(
  '/cash-movements',
  requirePermission('cash.manage'),
  wrap(async (req, res) => {
    const data = cashSchema.parse(req.body);
    const movement = await prisma.cashMovement.create({ data: { ...data, userId: req.user!.id } });
    await auditFromReq(req, { action: 'cash.movement', entity: 'CashMovement', entityId: movement.id, newValue: data });
    res.status(201).json(serialize(movement));
  }),
);

router.get(
  '/cash-movements',
  requirePermission('shifts.view'),
  wrap(async (req, res) => {
    const { shiftId } = req.query;
    const rows = await prisma.cashMovement.findMany({
      where: { shiftId: shiftId ? Number(shiftId) : undefined },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(serialize(rows));
  }),
);

export default router;
