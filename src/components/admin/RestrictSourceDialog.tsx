import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { restrictSource, type BoxSource, type Restriction } from '@/admin/boxLinkData';

interface Props {
  source: BoxSource;
  onClose: () => void;
  onSaved: () => void;
}

const asClass = (v: string): Restriction['licenceClass'] => (v === 'chart' ? 'chart' : 'display');
const asScope = (v: string): Restriction['licenceScope'] => (v === 'general' ? 'general' : 'single_client');

export function RestrictSourceDialog({ source, onClose, onSaved }: Props) {
  const [licenceClass, setLicenceClass] = useState(asClass(source.licence_class));
  const [licenceScope, setLicenceScope] = useState(asScope(source.licence_scope));
  const [status, setStatus] = useState<Restriction['status']>(source.status === 'paused' ? 'paused' : 'active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chartAllowed = source.box_licence_class === 'chart';
  const generalAllowed = source.box_licence_scope === 'general';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await restrictSource(source.code, { licenceClass, licenceScope, status });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setBusy(false);
    }
  };

  const field = 'mt-1 block w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-navy focus:border-gold disabled:bg-cream';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Restrict ${source.name}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 h-full w-full bg-navy/40" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-t-2xl bg-card p-6 shadow-sheet animate-sheet-up sm:rounded-2xl sm:animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{source.name}</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-cream hover:text-navy" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-sm text-ink">
          The box’s licence is the most this source may be used for. You can tighten it here, never loosen it.
        </p>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-navy">
            What farms may see
            <select className={field} value={licenceClass} onChange={(e) => setLicenceClass(asClass(e.target.value))}>
              <option value="chart" disabled={!chartAllowed}>
                Prices and charts{chartAllowed ? '' : ' (not allowed by the box)'}
              </option>
              <option value="display">Latest prices only</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-navy">
            Who may see it
            <select className={field} value={licenceScope} onChange={(e) => setLicenceScope(asScope(e.target.value))}>
              <option value="general" disabled={!generalAllowed}>
                Every farm{generalAllowed ? '' : ' (not allowed by the box)'}
              </option>
              <option value="single_client">One named client only (hidden from farms)</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-navy">
            Status
            <select className={field} value={status} onChange={(e) => setStatus(e.target.value === 'paused' ? 'paused' : 'active')}>
              <option value="active">Active</option>
              <option value="paused">Paused (hidden everywhere)</option>
            </select>
          </label>
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
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
