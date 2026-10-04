import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { londonToday } from '@boxlink/staleness.ts';
import { useAdmin } from '@/admin/AdminProvider';
import { fetchHealth, type BoxHealth } from '@/admin/boxLinkData';
import { AcceptDataSwitch } from '@/components/admin/AcceptDataSwitch';
import { BoxSourcesTable } from '@/components/admin/BoxSourcesTable';
import { DailyCycleCard } from '@/components/admin/DailyCycleCard';
import { RecentCalls } from '@/components/admin/RecentCalls';
import { SeriesFreshness } from '@/components/admin/SeriesFreshness';
import { StreamHealth } from '@/components/admin/StreamHealth';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function AdminPage() {
  const { checked, isAdmin } = useAdmin();
  const [health, setHealth] = useState<BoxHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setHealth(await fetchHealth());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the box link health.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Admin · Grain Desk';
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!checked) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking your access…
      </p>
    );
  }

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-lg animate-fade-up rounded-lg border border-rule bg-card p-8 text-center shadow-card">
        <ShieldCheck className="mx-auto h-8 w-8 text-gold-deep" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">Desk admins only</h1>
        <p className="mt-2 text-sm text-ink">This page is for the people who run Grain Desk. Your account doesn’t have admin access.</p>
      </section>
    );
  }

  return (
    <section className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold-deep">Admin</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Box link</h1>
          <p className="mt-2 max-w-2xl text-base text-ink">What the box has delivered, how fresh it is, and how its sources may be used.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-md border border-rule bg-card px-3 py-2 text-sm font-medium text-navy transition-colors hover:border-gold disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {!health ? (
        !error && <div className="mt-6 h-40 animate-pulse rounded-lg bg-rule/40" aria-hidden="true" />
      ) : (
        <>
          <div className="mt-6">
            <AcceptDataSwitch accepting={health.settings?.accept_data ?? true} updatedAt={health.settings?.updated_at} onChanged={() => void load()} />
          </div>
          <Section title="Health">
            <div className="grid gap-4 lg:grid-cols-2">
              <StreamHealth health={health} />
              <DailyCycleCard lastCycle={health.last_cycle} onRan={() => void load()} />
            </div>
          </Section>
          <Section title="Series freshness">
            <SeriesFreshness series={health.series} today={londonToday(new Date())} />
          </Section>
          <Section title="Sources from the box">
            <BoxSourcesTable sources={health.sources} onChanged={() => void load()} />
          </Section>
          <Section title="Activity">
            <RecentCalls health={health} />
          </Section>
        </>
      )}
    </section>
  );
}
