import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, PlugZap } from 'lucide-react';
import { useFarm } from '@/farm/FarmProvider';
import { fetchPosition, formatPence, formatTonnes, type CropView } from '@/position/positionData';

const SUGGESTIONS = [
  'How much wheat do I still have unsold?',
  'What did this week’s price move do to my position?',
  'Where is my breakeven on barley?',
  'Summarise my open contracts with Merchant A.',
];

export function DeskChatPage() {
  const { farm } = useFarm();
  const [crops, setCrops] = useState<CropView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    document.title = 'Desk chat · Grain Desk';
    if (!farm) return;
    fetchPosition(farm.id).then(setCrops).catch(() => setFailed(true));
  }, [farm]);

  return (
    <section className="animate-fade-up">
      <div className="flex items-start gap-4 border-b border-rule pb-6">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
          <MessageSquare className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Desk chat</h1>
          <p className="mt-2 max-w-2xl text-base text-ink">Ask questions about your own position and get answers built from your farm’s figures.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-h-[420px] flex-col rounded-lg border border-rule bg-card shadow-card">
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold-deep">
              <PlugZap className="h-7 w-7" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-bold">The desk’s AI isn’t connected yet</h2>
            <p className="mt-2 max-w-md text-sm text-ink">
              Chat will open here once the AI service is switched on. It will only answer from your own figures, never guesses, and show where each number came from.
            </p>
            <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <span key={s} className="rounded-full border border-rule bg-cream px-3 py-1.5 text-xs text-muted">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="border-t border-rule p-4">
            <input
              disabled
              placeholder="Chat opens once the AI service is connected"
              className="w-full cursor-not-allowed rounded-md border border-rule bg-cream px-3 py-2 text-sm text-muted"
            />
          </div>
        </div>

        <aside className="rounded-lg bg-navy p-5 text-white">
          <p className="text-xs uppercase tracking-wider text-gold">What the desk will work from</p>
          {failed ? (
            <p className="mt-3 text-sm text-red-200">Your figures couldn’t be loaded. Refresh to try again.</p>
          ) : !crops ? (
            <div className="mt-4 h-32 animate-pulse rounded bg-white/10" aria-hidden="true" />
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {crops.map((c) => (
                <li key={c.id} className="py-2 text-sm">
                  <p className="text-white">{c.name}</p>
                  <p className="text-white/70">
                    {formatTonnes(c.position.committedTonnes)} committed, {formatTonnes(c.position.unsoldTonnes)} unsold
                    {c.position.blendedPriceP !== null && ` · ${formatPence(c.position.blendedPriceP)}/t blended`}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link to="/position" className="mt-4 inline-block text-sm font-medium text-gold hover:underline">
            See full position
          </Link>
          <p className="mt-3 text-xs text-white/50">Test data.</p>
        </aside>
      </div>
    </section>
  );
}
