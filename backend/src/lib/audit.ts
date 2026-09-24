import type { Prisma, PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma';

type Db = PrismaClient | Prisma.TransactionClient;

interface AuditInput {
  userId?: number | null;
  action: string; // e.g. "sale.create", "sale.void", "inventory.adjust"
  entity: string; // e.g. "Sale", "StockItem"
  entityId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

/**
 * Append-only audit record. Never updated or deleted — that immutability is the
 * whole point, so this only ever inserts. Accepts a transaction client so a sale
 * and its audit row commit together.
 */
export async function recordAudit(input: AuditInput, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId != null ? String(input.entityId) : null,
      oldValue: (input.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
      newValue: (input.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

/** Convenience that pulls user + ip straight off the request. */
export async function auditFromReq(
  req: Request,
  input: Omit<AuditInput, 'userId' | 'ipAddress'>,
  db: Db = prisma,
): Promise<void> {
  await recordAudit(
    { ...input, userId: req.user?.id ?? null, ipAddress: req.ip ?? null },
    db,
  );
}
