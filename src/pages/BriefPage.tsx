import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Newspaper, Tractor } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { useFarm } from '@/farm/FarmProvider';
import { fetchPosition, formatPence, formatTonnes, type CropView } from '@/position/positionData';
import { totalWeeklyMoveP } from '@engine/position.ts';

const sectionsSchema = z.array(z.object({ heading: z.string(), body: z.string() }));

interface Brief {
  id: string;
  date: string;
  title: string;
  summary: string;
  sections: z.infer<typeof sectionsSchema>;
}

async function fetchBriefs(): Promise<Brief[]> {
  const { data, error } = await supabase
    .from('briefs')
    .select('id, brief_date, title, summary, sections')
    .order('brief_date', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((b) => {
    const parsed = sectionsSchema.safeParse(b.sections);
    return { id: b.id, date: b.brief_date, title: b.title, summary: b.summary, sections: parsed.success ? parsed.data : [] };
  });
}

function FarmBlock({ farmName, crops }: { farmName: string; crops: CropView[] }) {
  const move = totalWeeklyMoveP(crops.map((c) => c.position));
  return (
    <aside className="rounded-lg bg-navy p-5 text-white">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold">
        <Tractor className="h-4 w-4" aria-hidden="true" />
        For {farmName}
      </p>
      {move !== null && (
        <p className="mt-3 text-sm text-white/80">
          This week’s moves are worth{' '}
          <span className={`font-bold ${move >= 0 ? 'text-gold' : 'text-red-200'}`}>
            {move > 0 ? '+' : ''}
            {formatPence(move)}
          </span>{' '}
          across your unsold and minimum-price grain.
        </p>
      )}
      <ul className="mt-4 divide-y divide-white/10">
        {crops.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="text-white">{c.name}</span>
            <span className="text-right text-white/75">
              {formatTonnes(c.position.unsoldTonnes)} unsold
              {c.position.weeklyMoveP !== null && (
                <span className="ml-2 tabular-nums">
                  {c.position.weeklyMoveP > 0 ? '+' : ''}
                  {formatPence(c.position.weeklyMoveP)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-white/50">Same figures as your Position page. Test data.</p>
    </aside>
  );
}

export function BriefPage() {
  const { farm } = useFarm();
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [crops, setCrops] = useState<CropView[]>([]);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Brief · Grain Desk';
    if (!farm) return;
    Promise.all([fetchBriefs(), fetchPosition(farm.id)])
      .then(([b, c]) => {
        setBriefs(b);
        setCrops(c);
        setSelectedId(b[0]?.id ?? null);
      })
      .catch(() => setError(true));
  }, [farm]);

  const selected = briefs?.find((b) => b.id === selectedId) ?? null;
  const isLatest = selected && briefs && selected.id === briefs[0]?.id;

  return (
    <section className="animate-fade-up">
      <div className="flex items-start gap-4 border-b border-rule pb-6">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
          <Newspaper className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Brief</h1>
          <p className="mt-2 max-w-2xl text-base text-ink">The daily market brief, with a section worked out for your farm.</p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          We couldn’t load the brief. Refresh the page to try again.
        </p>
      ) : !briefs ? (
        <div className="mt-6 h-96 animate-pulse rounded-lg bg-rule/40" aria-hidden="true" />
      ) : briefs.length === 0 || !selected ? (
        <p className="mt-6 rounded-lg border border-dashed border-rule p-8 text-center text-sm text-muted">No briefs published yet.</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[200px_1fr]">
          <nav aria-label="Past briefs" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {briefs.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedId(b.id)}
                aria-current={b.id === selectedId}
                className={`shrink-0 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  b.id === selectedId ? 'bg-navy text-white' : 'text-muted hover:bg-card hover:text-navy'
                }`}
              >
                {format(parseISO(b.date), 'EEE d MMM')}
              </button>
            ))}
          </nav>

          <article key={selected.id} className="animate-fade-up rounded-lg border border-rule bg-card p-6 shadow-card sm:p-8">
            <p className="text-xs font-medium uppercase tracking-wider text-gold-deep">
              {format(parseISO(selected.date), 'EEEE d MMMM yyyy')} · Synthetic test brief
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{selected.title}</h2>
            <p className="mt-4 text-base text-ink">{selected.summary}</p>

            <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_300px]">
              <div className="space-y-6">
                {selected.sections.map((s) => (
                  <section key={s.heading}>
                    <h3 className="text-lg font-bold">{s.heading}</h3>
                    <p className="mt-2 text-sm text-ink">{s.body}</p>
                  </section>
                ))}
              </div>
              {isLatest && farm && crops.length > 0 && <FarmBlock farmName={farm.name} crops={crops} />}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
