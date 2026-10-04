export type ContractType = 'fixed' | 'pool' | 'min_price';
export type ContractStatus = 'open' | 'delivered' | 'cancelled';

export interface ContractInput {
  type: ContractType;
  status: ContractStatus;
  tonnes: number;
  priceP: number;
}

export interface CropPositionInput {
  expectedTonnes: number;
  contracts: ContractInput[];
  referencePriceP: number | null;
  previousReferencePriceP: number | null;
}

export interface CropPosition {
  committedTonnes: number;
  unsoldTonnes: number;
  overCommittedTonnes: number;
  committedPct: number;
  totalValueP: number | null;
  blendedPriceP: number | null;
  weeklyMoveP: number | null;
}

export function roundHalfAwayFromZero(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  const scaled = Math.abs(value) * factor;
  const rounded = Math.round(Number(scaled.toPrecision(15)));
  return (Math.sign(value) * rounded) / factor;
}

const toKg = (tonnes: number) => Math.round(tonnes * 1000);
const valueP = (kg: number, pricePPerT: number) => (kg * pricePPerT) / 1000;

function effectivePriceP(contract: ContractInput, referenceP: number): number {
  return contract.type === 'min_price' ? Math.max(contract.priceP, referenceP) : contract.priceP;
}

export function totalWeeklyMoveP(positions: CropPosition[]): number | null {
  const moves = positions.map((p) => p.weeklyMoveP).filter((m): m is number => m !== null);
  return moves.length === 0 ? null : moves.reduce((a, b) => a + b, 0);
}

export function computeCropPosition(input: CropPositionInput): CropPosition {
  const live = input.contracts.filter((c) => c.status !== 'cancelled');
  const expectedKg = toKg(input.expectedTonnes);
  const committedKg = live.reduce((sum, c) => sum + toKg(c.tonnes), 0);
  const unsoldKg = Math.max(0, expectedKg - committedKg);

  const base = {
    committedTonnes: committedKg / 1000,
    unsoldTonnes: unsoldKg / 1000,
    overCommittedTonnes: Math.max(0, committedKg - expectedKg) / 1000,
    committedPct: expectedKg === 0 ? 0 : roundHalfAwayFromZero((committedKg / expectedKg) * 100, 1),
  };

  const ref = input.referencePriceP;
  if (ref === null) return { ...base, totalValueP: null, blendedPriceP: null, weeklyMoveP: null };

  const totalRaw = live.reduce((sum, c) => sum + valueP(toKg(c.tonnes), effectivePriceP(c, ref)), 0) + valueP(unsoldKg, ref);
  const valuedKg = committedKg + unsoldKg;

  const prev = input.previousReferencePriceP;
  const weeklyMoveP =
    prev === null
      ? null
      : roundHalfAwayFromZero(
          valueP(unsoldKg, ref - prev) +
            live
              .filter((c) => c.type === 'min_price')
              .reduce((sum, c) => sum + valueP(toKg(c.tonnes), effectivePriceP(c, ref) - effectivePriceP(c, prev)), 0),
        );

  return {
    ...base,
    totalValueP: roundHalfAwayFromZero(totalRaw),
    blendedPriceP: valuedKg === 0 ? null : roundHalfAwayFromZero((totalRaw * 1000) / valuedKg),
    weeklyMoveP,
  };
}
