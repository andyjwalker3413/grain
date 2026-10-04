import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, EyeOff, Minus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { canShowValues, fetchLatestPair, formatValue, unitSuffix, type Observation, type Series } from '@/markets/marketData';

interface Props {
  series: Series;
  selected: boolean;
  onSelect: () => void;
}

export function SeriesCard({ series, selected, onSelect }: Props) {
  const showValues = canShowValues(series.source);
  const [pair, setPair] = useState<Observation[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!showValues) return;
    let cancelled = false;
    fetchLatestPair(series.id)
      .then((rows) => !cancelled && setPair(rows))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [series.id, showValues]);

  const latest = pair?.[0];
  const previous = pair?.[1];
  const change = latest && previous ? Math.round((latest.value - previous.value) * 100) / 100 : null;
  const TrendIcon = change === null || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const trendClass =
    change === null || change === 0 ? 'text-muted bg-cream' : change > 0 ? 'text-emerald-800 bg-emerald-50' : 'text-red-800 bg-red-50';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex h-full flex-col rounded-lg border bg-card p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-gold/60 ${
        selected ? 'border-gold ring-1 ring-gold' : 'border-rule'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-navy">{series.name}</p>
        {series.source.is_synthetic && (
          <span className="shrink-0 rounded-full border border-rule px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
            Test data
          </span>
        )}
      </div>

      {!showValues ? (
        <div className="mt-4 flex flex-1 items-start gap-2 text-sm text-muted">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>This source’s licence doesn’t allow prices to be shown.</span>
        </div>
      ) : failed ? (
        <p className="mt-4 flex-1 text-sm text-red-800">Couldn’t load this price.</p>
      ) : !latest ? (
        <div className="mt-4 flex-1 space-y-2" aria-hidden="true">
          <div className="h-7 w-28 animate-pulse rounded bg-rule/60" />
          <div className="h-4 w-20 animate-pulse rounded bg-rule/40" />
        </div>
      ) : (
        <div className="mt-3 flex-1">
          <p className="font-serif text-2xl font-bold text-navy">
            {formatValue(latest.value, series.unit)}
            <span className="ml-1 font-sans text-sm font-normal text-muted">{unitSuffix(series.unit)}</span>
          </p>
          <span className={`mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${trendClass}`}>
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {change === null ? 'No prior week' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatValue(Math.abs(change), series.unit)} on the week`}
          </span>
        </div>
      )}

      <p className="mt-4 border-t border-rule pt-3 text-xs text-muted">
        {series.source.name}
        {latest && ` · ${format(parseISO(latest.date), 'd MMM yyyy')}`}
      </p>
    </button>
  );
}
