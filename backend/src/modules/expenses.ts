import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { auditFromReq } from '../lib/audit';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

router.get(
  '/expenses',
  requirePermission('expenses.manage', 'reports.view'),
  wrap(async (req, res) => {
    const { from, to } = req.query;
    const expenses = await prisma.expense.findMany({
      where: { expenseDate: { gte: from ? new Date(String(from)) : undefined, lte: to ? new Date(String(to)) : undefined } },
      include: { user: { select: { name: true } } },
      orderBy: { expenseDate: 'desc' },
    });
    res.json(serialize(expenses));
  }),
);

const expenseSchema = z.object({
  category: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().positive(),
  expenseDate: z.string().optional(),
  shiftId: z.number().int().positive().optional(),
});

router.post(
  '/expenses',
  requirePermission('expenses.manage'),
  wrap(async (req, res) => {
    const data = expenseSchema.parse(req.body);
    const expense = await prisma.expense.create({
      data: { ...data, expenseDate: data.expenseDate ? new Date(data.expenseDate) : undefined, userId: req.user!.id },
    });
    await auditFromReq(req, { action: 'expense.create', entity: 'Expense', entityId: expense.id, newValue: data });
    res.status(201).json(serialize(expense));
  }),
);

export default router;
