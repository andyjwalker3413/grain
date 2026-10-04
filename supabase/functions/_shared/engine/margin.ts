import { roundHalfAwayFromZero } from './position.ts';

export type CostLineInput =
  | { kind: 'fixed'; amountPPerHa: number }
  | { kind: 'linked'; qtyPerHa: number; priceP: number | null };

export interface CropMarginInput {
  areaHa: number;
  expectedTonnes: number;
  totalValueP: number | null;
  costLines: CostLineInput[];
}

export interface CropMargin {
  linePerHaP: (number | null)[];
  costPerHaP: number | null;
  revenuePerHaP: number | null;
  marginPerHaP: number | null;
  marginTotalP: number | null;
  breakevenPerTP: number | null;
}

export function costLinePerHaP(line: CostLineInput): number | null {
  if (line.kind === 'fixed') return line.amountPPerHa;
  return line.priceP === null ? null : roundHalfAwayFromZero(line.qtyPerHa * line.priceP);
}

export function computeCropMargin(input: CropMarginInput): CropMargin {
  const linePerHaP = input.costLines.map(costLinePerHaP);
  const costPerHaP = linePerHaP.some((v) => v === null) ? null : linePerHaP.reduce<number>((a, b) => a + (b ?? 0), 0);
  const revenuePerHaP =
    input.totalValueP === null || input.areaHa <= 0 ? null : roundHalfAwayFromZero(input.totalValueP / input.areaHa);
  const marginPerHaP = costPerHaP === null || revenuePerHaP === null ? null : revenuePerHaP - costPerHaP;
  const marginTotalP =
    costPerHaP === null || input.totalValueP === null ? null : roundHalfAwayFromZero(input.totalValueP - costPerHaP * input.areaHa);
  const breakevenPerTP =
    costPerHaP === null || input.expectedTonnes <= 0
      ? null
      : roundHalfAwayFromZero((costPerHaP * input.areaHa) / input.expectedTonnes);
  return { linePerHaP, costPerHaP, revenuePerHaP, marginPerHaP, marginTotalP, breakevenPerTP };
}
