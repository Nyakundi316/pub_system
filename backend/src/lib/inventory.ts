import { Prisma } from '@prisma/client';
import type { MovementType } from '@prisma/client';
import { costPerDrink } from '../domain/costing';

type Tx = Prisma.TransactionClient;

interface MovementInput {
  stockItemId: number;
  movementType: MovementType;
  quantity: Prisma.Decimal.Value; // SIGNED — negative reduces stock
  unitCost?: Prisma.Decimal.Value;
  referenceType?: string;
  referenceId?: number;
  userId?: number;
  shiftId?: number;
  notes?: string;
}

/**
 * The one place stock ever changes. Writes an immutable movement row and moves
 * `current_stock` by the same signed amount inside the caller's transaction, so
 * the ledger and the running balance can never drift apart.
 */
export async function applyStockMovement(tx: Tx, input: MovementInput) {
  const item = await tx.stockItem.findUnique({ where: { id: input.stockItemId } });
  if (!item) throw new Error(`Stock item ${input.stockItemId} not found`);

  const unitCost = new Prisma.Decimal(input.unitCost ?? item.costPrice);
  const quantity = new Prisma.Decimal(input.quantity);

  const movement = await tx.stockMovement.create({
    data: {
      stockItemId: input.stockItemId,
      movementType: input.movementType,
      quantity,
      unitCost,
      totalCost: quantity.times(unitCost),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      userId: input.userId,
      shiftId: input.shiftId,
      notes: input.notes,
    },
  });

  await tx.stockItem.update({
    where: { id: input.stockItemId },
    data: { currentStock: { increment: quantity } },
  });

  return movement;
}

/**
 * Recompute and cache a product's cost from its recipe. SIMPLE/SERVICE products
 * keep whatever cost was set directly; RECIPE products are the sum of their
 * ingredients. Returns the new cost.
 */
export async function recomputeProductCost(tx: Tx, productId: number): Promise<Prisma.Decimal> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: { ingredients: { include: { stockItem: true } } },
  });
  if (!product) throw new Error(`Product ${productId} not found`);
  if (product.productType !== 'RECIPE' || product.ingredients.length === 0) {
    return product.costPrice;
  }

  const cost = costPerDrink(
    product.ingredients.map((ing) => ({ quantity: ing.quantity, unitCost: ing.stockItem.costPrice })),
  );
  const updated = await tx.product.update({ where: { id: productId }, data: { costPrice: cost.toFixed(4) } });
  return updated.costPrice;
}
