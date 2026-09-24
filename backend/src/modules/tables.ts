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

// ---- Tables ------------------------------------------------------------------

router.get(
  '/tables',
  requirePermission('tables.manage', 'sales.create'),
  wrap(async (_req, res) => {
    const tables = await prisma.table.findMany({
      include: { tabs: { where: { status: 'OPEN' }, include: { openedBy: { select: { name: true } } } } },
      orderBy: { name: 'asc' },
    });
    res.json(serialize(tables));
  }),
);

const tableSchema = z.object({ name: z.string().min(1), area: z.string().optional(), status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'DIRTY']).optional() });

router.post(
  '/tables',
  requirePermission('tables.manage'),
  wrap(async (req, res) => {
    const table = await prisma.table.create({ data: tableSchema.parse(req.body) });
    res.status(201).json(serialize(table));
  }),
);

router.patch(
  '/tables/:id',
  requirePermission('tables.manage'),
  wrap(async (req, res) => {
    const table = await prisma.table.update({ where: { id: idParam(req) }, data: tableSchema.partial().parse(req.body) });
    res.json(serialize(table));
  }),
);

// ---- Tabs --------------------------------------------------------------------

router.get(
  '/tabs',
  requirePermission('tables.manage', 'sales.create'),
  wrap(async (req, res) => {
    const { status } = req.query;
    const tabs = await prisma.tab.findMany({
      where: { status: status ? (String(status) as never) : undefined },
      include: {
        table: true,
        customer: { select: { name: true } },
        openedBy: { select: { name: true } },
        sales: { where: { status: { not: 'VOID' } }, include: { items: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
    res.json(serialize(tabs));
  }),
);

const openTabSchema = z.object({
  tableId: z.number().int().positive().nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
});

router.post(
  '/tabs',
  requirePermission('tables.manage', 'sales.create'),
  wrap(async (req, res) => {
    const data = openTabSchema.parse(req.body);
    const tab = await prisma.$transaction(async (tx) => {
      const created = await tx.tab.create({ data: { ...data, openedById: req.user!.id } });
      if (data.tableId) await tx.table.update({ where: { id: data.tableId }, data: { status: 'OCCUPIED' } });
      return created;
    });
    await auditFromReq(req, { action: 'tab.open', entity: 'Tab', entityId: tab.id, newValue: data });
    res.status(201).json(serialize(tab));
  }),
);

// Close a tab (all sales settled) or transfer it to another table.
const patchTabSchema = z.object({
  action: z.enum(['close', 'transfer']),
  toTableId: z.number().int().positive().optional(),
});

router.patch(
  '/tabs/:id',
  requirePermission('tables.manage'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const { action, toTableId } = patchTabSchema.parse(req.body);
    const tab = await prisma.tab.findUnique({ where: { id }, include: { sales: true } });
    if (!tab) throw ApiError.notFound('Tab not found');

    if (action === 'transfer') {
      if (!toTableId) throw ApiError.badRequest('toTableId is required to transfer');
      const updated = await prisma.$transaction(async (tx) => {
        if (tab.tableId) await tx.table.update({ where: { id: tab.tableId }, data: { status: 'AVAILABLE' } });
        await tx.table.update({ where: { id: toTableId }, data: { status: 'OCCUPIED' } });
        return tx.tab.update({ where: { id }, data: { tableId: toTableId } });
      });
      await auditFromReq(req, { action: 'tab.transfer', entity: 'Tab', entityId: id, newValue: { toTableId } });
      return res.json(serialize(updated));
    }

    // close
    const openSales = tab.sales.filter((s) => s.status === 'OPEN');
    if (openSales.length > 0) throw ApiError.conflict('Cannot close a tab with unpaid orders');
    const updated = await prisma.$transaction(async (tx) => {
      if (tab.tableId) await tx.table.update({ where: { id: tab.tableId }, data: { status: 'DIRTY' } });
      return tx.tab.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
    });
    await auditFromReq(req, { action: 'tab.close', entity: 'Tab', entityId: id });
    res.json(serialize(updated));
  }),
);

export default router;
