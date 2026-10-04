import { describe, expect, it } from 'vitest';
import { computeCropPosition, roundHalfAwayFromZero, type ContractInput } from './position.ts';

const fixtureA: ContractInput[] = [
  { type: 'fixed', status: 'open', tonnes: 300, priceP: 18200 },
  { type: 'pool', status: 'open', tonnes: 200, priceP: 17800 },
  { type: 'min_price', status: 'open', tonnes: 100, priceP: 17000 },
];

describe('computeCropPosition', () => {
  it('matches Fixture A', () => {
    const r = computeCropPosition({ expectedTonnes: 1020, contracts: fixtureA, referencePriceP: 17650, previousReferencePriceP: 17200 });
    expect(r.committedTonnes).toBe(600);
    expect(r.unsoldTonnes).toBe(420);
    expect(r.committedPct).toBe(58.8);
    expect(r.totalValueP).toBe(18198000);
    expect(r.blendedPriceP).toBe(17841);
    expect(r.weeklyMoveP).toBe(234000);
  });

  it('matches Fixture C (grain down £10/t): minimum price floor limits the fall', () => {
    const r = computeCropPosition({ expectedTonnes: 1020, contracts: fixtureA, referencePriceP: 16650, previousReferencePriceP: 17650 });
    expect(r.weeklyMoveP).toBe(-485000);
    expect(r.blendedPriceP).toBe(17366);
  });

  it('ignores cancelled contracts and flags over-commitment', () => {
    const r = computeCropPosition({
      expectedTonnes: 100,
      contracts: [
        { type: 'fixed', status: 'open', tonnes: 120, priceP: 18000 },
        { type: 'fixed', status: 'cancelled', tonnes: 50, priceP: 18000 },
      ],
      referencePriceP: 17000,
      previousReferencePriceP: 17000,
    });
    expect(r.committedTonnes).toBe(120);
    expect(r.unsoldTonnes).toBe(0);
    expect(r.overCommittedTonnes).toBe(20);
    expect(r.weeklyMoveP).toBe(0);
  });

  it('returns no values without a reference price', () => {
    const r = computeCropPosition({ expectedTonnes: 10, contracts: [], referencePriceP: null, previousReferencePriceP: null });
    expect(r.totalValueP).toBeNull();
    expect(r.blendedPriceP).toBeNull();
    expect(r.weeklyMoveP).toBeNull();
    expect(r.unsoldTonnes).toBe(10);
  });
});

describe('roundHalfAwayFromZero', () => {
  it('rounds halves away from zero', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(169.2375, 2)).toBe(169.24);
  });
});
