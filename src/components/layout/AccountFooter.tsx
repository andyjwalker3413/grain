import { LogOut } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useFarm } from '@/farm/FarmProvider';

export function AccountFooter({ compact = false }: { compact?: boolean }) {
  const { signOut } = useAuth();
  const { farm } = useFarm();

  if (compact) {
    return (
      <button
        type="button"
        onClick={signOut}
        className="ml-auto flex h-11 w-11 items-center justify-center rounded-md text-white/75 hover:bg-navy-light hover:text-white"
        aria-label="Sign out"
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{farm?.name}</p>
        <p className="text-xs text-white/60">{farm?.is_demo ? 'Demo farm · test data' : farm?.county}</p>
      </div>
      <button
        type="button"
        onClick={signOut}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-navy-light hover:text-white focus-visible:ring-offset-navy"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
