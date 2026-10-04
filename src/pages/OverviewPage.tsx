import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LayoutDashboard, MapPin, Sprout } from 'lucide-react';
import { useFarm } from '@/farm/FarmProvider';
import { SeriesCard } from '@/components/markets/SeriesCard';
import { fetchSeries, type Series } from '@/markets/marketData';

const SNAPSHOT_IDS = ['feed-wheat', 'oilseed-rape', 'ammonium-nitrate', 'red-diesel'];

export function OverviewPage() {
  const { farm } = useFarm();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<Series[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.title = 'Overview · Grain Desk';
    fetchSeries()
      .then((rows) => setSnapshot(SNAPSHOT_IDS.flatMap((id) => rows.filter((s) => s.id === id))))
      .catch(() => setError(true));
  }, []);

  return (
    <section className="animate-fade-up">
      <div className="flex items-start gap-4 border-b border-rule pb-6">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
          <LayoutDashboard className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Overview</h1>
          <p className="mt-2 max-w-2xl text-base text-ink">Where you stand today, for {farm?.name ?? 'your farm'}.</p>
        </div>
      </div>

      {farm && (
        <div className="relative mt-6 overflow-hidden rounded-lg bg-navy p-6 text-white shadow-card">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, #D4AF37 0 1px, transparent 1px 22px)' }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              {farm.is_demo && (
                <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold">
                  Demo farm · test data
                </span>
              )}
              <h2 className="mt-3 text-3xl font-bold text-white">{farm.name}</h2>
              <p className="mt-2 flex items-center gap-4 text-sm text-white/75">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {farm.county}
                </span>
                <span className="flex items-center gap-1.5">
                  <Sprout className="h-4 w-4" aria-hidden="true" />
                  {farm.total_ha.toLocaleString('en-GB')} ha
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/position')}
              className="group flex items-center gap-1 rounded-md border border-gold/50 px-3 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold hover:text-navy"
            >
              View position
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold">Market snapshot</h2>
        <button
          type="button"
          onClick={() => navigate('/markets')}
          className="group flex items-center gap-1 text-sm font-medium text-gold-deep hover:text-navy"
        >
          All markets
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          We couldn’t load market prices. Refresh the page to try again.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(snapshot ?? []).map((s) => (
            <SeriesCard key={s.id} series={s} selected={false} onSelect={() => navigate('/markets')} />
          ))}
          {!snapshot &&
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-rule/40" aria-hidden="true" />)}
        </div>
      )}
    </section>
  );
}
