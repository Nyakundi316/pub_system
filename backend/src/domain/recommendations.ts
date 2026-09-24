import { daysOfCover, suggestedOrderQty } from './costing';

/**
 * Stock-decision engine. Consumes a per-item statistics snapshot (built by the
 * inventory/reports layer) and emits the actions from the spec's decision table.
 * Pure and deterministic so it can run nightly on a schedule OR on demand, and
 * be unit-tested without a database.
 */

export type RecommendationAction =
  | 'URGENT_REORDER'
  | 'INCREASE_AND_PROMOTE'
  | 'REDUCE_ORDERS'
  | 'PROMOTE_OR_BUNDLE'
  | 'DISCONTINUE'
  | 'INVESTIGATE_VARIANCE'
  | 'USE_FIRST_NEAR_EXPIRY'
  | 'REVIEW_PRICE_OR_SUPPLIER';

export type AbcClass = 'A' | 'B' | 'C';

export interface ItemStats {
  itemId: number;
  name: string;
  currentStock: number;
  reorderPoint: number;
  parLevel: number;
  onOrder: number;
  leadTimeDays: number;
  avgDailyUsage: number; // over the analysis window
  marginPct: number; // gross margin % of the product(s) built on this item
  revenue: number; // attributable revenue in the window
  unitsSold: number;
  daysSinceLastSale: number | null; // null = never sold
  nearestExpiryDays: number | null; // null = not perishable / no batch
  theoreticalUsage: number | null; // for variance; null = not counted
  actualUsage: number | null;
}

export interface EngineConfig {
  highMarginPct: number;
  lowMarginPct: number;
  overstockDays: number;
  deadStockDays: number;
  discontinueDays: number;
  highVariancePct: number;
  nearExpiryDays: number;
  safetyStockDays: number;
  abcAThreshold: number; // cumulative revenue share cutoff for class A
  abcBThreshold: number;
}

export const defaultConfig: EngineConfig = {
  highMarginPct: 65,
  lowMarginPct: 45,
  overstockDays: 60,
  deadStockDays: 60,
  discontinueDays: 90,
  highVariancePct: 5,
  nearExpiryDays: 14,
  safetyStockDays: 3,
  abcAThreshold: 0.8,
  abcBThreshold: 0.95,
};

export interface Recommendation {
  itemId: number;
  name: string;
  action: RecommendationAction;
  priority: 1 | 2 | 3 | 4 | 5; // 1 = act now
  abcClass: AbcClass;
  reason: string;
  suggestedOrderQty?: number;
  metrics: {
    daysOfCover: number | null;
    marginPct: number;
    unitsSold: number;
    variancePct: number | null;
  };
}

/** Classic ABC: sort by revenue desc, walk cumulative share (Pareto). */
export function classifyAbc(items: ItemStats[], config = defaultConfig): Map<number, AbcClass> {
  const totalRevenue = items.reduce((sum, i) => sum + Math.max(i.revenue, 0), 0);
  const classes = new Map<number, AbcClass>();
  if (totalRevenue <= 0) {
    for (const item of items) classes.set(item.itemId, 'C');
    return classes;
  }
  const ranked = [...items].sort((a, b) => b.revenue - a.revenue);
  let cumulative = 0;
  for (const item of ranked) {
    // Classify by the share reached BEFORE this item, so the first item is always
    // A even when it alone dominates revenue (the item that crosses a boundary
    // still belongs to the class it crossed from).
    const shareBefore = cumulative / totalRevenue;
    cumulative += Math.max(item.revenue, 0);
    classes.set(item.itemId, shareBefore < config.abcAThreshold ? 'A' : shareBefore < config.abcBThreshold ? 'B' : 'C');
  }
  return classes;
}

function variancePct(item: ItemStats): number | null {
  if (item.theoreticalUsage == null || item.actualUsage == null) return null;
  if (item.theoreticalUsage === 0) return item.actualUsage === 0 ? 0 : 100;
  return Math.abs((item.theoreticalUsage - item.actualUsage) / item.theoreticalUsage) * 100;
}

/**
 * Evaluate one item against the decision table. An item can legitimately raise
 * more than one flag (e.g. slow-moving AND near expiry), so we return every
 * recommendation that fires and let the caller sort/curate.
 */
function evaluateItem(item: ItemStats, abc: AbcClass, config: EngineConfig): Recommendation[] {
  const out: Recommendation[] = [];
  const cover = daysOfCover(item.currentStock, item.avgDailyUsage);
  const coverNum = cover === null ? null : cover.toNumber();
  const varPct = variancePct(item);
  const isTopSeller = abc === 'A';
  const isSlowSeller = abc === 'C';
  const belowReorder = item.currentStock <= item.reorderPoint;
  const highMargin = item.marginPct >= config.highMarginPct;
  const lowMargin = item.marginPct < config.lowMarginPct;

  const base = (
    action: RecommendationAction,
    priority: Recommendation['priority'],
    reason: string,
    orderQty?: number,
  ): Recommendation => ({
    itemId: item.itemId,
    name: item.name,
    action,
    priority,
    abcClass: abc,
    reason,
    suggestedOrderQty: orderQty,
    metrics: { daysOfCover: coverNum, marginPct: item.marginPct, unitsSold: item.unitsSold, variancePct: varPct },
  });

  const orderQty = suggestedOrderQty({
    parLevel: item.parLevel,
    currentStock: item.currentStock,
    onOrder: item.onOrder,
    expectedUsageBeforeDelivery: item.avgDailyUsage * item.leadTimeDays,
  }).toNumber();

  // Top seller running low → urgent reorder (highest priority).
  if (isTopSeller && belowReorder) {
    out.push(base('URGENT_REORDER', 1, `Class-A seller at/below reorder point (${item.currentStock} ≤ ${item.reorderPoint}).`, orderQty));
  } else if (isTopSeller && highMargin) {
    out.push(base('INCREASE_AND_PROMOTE', 2, `High-margin (${item.marginPct}%) Class-A line — keep well stocked and feature it.`, orderQty > 0 ? orderQty : undefined));
  }

  // High variance → possible theft / over-pour / mis-recording.
  if (varPct != null && varPct >= config.highVariancePct) {
    out.push(base('INVESTIGATE_VARIANCE', 1, `Usage variance ${varPct.toFixed(1)}% exceeds ${config.highVariancePct}% — check for over-pour, theft or recording errors.`));
  }

  // Near expiry → move it before it's a write-off.
  if (item.nearestExpiryDays != null && item.nearestExpiryDays <= config.nearExpiryDays) {
    out.push(base('USE_FIRST_NEAR_EXPIRY', 2, `Batch expires in ${item.nearestExpiryDays} day(s) — prioritise or promote before write-off.`));
  }

  // Dead / slow stock.
  const neverOrStale = item.daysSinceLastSale == null || item.daysSinceLastSale >= config.deadStockDays;
  if (neverOrStale && item.currentStock > 0) {
    const days = item.daysSinceLastSale ?? Infinity;
    if (days >= config.discontinueDays && lowMargin) {
      out.push(base('DISCONTINUE', 3, `No sales in ${days === Infinity ? '90+' : days} days and low margin (${item.marginPct}%) — candidate to discontinue.`));
    } else if (item.marginPct > 0) {
      out.push(base('PROMOTE_OR_BUNDLE', 3, `Slow-moving but still profitable — promote or bundle to shift stock.`));
    }
  } else if (isSlowSeller && coverNum != null && coverNum > config.overstockDays) {
    out.push(base('REDUCE_ORDERS', 4, `${coverNum} days of cover on a Class-C line — cut order sizes and free up cash.`));
  }

  // Low margin but selling well → pricing / supplier review.
  if (lowMargin && (isTopSeller || item.unitsSold > 0) && !neverOrStale) {
    out.push(base('REVIEW_PRICE_OR_SUPPLIER', 4, `Selling volume with thin margin (${item.marginPct}%) — review price or supplier cost.`));
  }

  return out;
}

export function buildRecommendations(items: ItemStats[], config: EngineConfig = defaultConfig): Recommendation[] {
  const abc = classifyAbc(items, config);
  const all = items.flatMap((item) => evaluateItem(item, abc.get(item.itemId) ?? 'C', config));
  // Most urgent first; stable within a priority by revenue impact.
  return all.sort((a, b) => a.priority - b.priority || b.metrics.unitsSold - a.metrics.unitsSold);
}
