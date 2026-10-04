import { Wheat } from 'lucide-react';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-gold/40 bg-navy-light">
        <Wheat className="h-5 w-5 text-gold" aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <span className="font-serif text-lg font-bold leading-tight text-white">Grain Desk</span>
        {!compact && (
          <span className="text-xs uppercase tracking-[0.16em] text-gold/90">Independent</span>
        )}
      </span>
    </div>
  );
}
