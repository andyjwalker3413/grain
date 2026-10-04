import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export interface Farm {
  id: string;
  name: string;
  county: string;
  total_ha: number;
  finance_rate: number;
  is_demo: boolean;
}

interface FarmValue {
  farm: Farm | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const FarmContext = createContext<FarmValue | null>(null);

async function loadFarms(): Promise<Farm[]> {
  const { data, error } = await supabase
    .from('farms')
    .select('id, name, county, total_ha, finance_rate, is_demo')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    total_ha: Number(row.total_ha),
    finance_rate: Number(row.finance_rate),
  }));
}

export function FarmProvider({ children }: { children: ReactNode }) {
  const [farm, setFarm] = useState<Farm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let farms = await loadFarms();
      if (farms.length === 0) {
        const { error: rpcError } = await supabase.rpc('create_demo_farm');
        if (rpcError) throw rpcError;
        farms = await loadFarms();
      }
      setFarm(farms[0] ?? null);
    } catch {
      setError('We couldn’t load your farm. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return <FarmContext.Provider value={{ farm, loading, error, retry: load }}>{children}</FarmContext.Provider>;
}

export function useFarm(): FarmValue {
  const value = useContext(FarmContext);
  if (!value) throw new Error('useFarm must be used inside FarmProvider');
  return value;
}
