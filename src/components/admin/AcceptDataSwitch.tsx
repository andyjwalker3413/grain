import { useState } from 'react';
import { Loader2, Power } from 'lucide-react';
import { formatWhen, setAccepting } from '@/admin/boxLinkData';

interface Props {
  accepting: boolean;
  updatedAt: string | null | undefined;
  onChanged: () => void;
}

export function AcceptDataSwitch({ accepting, updatedAt, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await setAccepting(!accepting);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the switch.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-lg border p-5 shadow-card transition-colors ${accepting ? 'border-rule bg-card' : 'border-amber-300 bg-amber-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${accepting ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
            <Power className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p id="accept-label" className="font-medium text-navy">Accept data from the box</p>
            <p className="mt-1 text-sm text-ink">
              {accepting
                ? 'The box can send catalogues, prices, briefs and heartbeats.'
                : 'Paused. Every delivery from the box is turned away until you switch this back on.'}
            </p>
            <p className="mt-1 text-xs text-muted">Last changed {formatWhen(updatedAt)}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={accepting}
          aria-labelledby="accept-label"
          disabled={busy}
          onClick={toggle}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${accepting ? 'bg-navy' : 'bg-rule'}`}
        >
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow transition-transform duration-200 ${accepting ? 'translate-x-7' : 'translate-x-1'}`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-navy" aria-hidden="true" />}
          </span>
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
