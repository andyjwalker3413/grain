import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface AdminState {
  checked: boolean;
  isAdmin: boolean;
}

const AdminContext = createContext<AdminState>({ checked: false, isAdmin: false });

async function checkAdmin(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('admin-sync', { body: {} });
  if (!error && data && typeof data.is_admin === 'boolean') return data.is_admin;
  const fallback = await supabase.from('app_admins').select('user_id').maybeSingle();
  return !fallback.error && Boolean(fallback.data);
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminState>({ checked: false, isAdmin: false });

  useEffect(() => {
    let cancelled = false;
    checkAdmin()
      .then((isAdmin) => !cancelled && setState({ checked: true, isAdmin }))
      .catch(() => !cancelled && setState({ checked: true, isAdmin: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  return <AdminContext.Provider value={state}>{children}</AdminContext.Provider>;
}

export const useAdmin = () => useContext(AdminContext);
