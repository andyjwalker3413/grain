import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { METRIC_LABEL, newRuleSchema } from '@/alerts/alertsData';
import type { AlertDirection, AlertMetric } from '@engine/alerts.ts';

interface Props {
  crops: { id: string; name: string }[];
  onClose: () => void;
  onSave: (rule: { cropId: string; metric: AlertMetric; direction: AlertDirection; threshold: number }) => Promise<void>;
}

export function NewAlertDialog({ crops, onClose, onSave }: Props) {
  const [cropId, setCropId] = useState(crops[0]?.id ?? '');
  const [metric, setMetric] = useState<AlertMetric>('reference_price');
  const [direction, setDirection] = useState<AlertDirection>('above');
  const [threshold, setThreshold] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = newRuleSchema.safeParse({ cropId, metric, direction, threshold: threshold.trim() === '' ? NaN : Number(threshold) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details and try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(parsed.data);
    } catch {
      setError('We couldn’t save this alert. Please try again.');
      setBusy(false);
    }
  };

  const field = 'mt-1 block w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-navy focus:border-gold';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="New alert">
      <button type="button" aria-label="Close" className="absolute inset-0 h-full w-full bg-navy/40" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-t-2xl bg-card p-6 shadow-sheet animate-sheet-up sm:rounded-2xl sm:animate-fade-up"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">New alert</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-cream hover:text-navy" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-navy">
            Crop
            <select className={field} value={cropId} onChange={(e) => setCropId(e.target.value)}>
              {crops.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-navy">
            Watch
            <select className={field} value={metric} onChange={(e) => setMetric(e.target.value as AlertMetric)}>
              {(Object.keys(METRIC_LABEL) as AlertMetric[]).map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-navy">
              When it goes
              <select className={field} value={direction} onChange={(e) => setDirection(e.target.value as AlertDirection)}>
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-navy">
              Level
              <input className={field} inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 180" />
            </label>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-muted hover:bg-cream hover:text-navy">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-lighter disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save alert
          </button>
        </div>
      </form>
    </div>
  );
}
