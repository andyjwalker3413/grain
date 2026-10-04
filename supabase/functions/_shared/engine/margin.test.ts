import { describe, expect, it } from 'vitest';
import { computeCropMargin, type CostLineInput } from './margin.ts';
import { computeCropPosition, type ContractInput } from './position.ts';
import { isAlertTriggered } from './alerts.ts';

const contracts: ContractInput[] = [
  { type: 'fixed', status: 'open', tonnes: 300, priceP: 18200 },
  { type: 'pool', status: 'open', tonnes: 200, priceP: 17800 },
  { type: 'min_price', status: 'open', tonnes: 100, priceP: 17000 },
];

const wheatCosts = (anPriceP: number): CostLineInput[] => [
  { kind: 'linked', qtyPerHa: 0.6, priceP: anPriceP },
  { kind: 'fixed', amountPPerHa: 7790 },
  { kind: 'fixed', amountPPerHa: 8500 },
  { kind: 'fixed', amountPPerHa: 21000 },
  { kind: 'fixed', amountPPerHa: 31000 },
  { kind: 'fixed', amountPPerHa: 46700 },
];

describe('computeCropMargin', () => {
  it('matches Fixture B: margin at blended price £162.60/ha', () => {
    const pos = computeCropPosition({ expectedTonnes: 1020, contracts, referencePriceP: 17650, previousReferencePriceP: 17200 });
    const m = computeCropMargin({ areaHa: 120, expectedTonnes: 1020, totalValueP: pos.totalValueP, costLines: wheatCosts(34000) });
    expect(m.revenuePerHaP).toBe(151650);
    expect(m.costPerHaP).toBe(135390);
    expect(m.marginPerHaP).toBe(16260);
    expect(m.linePerHaP[0]).toBe(20400);
  });

  it('Fixture C: grain £10/t lower cuts revenue by the floor-limited amount', () => {
    const pos = computeCropPosition({ expectedTonnes: 1020, contracts, referencePriceP: 16650, previousReferencePriceP: 17650 });
    const m = computeCropMargin({ areaHa: 120, expectedTonnes: 1020, totalValueP: pos.totalValueP, costLines: wheatCosts(34000) });
    expect(pos.totalValueP).toBe(17713000);
    expect(m.revenuePerHaP).toBe(147608);
  });

  it('returns no totals when a linked price is missing', () => {
    const m = computeCropMargin({ areaHa: 10, expectedTonnes: 80, totalValueP: 100000, costLines: [{ kind: 'linked', qtyPerHa: 1, priceP: null }] });
    expect(m.costPerHaP).toBeNull();
    expect(m.marginPerHaP).toBeNull();
    expect(m.breakevenPerTP).toBeNull();
  });
});

describe('isAlertTriggered', () => {
  it('compares strictly and handles missing values', () => {
    expect(isAlertTriggered(176.5, 'above', 175)).toBe(true);
    expect(isAlertTriggered(175, 'above', 175)).toBe(false);
    expect(isAlertTriggered(-10, 'below', 0)).toBe(true);
    expect(isAlertTriggered(null, 'below', 0)).toBeNull();
  });
});
