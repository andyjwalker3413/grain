import { useEffect } from 'react';
import type { NavItem } from '@/app/navigation';

export function SectionPage({ item }: { item: NavItem }) {
  const Icon = item.icon;

  useEffect(() => {
    document.title = `${item.label} · Grain Desk`;
  }, [item.label]);

  return (
    <section key={item.path} className="animate-fade-up">
      <div className="flex items-start gap-4 border-b border-rule pb-6">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">{item.label}</h1>
          <p className="mt-2 max-w-2xl text-base text-ink">{item.description}</p>
        </div>
      </div>
    </section>
  );
}
