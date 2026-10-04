import { formatPence } from '@/position/positionData';
import type { CostLineRow } from '@/margin/marginData';
import type { CropMargin } from '@engine/margin.ts';

const CATEGORY_COLOUR: Record<string, string> = {
  fertiliser: 'bg-emerald-700',
  fuel: 'bg-amber-600',
  seed: 'bg-sky-700',
  sprays: 'bg-teal-600',
  machinery: 'bg-navy',
  overheads: 'bg-slate-500',
  other: 'bg-slate-400',
};

export function MarginBreakdown({ lines, margin }: { lines: CostLineRow[]; margin: CropMargin }) {
  const max = Math.max(1, ...margin.linePerHaP.map((v) => v ?? 0));

  return (
    <div className="rounded-lg border border-rule bg-card p-4 shadow-card sm:p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Costs per hectare</h2>
        <p className="text-sm font-medium text-navy">{margin.costPerHaP === null ? 'Incomplete' : `${formatPence(margin.costPerHaP)}/ha`}</p>
      </div>
      <ul className="mt-4 space-y-3">
        {lines.map((line, i) => {
          const value = margin.linePerHaP[i];
          return (
            <li key={line.id}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-navy">
                  {line.name}
                  {line.input.kind === 'linked' && line.qtyPerHa !== null && (
                    <span className="ml-2 text-xs text-muted">
                      {line.qtyPerHa} t/ha × {line.input.priceP === null ? 'no price' : `${formatPence(line.input.priceP)}/t`}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-ink">{value === null ? 'No price' : formatPence(value)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-rule/50">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-out ${CATEGORY_COLOUR[line.category] ?? 'bg-slate-400'}`}
                  style={{ width: `${((value ?? 0) / max) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
