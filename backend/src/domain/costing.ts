import Decimal from 'decimal.js';

/**
 * Costing & profitability math. Everything here is pure and decimal-precise —
 * no floats touch money. The API deliberately mirrors the formulas in the spec
 * so the numbers on a report can be traced straight back to a function.
 */

export type Numeric = number | string | Decimal;

export const d = (v: Numeric): Decimal => new Decimal(v);

/** Round to 4 dp for money-like values. */
const money = (v: Decimal): Decimal => v.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
/** Round to 2 dp for percentages / ratios shown to humans. */
const pct = (v: Decimal): Decimal => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export interface RecipeLine {
  quantity: Numeric; // amount of the ingredient used in one drink
  unitCost: Numeric; // cost per stock unit
}

/** cost_per_drink = Σ(ingredient qty × stock_item cost_price). */
export function costPerDrink(lines: RecipeLine[]): Decimal {
  return money(
    lines.reduce((sum, line) => sum.plus(d(line.quantity).times(line.unitCost)), new Decimal(0)),
  );
}

/** gross_profit = selling_price − cost. */
export function grossProfit(sellingPrice: Numeric, cost: Numeric): Decimal {
  return money(d(sellingPrice).minus(cost));
}

/** gross_margin_% = (gross_profit ÷ selling_price) × 100. Zero price → 0. */
export function grossMarginPct(sellingPrice: Numeric, cost: Numeric): Decimal {
  const price = d(sellingPrice);
  if (price.isZero()) return new Decimal(0);
  return pct(grossProfit(sellingPrice, cost).dividedBy(price).times(100));
}

/** pour_cost_% = (cost ÷ selling_price) × 100. The bar-industry inverse of margin. */
export function pourCostPct(sellingPrice: Numeric, cost: Numeric): Decimal {
  const price = d(sellingPrice);
  if (price.isZero()) return new Decimal(0);
  return pct(d(cost).dividedBy(price).times(100));
}

export interface PnLInput {
  netSales: Numeric; // sales net of discount, excluding tax
  cogs: Numeric; // cost of goods sold
  operatingExpenses: Numeric;
}

export interface PnLResult {
  netSales: Decimal;
  cogs: Decimal;
  grossProfit: Decimal;
  operatingExpenses: Decimal;
  netProfit: Decimal;
  grossMarginPct: Decimal;
  netMarginPct: Decimal;
}

/** Full P&L block using the exact formulas from the spec. */
export function profitAndLoss(input: PnLInput): PnLResult {
  const netSales = d(input.netSales);
  const cogs = d(input.cogs);
  const opex = d(input.operatingExpenses);
  const gross = netSales.minus(cogs);
  const net = gross.minus(opex);
  const marginPct = (v: Decimal) => (netSales.isZero() ? new Decimal(0) : pct(v.dividedBy(netSales).times(100)));

  return {
    netSales: money(netSales),
    cogs: money(cogs),
    grossProfit: money(gross),
    operatingExpenses: money(opex),
    netProfit: money(net),
    grossMarginPct: marginPct(gross),
    netMarginPct: marginPct(net),
  };
}

/** inventory_turnover = COGS ÷ average_inventory. */
export function inventoryTurnover(cogs: Numeric, averageInventory: Numeric): Decimal {
  const avg = d(averageInventory);
  if (avg.isZero()) return new Decimal(0);
  return d(cogs).dividedBy(avg).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** reorder_point = (avg_daily_usage × lead_time_days) + safety_stock. */
export function reorderPoint(avgDailyUsage: Numeric, leadTimeDays: Numeric, safetyStock: Numeric): Decimal {
  return money(d(avgDailyUsage).times(leadTimeDays).plus(safetyStock));
}

export interface OrderQtyInput {
  parLevel: Numeric;
  currentStock: Numeric;
  onOrder: Numeric;
  expectedUsageBeforeDelivery: Numeric;
}

/**
 * suggested_order_qty = par_level − current_stock − on_order + expected_usage_before_delivery.
 * Never suggest a negative order.
 */
export function suggestedOrderQty(input: OrderQtyInput): Decimal {
  const qty = d(input.parLevel)
    .minus(input.currentStock)
    .minus(input.onOrder)
    .plus(input.expectedUsageBeforeDelivery);
  return money(Decimal.max(qty, 0));
}

/** stock_variance = theoretical_usage − actual_usage. Positive → more used than expected. */
export function stockVariance(theoreticalUsage: Numeric, actualUsage: Numeric): Decimal {
  return money(d(theoreticalUsage).minus(actualUsage));
}

/** Days of stock cover at the current burn rate. Zero usage → Infinity-safe sentinel. */
export function daysOfCover(currentStock: Numeric, avgDailyUsage: Numeric): Decimal | null {
  const usage = d(avgDailyUsage);
  if (usage.lte(0)) return null; // no movement — "cover" is undefined, treat as dead stock upstream
  return d(currentStock).dividedBy(usage).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
}
