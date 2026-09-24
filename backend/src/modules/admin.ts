import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError, idParam, wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { auditFromReq } from '../lib/audit';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

// Users, roles, permissions and the audit trail — the System Admin surface.
const router = Router();
router.use(authenticate);

// ---- Users -------------------------------------------------------------------

router.get(
  '/users',
  requirePermission('users.manage'),
  wrap(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, username: true, phone: true, status: true, createdAt: true, role: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(serialize(users));
  }),
);

const userSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(6),
  pin: z.string().min(4).optional(),
  roleId: z.number().int().positive(),
  phone: z.string().optional(),
});

router.post(
  '/users',
  requirePermission('users.manage'),
  wrap(async (req, res) => {
    const data = userSchema.parse(req.body);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        username: data.username,
        passwordHash: await bcrypt.hash(data.password, 10),
        pinHash: data.pin ? await bcrypt.hash(data.pin, 10) : null,
        roleId: data.roleId,
        phone: data.phone,
      },
      select: { id: true, name: true, username: true, roleId: true, status: true },
    });
    await auditFromReq(req, { action: 'user.create', entity: 'User', entityId: user.id, newValue: { username: data.username, roleId: data.roleId } });
    res.status(201).json(serialize(user));
  }),
);

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  roleId: z.number().int().positive().optional(),
  phone: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  password: z.string().min(6).optional(),
  pin: z.string().min(4).optional(),
});

router.patch(
  '/users/:id',
  requirePermission('users.manage'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const data = updateUserSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        roleId: data.roleId,
        phone: data.phone,
        status: data.status,
        passwordHash: data.password ? await bcrypt.hash(data.password, 10) : undefined,
        pinHash: data.pin ? await bcrypt.hash(data.pin, 10) : undefined,
      },
      select: { id: true, name: true, username: true, roleId: true, status: true },
    });
    await auditFromReq(req, { action: 'user.update', entity: 'User', entityId: id, newValue: data.status ? { status: data.status } : { updated: true } });
    res.json(serialize(user));
  }),
);

// ---- Roles & permissions -----------------------------------------------------

router.get(
  '/roles',
  requirePermission('users.manage', 'roles.manage'),
  wrap(async (_req, res) => {
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { name: 'asc' } });
    res.json(serialize(roles.map((r) => ({ id: r.id, name: r.name, description: r.description, landingPath: r.landingPath, permissions: r.permissions.map((p) => p.permission.name) }))));
  }),
);

router.get(
  '/permissions',
  requirePermission('roles.manage'),
  wrap(async (_req, res) => {
    const permissions = await prisma.permission.findMany({ orderBy: { name: 'asc' } });
    res.json(serialize(permissions));
  }),
);

const setPermsSchema = z.object({ permissions: z.array(z.string()) });

router.put(
  '/roles/:id/permissions',
  requirePermission('roles.manage'),
  wrap(async (req, res) => {
    const roleId = idParam(req);
    const { permissions } = setPermsSchema.parse(req.body);
    const rows = await prisma.permission.findMany({ where: { name: { in: permissions } } });
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({ data: rows.map((p) => ({ roleId, permissionId: p.id })) }),
    ]);
    await auditFromReq(req, { action: 'role.permissions.set', entity: 'Role', entityId: roleId, newValue: { permissions } });
    res.json({ ok: true, applied: rows.length });
  }),
);

// ---- Audit trail (read-only) -------------------------------------------------

router.get(
  '/audit-logs',
  requirePermission('audit.view'),
  wrap(async (req, res) => {
    const { entity, action, userId } = req.query;
    const logs = await prisma.auditLog.findMany({
      where: {
        entity: entity ? String(entity) : undefined,
        action: action ? String(action) : undefined,
        userId: userId ? Number(userId) : undefined,
      },
      include: { user: { select: { name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    res.json(serialize(logs));
  }),
);

export default router;
