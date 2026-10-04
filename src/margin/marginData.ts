import { supabase } from '@/lib/supabase';
import { fetchLatestPair } from '@/markets/marketData';
import type { CropView } from '@/position/positionData';
import { computeCropMargin, type CostLineInput } from '@engine/margin.ts';
import { computeCropPosition } from '@engine/position.ts';

export interface CostLineRow {
  id: string;
  cropId: string;
  name: string;
  category: string;
  seriesName: string | null;
  seriesUnit: string | null;
  qtyPerHa: number | null;
  input: CostLineInput;
}

export async function fetchCostLines(farmId: string): Promise<CostLineRow[]> {
  const { data, error } = await supabase
    .from('cost_lines')
    .select('id, crop_id, name, category, amount_p_per_ha, qty_per_ha, series_id, sort_order, series:market_series(name, unit)')
    .eq('farm_id', farmId)
    .order('sort_order');
  if (error) throw error;

  const seriesIds = [...new Set((data ?? []).map((r) => r.series_id).filter((id): id is string => !!id))];
  const latest = new Map<string, number | null>();
  await Promise.all(
    seriesIds.map(async (id) => {
      const pair = await fetchLatestPair(id);
      latest.set(id, pair[0] ? Math.round(pair[0].value * 100) : null);
    }),
  );

  return (data ?? []).map((r) => {
    const series = Array.isArray(r.series) ? r.series[0] : r.series;
    const input: CostLineInput =
      r.series_id && r.qty_per_ha !== null
        ? { kind: 'linked', qtyPerHa: Number(r.qty_per_ha), priceP: latest.get(r.series_id) ?? null }
        : { kind: 'fixed', amountPPerHa: r.amount_p_per_ha ?? 0 };
    return {
      id: r.id,
      cropId: r.crop_id,
      name: r.name,
      category: r.category,
      seriesName: series?.name ?? null,
      seriesUnit: series?.unit ?? null,
      qtyPerHa: r.qty_per_ha === null ? null : Number(r.qty_per_ha),
      input,
    };
  });
}

export function shiftLinkedFertiliser(line: CostLineRow, shiftP: number): CostLineInput {
  if (line.input.kind !== 'linked' || line.category !== 'fertiliser' || line.input.priceP === null) return line.input;
  return { ...line.input, priceP: Math.max(0, line.input.priceP + shiftP) };
}

export function computeCropFigures(crop: CropView, allLines: CostLineRow[], grainShiftP = 0, fertShiftP = 0) {
  const lines = allLines.filter((l) => l.cropId === crop.id).map((l) => ({ ...l, input: shiftLinkedFertiliser(l, fertShiftP) }));
  const position = computeCropPosition({
    expectedTonnes: crop.expectedTonnes,
    contracts: crop.contracts,
    referencePriceP: crop.referenceP === null ? null : Math.max(0, crop.referenceP + grainShiftP),
    previousReferencePriceP: crop.previousReferenceP,
  });
  const margin = computeCropMargin({
    areaHa: crop.areaHa,
    expectedTonnes: crop.expectedTonnes,
    totalValueP: position.totalValueP,
    costLines: lines.map((l) => l.input),
  });
  return { crop, position, margin, lines };
}
