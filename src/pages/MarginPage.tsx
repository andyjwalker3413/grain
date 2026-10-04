import { useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { useFarm } from '@/farm/FarmProvider';
import { fetchPosition, formatPence, type CropView } from '@/position/positionData';
import { computeCropFigures, fetchCostLines, type CostLineRow } from '@/margin/marginData';
import { MarginBreakdown } from '@/components/margin/MarginBreakdown';
import { WhatIfPanel } from '@/components/margin/WhatIfPanel';

function Metric({ label, value, tone = 'text-navy', hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-rule bg-card p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 font-serif text-2xl font-bold ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function MarginPage() {
  const { farm } = useFarm();
  const [crops, setCrops] = useState<CropView[] | null>(null);
  const [lines, setLines] = useState<CostLineRow[]>([]);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grainShiftP, setGrainShiftP] = useState(0);
  const [fertShiftP, setFertShiftP] = useState(0);

  useEffect(() => {
    document.title = 'Margin · Grain Desk';
    if (!farm) return;
    Promise.all([fetchPosition(farm.id), fetchCostLines(farm.id)])
      .then(([cropRows, lineRows]) => {
        setCrops(cropRows);
        setLines(lineRows);
        setSelectedId(cropRows[0]?.id ?? null);
      })
      .catch(() => setError(true));
  }, [farm]);

  const results = useMemo(
    () => (crops ?? []).map((crop) => computeCropFigures(crop, lines, grainShiftP, fertShiftP)),
    [crops, lines, grainShiftP, fertShiftP],
  );

  const selected = results.find((r) => r.crop.id === selectedId) ?? null;
  const whatIf = grainShiftP !== 0 || fertShiftP !== 0;

  return (
    <section className="animate-fade-up">
      <div className="flex items-start gap-4 border-b border-rule pb-6">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
          <Calculator className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Margin</h1>
          <p className="mt-2 max-w-2xl text-base text-ink">
            Grain price minus fertiliser, fuel and other costs, per hectare and per tonne, against your breakeven.
          </p>
        </div>
      </div>

      {farm?.is_demo && (
        <p className="mt-4 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-navy">
          Demo farm: costs, contracts and prices here are synthetic test data.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          We couldn’t load your margins. Refresh the page to try again.
        </p>
      ) : !crops ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-rule/40" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-rule p-8 text-center text-sm text-muted">No crops recorded for this farm yet.</p>
      ) : (
        <>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Crops">
            {results.map(({ crop, margin }) => {
              const active = crop.id === selectedId;
              return (
                <button
                  key={crop.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedId(crop.id)}
                  className={`shrink-0 rounded-lg border px-4 py-2 text-left transition-colors ${
                    active ? 'border-navy bg-navy text-white' : 'border-rule bg-card text-navy hover:border-gold/60'
                  }`}
                >
                  <span className="block text-sm font-medium">{crop.name}</span>
                  <span className={`block text-xs ${active ? 'text-white/70' : 'text-muted'}`}>
                    {margin.marginPerHaP === null ? 'Margin unavailable' : `${formatPence(margin.marginPerHaP)}/ha margin`}
                  </span>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {whatIf && (
                  <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    Showing a what-if scenario, not today’s figures.
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Metric
                    label="Revenue"
                    value={selected.margin.revenuePerHaP === null ? 'No price' : `${formatPence(selected.margin.revenuePerHaP)}/ha`}
                    hint={selected.position.blendedPriceP === null ? undefined : `At a blended ${formatPence(selected.position.blendedPriceP)}/t`}
                  />
                  <Metric
                    label="Costs"
                    value={selected.margin.costPerHaP === null ? 'Incomplete' : `${formatPence(selected.margin.costPerHaP)}/ha`}
                    hint={`${selected.crop.areaHa.toLocaleString('en-GB')} ha`}
                  />
                  <Metric
                    label="Margin"
                    value={selected.margin.marginPerHaP === null ? '—' : `${formatPence(selected.margin.marginPerHaP)}/ha`}
                    tone={selected.margin.marginPerHaP === null ? 'text-navy' : selected.margin.marginPerHaP >= 0 ? 'text-emerald-800' : 'text-red-800'}
                    hint={selected.margin.marginTotalP === null ? undefined : `${formatPence(selected.margin.marginTotalP, 0)} across the crop`}
                  />
                  <Metric
                    label="Breakeven"
                    value={selected.margin.breakevenPerTP === null ? '—' : `${formatPence(selected.margin.breakevenPerTP)}/t`}
                    hint="Total costs divided by expected tonnes"
                  />
                </div>
                <MarginBreakdown lines={selected.lines} margin={selected.margin} />
              </div>
              <div className="lg:sticky lg:top-6 lg:self-start">
                <WhatIfPanel grainShiftP={grainShiftP} fertShiftP={fertShiftP} onGrain={setGrainShiftP} onFert={setFertShiftP} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
