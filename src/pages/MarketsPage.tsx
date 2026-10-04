import { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { SeriesCard } from '@/components/markets/SeriesCard';
import { PriceChart } from '@/components/markets/PriceChart';
import { canChart, fetchSeries, type Commodity, type Series } from '@/markets/marketData';

const FILTERS: { id: Commodity | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'grain', label: 'Grain' },
  { id: 'fertiliser', label: 'Fertiliser' },
  { id: 'fuel', label: 'Fuel' },
];

const AS_OF = new Date();

export function MarketsPage() {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Commodity | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Markets · Grain Desk';
    fetchSeries()
      .then((rows) => {
        setSeries(rows);
        setSelectedId(rows.find((s) => canChart(s.source))?.id ?? rows[0]?.id ?? null);
      })
      .catch(() => setError(true));
  }, []);

  const visible = useMemo(() => (series ?? []).filter((s) => filter === 'all' || s.commodity === filter), [series, filter]);
  const selected = series?.find((s) => s.id === selectedId) ?? null;

  return (
    <section className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
            <Activity className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Markets</h1>
            <p className="mt-2 max-w-2xl text-base text-ink">
              Grain, fertiliser and fuel prices side by side, with the source and date for every series.
            </p>
          </div>
        </div>
        <div className="flex rounded-md border border-rule bg-card p-1 text-sm font-medium" role="group" aria-label="Filter by commodity">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded px-3 py-1.5 transition-colors ${filter === f.id ? 'bg-navy text-white' : 'text-muted hover:text-navy'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-navy">
        All prices on this page are synthetic test data, generated for the prototype. They are not real market prices.
      </p>

      {error ? (
        <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          We couldn’t load the market list. Refresh the page to try again.
        </p>
      ) : !series ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-rule/40" />
          ))}
        </div>
      ) : (
        <>
          {selected && (
            <div className="mt-6">
              <PriceChart series={selected} asOf={AS_OF} />
            </div>
          )}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visible.map((s) => (
              <SeriesCard key={s.id} series={s} selected={s.id === selectedId} onSelect={() => setSelectedId(s.id)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
