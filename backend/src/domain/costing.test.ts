import { describe, expect, it } from 'vitest';
import {
  costPerDrink,
  daysOfCover,
  grossMarginPct,
  grossProfit,
  inventoryTurnover,
  pourCostPct,
  profitAndLoss,
  reorderPoint,
  stockVariance,
  suggestedOrderQty,
} from './costing';

describe('costPerDrink', () => {
  it('sums qty × unit cost across a recipe with decimal precision', () => {
    // 45ml gin @ 0.40/ml + 15ml vermouth @ 0.20/ml + 1 olive @ 0.50
    const cost = costPerDrink([
      { quantity: 45, unitCost: 0.4 },
      { quantity: 15, unitCost: 0.2 },
      { quantity: 1, unitCost: 0.5 },
    ]);
    expect(cost.toString()).toBe('21.5');
  });

  it('is 0 for an empty recipe', () => {
    expect(costPerDrink([]).toString()).toBe('0');
  });
});

describe('margins', () => {
  it('gross profit = price − cost', () => {
    expect(grossProfit(500, 120).toString()).toBe('380');
  });
  it('gross margin % = profit / price × 100', () => {
    expect(grossMarginPct(500, 120).toString()).toBe('76');
  });
  it('pour cost % = cost / price × 100', () => {
    expect(pourCostPct(500, 120).toString()).toBe('24');
  });
  it('guards divide-by-zero on a zero price', () => {
    expect(grossMarginPct(0, 10).toString()).toBe('0');
    expect(pourCostPct(0, 10).toString()).toBe('0');
  });
});

describe('profitAndLoss', () => {
  it('computes gross/net profit and both margins', () => {
    const r = profitAndLoss({ netSales: 100000, cogs: 32000, operatingExpenses: 40000 });
    expect(r.grossProfit.toString()).toBe('68000');
    expect(r.netProfit.toString()).toBe('28000');
    expect(r.grossMarginPct.toString()).toBe('68');
    expect(r.netMarginPct.toString()).toBe('28');
  });
  it('handles zero sales without throwing', () => {
    const r = profitAndLoss({ netSales: 0, cogs: 0, operatingExpenses: 500 });
    expect(r.netProfit.toString()).toBe('-500');
    expect(r.netMarginPct.toString()).toBe('0');
  });
});

describe('replenishment math', () => {
  it('reorder point = avg daily usage × lead time + safety stock', () => {
    expect(reorderPoint(8, 3, 10).toString()).toBe('34');
  });
  it('suggested order qty follows par − current − onOrder + expected usage', () => {
    expect(
      suggestedOrderQty({ parLevel: 100, currentStock: 20, onOrder: 10, expectedUsageBeforeDelivery: 24 }).toString(),
    ).toBe('94');
  });
  it('never suggests a negative order', () => {
    expect(
      suggestedOrderQty({ parLevel: 10, currentStock: 40, onOrder: 5, expectedUsageBeforeDelivery: 0 }).toString(),
    ).toBe('0');
  });
});

describe('turnover, variance, cover', () => {
  it('inventory turnover = COGS / average inventory', () => {
    expect(inventoryTurnover(120000, 30000).toString()).toBe('4');
  });
  it('stock variance = theoretical − actual usage', () => {
    expect(stockVariance(50, 58).toString()).toBe('-8');
  });
  it('days of cover divides stock by daily usage, null when no movement', () => {
    expect(daysOfCover(60, 8)?.toString()).toBe('7.5');
    expect(daysOfCover(60, 0)).toBeNull();
  });
});
