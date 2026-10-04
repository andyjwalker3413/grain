import { format, parseISO } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert } from 'lucide-react';
import { formatPence, formatTonnes, type CropView } from '@/position/positionData';

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-rule bg-card p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-bold text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function CropSummary({ crop }: { crop: CropView }) {
  const { position: p } = crop;
  const move = p.weeklyMoveP;
  const MoveIcon = move === null || move === 0 ? Minus : move > 0 ? ArrowUpRight : ArrowDownRight;
  const moveTone = move === null || move === 0 ? 'text-navy' : move > 0 ? 'text-emerald-800' : 'text-red-800';
  const committedWidth = Math.min(100, p.committedPct);

  return (
    <div className="space-y-4">
      {p.overCommittedTonnes > 0 && (
        <p role="alert" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          Contracts exceed expected production by {formatTonnes(p.overCommittedTonnes)}.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Committed"
          value={formatTonnes(p.committedTonnes)}
          hint={`${p.committedPct.toLocaleString('en-GB', { minimumFractionDigits: 1 })}% of ${formatTonnes(crop.expectedTonnes)}`}
        />
        <Metric label="Unsold" value={formatTonnes(p.unsoldTonnes)} hint="Valued at today’s reference price" />
        <Metric
          label="Blended price"
          value={p.blendedPriceP === null ? 'No price' : `${formatPence(p.blendedPriceP)}/t`}
          hint="Contracts plus unsold, per tonne"
        />
        <div className="rounded-lg border border-rule bg-card p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">This week’s move</p>
          <p className={`mt-2 flex items-center gap-1 font-serif text-2xl font-bold ${moveTone}`}>
            <MoveIcon className="h-5 w-5" aria-hidden="true" />
            {move === null ? 'No data' : `${move > 0 ? '+' : ''}${formatPence(move)}`}
          </p>
          <p className="mt-1 text-xs text-muted">On unsold and minimum-price tonnes</p>
        </div>
      </div>

      <div className="rounded-lg border border-rule bg-card p-4 shadow-card">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Committed</span>
          <span>Unsold</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-rule/60">
          <div className="h-full rounded-full bg-navy transition-[width] duration-700 ease-out" style={{ width: `${committedWidth}%` }} />
        </div>
        <p className="mt-3 text-xs text-muted">
          {crop.referenceLatest
            ? `Reference: ${crop.referenceName}, ${formatPence(Math.round(crop.referenceLatest.value * 100))}/t on ${format(parseISO(crop.referenceLatest.date), 'd MMM yyyy')} (test data).`
            : 'No reference price available for this crop.'}
        </p>
      </div>
    </div>
  );
}
