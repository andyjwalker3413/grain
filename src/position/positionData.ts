import { supabase } from '@/lib/supabase';
import { fetchLatestPair, type Observation } from '@/markets/marketData';
import { computeCropPosition, type ContractStatus, type ContractType, type CropPosition } from '@engine/position.ts';

export interface ContractRow {
  id: string;
  merchant: string;
  type: ContractType;
  status: ContractStatus;
  tonnes: number;
  priceP: number;
  deliveryMonth: string | null;
  reference: string;
}

export interface CropView {
  id: string;
  name: string;
  harvestYear: number;
  areaHa: number;
  expectedTonnes: number;
  referenceName: string | null;
  referenceLatest: Observation | null;
  referenceP: number | null;
  previousReferenceP: number | null;
  contracts: ContractRow[];
  position: CropPosition;
}

export async function fetchPosition(farmId: string): Promise<CropView[]> {
  const [crops, contracts] = await Promise.all([
    supabase
      .from('crops')
      .select('id, name, harvest_year, area_ha, expected_tonnes, reference_series_id, series:market_series(name)')
      .eq('farm_id', farmId)
      .order('created_at'),
    supabase
      .from('contracts')
      .select('id, crop_id, contract_type, status, tonnes, price_p, delivery_month, reference, merchant:merchants(name)')
      .eq('farm_id', farmId)
      .order('delivery_month'),
  ]);
  if (crops.error) throw crops.error;
  if (contracts.error) throw contracts.error;

  return Promise.all(
    (crops.data ?? []).map(async (crop) => {
      const pair = crop.reference_series_id ? await fetchLatestPair(crop.reference_series_id) : [];
      const series = Array.isArray(crop.series) ? crop.series[0] : crop.series;
      const rows: ContractRow[] = (contracts.data ?? [])
        .filter((c) => c.crop_id === crop.id)
        .map((c) => {
          const merchant = Array.isArray(c.merchant) ? c.merchant[0] : c.merchant;
          return {
            id: c.id,
            merchant: merchant?.name ?? 'Unknown merchant',
            type: c.contract_type as ContractType,
            status: c.status as ContractStatus,
            tonnes: Number(c.tonnes),
            priceP: c.price_p,
            deliveryMonth: c.delivery_month,
            reference: c.reference,
          };
        });
      const expectedTonnes = Number(crop.expected_tonnes);
      const referenceP = pair[0] ? Math.round(pair[0].value * 100) : null;
      const previousReferenceP = pair[1] ? Math.round(pair[1].value * 100) : null;
      return {
        id: crop.id,
        name: crop.name,
        harvestYear: crop.harvest_year,
        areaHa: Number(crop.area_ha),
        expectedTonnes,
        referenceName: series?.name ?? null,
        referenceLatest: pair[0] ?? null,
        referenceP,
        previousReferenceP,
        contracts: rows,
        position: computeCropPosition({
          expectedTonnes,
          contracts: rows,
          referencePriceP: referenceP,
          previousReferencePriceP: previousReferenceP,
        }),
      };
    }),
  );
}

export function formatPence(p: number, decimals = 2): string {
  const pounds = Math.abs(p) / 100;
  const text = pounds.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${p < 0 ? '−' : ''}£${text}`;
}

export function formatTonnes(t: number): string {
  return `${t.toLocaleString('en-GB', { maximumFractionDigits: 1 })} t`;
}
