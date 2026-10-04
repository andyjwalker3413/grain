import { RotateCcw } from 'lucide-react';
import { formatPence } from '@/position/positionData';

interface Props {
  grainShiftP: number;
  fertShiftP: number;
  onGrain: (p: number) => void;
  onFert: (p: number) => void;
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-navy">{label}</span>
        <span className={`tabular-nums ${value === 0 ? 'text-muted' : value > 0 ? 'text-emerald-800' : 'text-red-800'}`}>
          {value > 0 ? '+' : ''}
          {formatPence(value, 0)}/t
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-navy"
      />
    </label>
  );
}

export function WhatIfPanel({ grainShiftP, fertShiftP, onGrain, onFert }: Props) {
  const changed = grainShiftP !== 0 || fertShiftP !== 0;
  return (
    <div className="rounded-lg border border-rule bg-card p-4 shadow-card sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">What if prices move?</h2>
        <button
          type="button"
          onClick={() => {
            onGrain(0);
            onFert(0);
          }}
          disabled={!changed}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-cream hover:text-navy disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset
        </button>
      </div>
      <div className="mt-4 space-y-5">
        <Slider label="Grain price" value={grainShiftP} min={-4000} max={4000} step={100} onChange={onGrain} />
        <Slider label="Fertiliser price" value={fertShiftP} min={-15000} max={15000} step={500} onChange={onFert} />
      </div>
      <p className="mt-4 text-xs text-muted">
        Moves apply to today’s reference prices. Fixed and pool contracts keep their agreed price; minimum-price contracts never fall below the floor.
      </p>
    </div>
  );
}
