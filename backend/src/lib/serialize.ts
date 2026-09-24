import { Prisma } from '@prisma/client';

/**
 * Recursively turn Prisma Decimals into JS numbers and Dates into ISO strings so
 * responses are plain JSON the frontend can use directly. Money stays exact in
 * the DB; we only widen to number at the edge for transport.
 */
export function serialize<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(v);
    }
    return out;
  }
  return value;
}
