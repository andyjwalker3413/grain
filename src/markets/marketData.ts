import { supabase } from '@/lib/supabase';

export type Commodity = 'grain' | 'fertiliser' | 'fuel';
export type LicenceClass = 'display' | 'chart' | 'describe_only' | 'store';

export interface Source {
  id: string;
  name: string;
  licence_class: LicenceClass;
  status: 'active' | 'paused';
  is_synthetic: boolean;
}

export interface Series {
  id: string;
  name: string;
  unit: string;
  commodity: Commodity;
  source: Source;
}

export interface Observation {
  date: string;
  value: number;
}

export const canShowValues = (source: Source) =>
  source.status === 'active' && (source.licence_class === 'display' || source.licence_class === 'chart');

export const canChart = (source: Source) => source.status === 'active' && source.licence_class === 'chart';

export async function fetchSeries(): Promise<Series[]> {
  const { data, error } = await supabase
    .from('market_series')
    .select('id, name, unit, commodity, sort_order, source:sources(id, name, licence_class, status, is_synthetic)')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const source = Array.isArray(row.source) ? row.source[0] : row.source;
    if (!source) return [];
    return [{ id: row.id, name: row.name, unit: row.unit, commodity: row.commodity as Commodity, source: source as Source }];
  });
}

export async function fetchObservations(seriesId: string, since: string): Promise<Observation[]> {
  const { data, error } = await supabase
    .from('market_observations')
    .select('observed_on, value')
    .eq('series_id', seriesId)
    .gte('observed_on', since)
    .order('observed_on');
  if (error) throw error;
  return (data ?? []).map((row) => ({ date: row.observed_on, value: Number(row.value) }));
}

export async function fetchLatestPair(seriesId: string): Promise<Observation[]> {
  const { data, error } = await supabase
    .from('market_observations')
    .select('observed_on, value')
    .eq('series_id', seriesId)
    .order('observed_on', { ascending: false })
    .limit(2);
  if (error) throw error;
  return (data ?? []).map((row) => ({ date: row.observed_on, value: Number(row.value) }));
}

export function formatValue(value: number, unit: string): string {
  const n = value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return unit.startsWith('£') ? `£${n}` : `${n}p`;
}

export function unitSuffix(unit: string): string {
  return unit.startsWith('£') ? unit.slice(1) : '/litre';
}
