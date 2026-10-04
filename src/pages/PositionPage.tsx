import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { useFarm } from '@/farm/FarmProvider';
import { CropSummary } from '@/components/position/CropSummary';
import { ContractsTable } from '@/components/position/ContractsTable';
import { fetchPosition, formatPence, formatTonnes, type CropView } from '@/position/positionData';
import { totalWeeklyMoveP } from '@engine/position.ts';

export function PositionPage() {
  const { farm } = useFarm();
  const [crops, setCrops] = useState<CropView[] | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Position · Grain Desk';
    if (!farm) return;
    fetchPosition(farm.id)
      .then((rows) => {
        setCrops(rows);
        setSelectedId(rows[0]?.id ?? null);
      })
      .catch(() => setError(true));
  }, [farm]);

  const selected = crops?.find((c) => c.id === selectedId) ?? null;
  const farmMove = crops ? totalWeeklyMoveP(crops.map((c) => c.position)) : null;

  return (
    <section className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
            <Layers className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Position</h1>
            <p className="mt-2 max-w-2xl text-base text-ink">
              Your stock and contracts across every merchant, with market moves shown in pounds for {farm?.name ?? 'your farm'}.
            </p>
          </div>
        </div>
        {farmMove !== null && (
          <div className="rounded-lg bg-navy px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-wider text-white/60">Farm move this week</p>
            <p className={`font-serif text-xl font-bold ${farmMove >= 0 ? 'text-gold' : 'text-red-200'}`}>
              {farmMove > 0 ? '+' : ''}
              {formatPence(farmMove)}
            </p>
          </div>
        )}
      </div>

      {farm?.is_demo && (
        <p className="mt-4 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-navy">
          Demo farm: crops, contracts and prices here are synthetic test data.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          We couldn’t load your position. Refresh the page to try again.
        </p>
      ) : !crops ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-rule/40" />
          ))}
        </div>
      ) : crops.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-rule p-8 text-center text-sm text-muted">
          No crops recorded for this farm yet.
        </p>
      ) : (
        <>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Crops">
            {crops.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === selectedId}
                onClick={() => setSelectedId(c.id)}
                className={`shrink-0 rounded-lg border px-4 py-2 text-left transition-colors ${
                  c.id === selectedId ? 'border-navy bg-navy text-white' : 'border-rule bg-card text-navy hover:border-gold/60'
                }`}
              >
                <span className="block text-sm font-medium">{c.name}</span>
                <span className={`block text-xs ${c.id === selectedId ? 'text-white/70' : 'text-muted'}`}>
                  Harvest {c.harvestYear} · {c.areaHa.toLocaleString('en-GB')} ha · {formatTonnes(c.expectedTonnes)}
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div key={selected.id} className="mt-6 animate-fade-up space-y-8">
              <CropSummary crop={selected} />
              <div>
                <h2 className="mb-3 text-lg font-bold">Contracts</h2>
                <ContractsTable contracts={selected.contracts} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
