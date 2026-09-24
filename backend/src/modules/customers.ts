import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError, idParam, wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { auditFromReq } from '../lib/audit';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

router.get(
  '/customers',
  requirePermission('customers.view'),
  wrap(async (req, res) => {
    const { search } = req.query;
    const customers = await prisma.customer.findMany({
      where: search
        ? { OR: [{ name: { contains: String(search), mode: 'insensitive' } }, { phone: { contains: String(search) } }] }
        : undefined,
      orderBy: { name: 'asc' },
      take: 200,
    });
    res.json(serialize(customers));
  }),
);

router.get(
  '/customers/:id',
  requirePermission('customers.view'),
  wrap(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: idParam(req) },
      include: {
        sales: { where: { status: 'COMPLETED' }, orderBy: { saleTime: 'desc' }, take: 20, include: { items: { include: { product: { select: { name: true } } } } } },
        loyaltyTransactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!customer) throw ApiError.notFound('Customer not found');
    res.json(serialize(customer));
  }),
);

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
});

router.post(
  '/customers',
  requirePermission('customers.manage'),
  wrap(async (req, res) => {
    const data = customerSchema.parse(req.body);
    const customer = await prisma.customer.create({ data });
    await auditFromReq(req, { action: 'customer.create', entity: 'Customer', entityId: customer.id, newValue: data });
    res.status(201).json(serialize(customer));
  }),
);

router.patch(
  '/customers/:id',
  requirePermission('customers.manage'),
  wrap(async (req, res) => {
    const customer = await prisma.customer.update({ where: { id: idParam(req) }, data: customerSchema.partial().parse(req.body) });
    res.json(serialize(customer));
  }),
);

// Redeem loyalty points against the customer's balance.
const redeemSchema = z.object({ points: z.number().int().positive() });

router.post(
  '/customers/:id/redeem',
  requirePermission('customers.manage'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const { points } = redeemSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id } });
      if (!customer) throw ApiError.notFound('Customer not found');
      if (customer.loyaltyPoints < points) throw ApiError.badRequest('Not enough points');
      await tx.loyaltyTransaction.create({ data: { customerId: id, pointsRedeemed: points } });
      return tx.customer.update({ where: { id }, data: { loyaltyPoints: { decrement: points } } });
    });
    await auditFromReq(req, { action: 'loyalty.redeem', entity: 'Customer', entityId: id, newValue: { points } });
    res.json(serialize(result));
  }),
);

export default router;
