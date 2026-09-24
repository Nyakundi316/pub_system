import { describe, expect, it } from 'vitest';
import { buildRecommendations, classifyAbc, defaultConfig, type ItemStats } from './recommendations';

function item(partial: Partial<ItemStats> & Pick<ItemStats, 'itemId' | 'name'>): ItemStats {
  return {
    currentStock: 50,
    reorderPoint: 10,
    parLevel: 100,
    onOrder: 0,
    leadTimeDays: 3,
    avgDailyUsage: 5,
    marginPct: 60,
    revenue: 1000,
    unitsSold: 100,
    daysSinceLastSale: 1,
    nearestExpiryDays: null,
    theoreticalUsage: null,
    actualUsage: null,
    ...partial,
  };
}

describe('classifyAbc', () => {
  it('puts the Pareto head in A and the long tail in C', () => {
    const items = [
      item({ itemId: 1, name: 'Lager', revenue: 8000 }),
      item({ itemId: 2, name: 'Wine', revenue: 1500 }),
      item({ itemId: 3, name: 'Obscure bitters', revenue: 500 }),
    ];
    const abc = classifyAbc(items);
    expect(abc.get(1)).toBe('A'); // 80% of revenue
    expect(abc.get(2)).toBe('B'); // next 15%
    expect(abc.get(3)).toBe('C'); // tail
  });

  it('defaults everything to C when there is no revenue', () => {
    const abc = classifyAbc([item({ itemId: 9, name: 'New', revenue: 0, unitsSold: 0 })]);
    expect(abc.get(9)).toBe('C');
  });
});

describe('buildRecommendations', () => {
  it('flags a top seller below its reorder point as an urgent reorder', () => {
    const recs = buildRecommendations([
      item({ itemId: 1, name: 'House Lager', revenue: 9000, currentStock: 8, reorderPoint: 12 }),
    ]);
    const urgent = recs.find((r) => r.action === 'URGENT_REORDER');
    expect(urgent).toBeDefined();
    expect(urgent?.priority).toBe(1);
    expect(urgent?.suggestedOrderQty).toBeGreaterThan(0);
  });

  it('flags high usage variance for investigation', () => {
    const recs = buildRecommendations([
      item({ itemId: 1, name: 'Premium Vodka', revenue: 5000, theoreticalUsage: 100, actualUsage: 120 }),
    ]);
    expect(recs.some((r) => r.action === 'INVESTIGATE_VARIANCE' && r.priority === 1)).toBe(true);
  });

  it('recommends discontinuing dead, low-margin stock', () => {
    const recs = buildRecommendations([
      item({
        itemId: 1,
        name: 'Forgotten Liqueur',
        revenue: 0,
        unitsSold: 0,
        marginPct: 20,
        daysSinceLastSale: 200,
        currentStock: 6,
      }),
    ]);
    expect(recs.some((r) => r.action === 'DISCONTINUE')).toBe(true);
  });

  it('promotes slow-but-profitable near-expiry stock', () => {
    const recs = buildRecommendations([
      item({
        itemId: 1,
        name: 'Seasonal Cider',
        revenue: 100,
        unitsSold: 3,
        marginPct: 55,
        daysSinceLastSale: 70,
        nearestExpiryDays: 5,
        currentStock: 20,
      }),
    ]);
    expect(recs.some((r) => r.action === 'USE_FIRST_NEAR_EXPIRY')).toBe(true);
    expect(recs.some((r) => r.action === 'PROMOTE_OR_BUNDLE')).toBe(true);
  });

  it('sorts the most urgent actions first', () => {
    const recs = buildRecommendations([
      item({ itemId: 1, name: 'A', revenue: 100, daysSinceLastSale: 90, marginPct: 20, currentStock: 5 }),
      item({ itemId: 2, name: 'B', revenue: 9000, currentStock: 2, reorderPoint: 10 }),
    ]);
    expect(recs[0]?.priority).toBe(1);
  });

  it('stays quiet on a healthy mid-tier line', () => {
    const recs = buildRecommendations([
      item({ itemId: 1, name: 'Steady Eddie', revenue: 2000, currentStock: 60, marginPct: 55 }),
    ]);
    expect(recs).toHaveLength(0);
  });
});

describe('defaultConfig', () => {
  it('exposes tunable thresholds', () => {
    expect(defaultConfig.overstockDays).toBe(60);
    expect(defaultConfig.discontinueDays).toBe(90);
  });
});
