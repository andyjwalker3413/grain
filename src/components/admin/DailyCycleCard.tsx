import { useState } from 'react';
import { CalendarClock, Loader2, Play } from 'lucide-react';
import { londonToday } from '@boxlink/staleness.ts';
import { formatWhen, runDailyCycle, type BoxHealth } from '@/admin/boxLinkData';

interface Props {
  lastCycle: BoxHealth['last_cycle'];
  onRan: () => void;
}

export function DailyCycleCard({ lastCycle, onRan }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await runDailyCycle(londonToday(new Date()));
      setResult({ tone: 'ok', text: `Checked ${r.received} alert rules; ${r.inserted} new alerts raised.` });
      onRan();
    } catch (err) {
      setResult({ tone: 'error', text: err instanceof Error ? err.message : 'The daily cycle did not run.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-rule bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gold-deep" aria-hidden="true" />
          <div>
            <p className="font-medium text-navy">Daily cycle</p>
            {lastCycle ? (
              <p className="mt-1 text-sm text-ink">
                {lastCycle.ok ? 'Completed' : 'Failed'} for {lastCycle.as_of} at {formatWhen(lastCycle.started_at)} ({lastCycle.triggered_by}).{' '}
                {lastCycle.rules_evaluated} rules checked, {lastCycle.events_created} alerts, {lastCycle.messages_created} messages queued.
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink">Has not run yet.</p>
            )}
            <p className="mt-1 text-xs text-muted">Running it twice for the same day never raises the same alert twice.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-lighter disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          Run now
        </button>
      </div>
      {result && (
        <p
          role={result.tone === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${
            result.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
