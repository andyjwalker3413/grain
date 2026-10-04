import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Bell, BellOff, Megaphone, Plus, Trash2 } from 'lucide-react';
import { useFarm } from '@/farm/FarmProvider';
import { fetchPosition, formatPence, type CropView } from '@/position/positionData';
import { computeCropFigures, fetchCostLines, type CostLineRow } from '@/margin/marginData';
import { METRIC_LABEL, createRule, deleteRule, fetchMessages, fetchRules, setRuleActive, type AlertRule, type DeskMessage } from '@/alerts/alertsData';
import { NewAlertDialog } from '@/components/alerts/NewAlertDialog';
import { isAlertTriggered, type AlertMetric } from '@engine/alerts.ts';

type Tab = 'rules' | 'desk';

function formatMetric(metric: AlertMetric, value: number): string {
  if (metric === 'committed_pct') return `${value.toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`;
  return formatPence(Math.round(value * 100)) + (metric === 'reference_price' ? '/t' : '/ha');
}

export function AlertsPage() {
  const { farm } = useFarm();
  const [tab, setTab] = useState<Tab>('rules');
  const [crops, setCrops] = useState<CropView[] | null>(null);
  const [lines, setLines] = useState<CostLineRow[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [messages, setMessages] = useState<DeskMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!farm) return;
    try {
      const [c, l, r, m] = await Promise.all([fetchPosition(farm.id), fetchCostLines(farm.id), fetchRules(farm.id), fetchMessages(farm.id)]);
      setCrops(c);
      setLines(l);
      setRules(r);
      setMessages(m);
    } catch {
      setError('We couldn’t load your alerts. Refresh the page to try again.');
    }
  }, [farm]);

  useEffect(() => {
    document.title = 'Alerts · Grain Desk';
    load();
  }, [load]);

  const currentValues = useMemo(() => {
    const map = new Map<string, Record<AlertMetric, number | null>>();
    (crops ?? []).forEach((crop) => {
      const { position, margin } = computeCropFigures(crop, lines);
      map.set(crop.id, {
        reference_price: crop.referenceP === null ? null : crop.referenceP / 100,
        margin_per_ha: margin.marginPerHaP === null ? null : margin.marginPerHaP / 100,
        committed_pct: position.committedPct,
      });
    });
    return map;
  }, [crops, lines]);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      await load();
    } catch {
      setError('That change didn’t save. Please try again.');
    }
  };

  const triggeredCount = rules.filter(
    (r) => r.active && isAlertTriggered(currentValues.get(r.cropId)?.[r.metric] ?? null, r.direction, r.threshold),
  ).length;

  return (
    <section className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
            <Bell className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Alerts</h1>
            <p className="mt-2 max-w-2xl text-base text-ink">Alerts set on your own numbers, and every message the desk has sent you.</p>
          </div>
        </div>
        {tab === 'rules' && crops && crops.length > 0 && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-lighter"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New alert
          </button>
        )}
      </div>

      <div className="mt-6 flex gap-1 border-b border-rule" role="tablist">
        {(
          [
            ['rules', `Your alerts${triggeredCount ? ` · ${triggeredCount} triggered` : ''}`],
            ['desk', `From the desk (${messages.length})`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === id ? 'border-gold text-navy' : 'border-transparent text-muted hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {!crops && !error ? (
        <div className="mt-6 space-y-3" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-rule/40" />
          ))}
        </div>
      ) : tab === 'rules' ? (
        <ul className="mt-6 space-y-3">
          {rules.length === 0 && (
            <li className="rounded-lg border border-dashed border-rule p-8 text-center text-sm text-muted">
              No alerts yet. Create one to be told when a price, margin or commitment crosses a level you choose.
            </li>
          )}
          {rules.map((rule) => {
            const crop = crops?.find((c) => c.id === rule.cropId);
            const value = currentValues.get(rule.cropId)?.[rule.metric] ?? null;
            const triggered = isAlertTriggered(value, rule.direction, rule.threshold);
            return (
              <li
                key={rule.id}
                className={`flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4 shadow-card transition-colors ${
                  rule.active && triggered ? 'border-gold' : 'border-rule'
                } ${rule.active ? '' : 'opacity-60'}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy">
                    {crop?.name ?? 'Crop'}: {METRIC_LABEL[rule.metric].replace(/ \(.*\)/, '').toLowerCase()} {rule.direction}{' '}
                    {formatMetric(rule.metric, rule.threshold)}
                  </p>
                  <p className="mt-1 text-xs text-muted">Now {value === null ? 'unavailable' : formatMetric(rule.metric, value)} (test data)</p>
                </div>
                {rule.active && triggered !== null && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      triggered ? 'border-gold bg-gold/15 text-gold-deep' : 'border-rule bg-cream text-muted'
                    }`}
                  >
                    {triggered ? 'Triggered' : 'Watching'}
                  </span>
                )}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => run(() => setRuleActive(rule.id, !rule.active))}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-cream hover:text-navy"
                    aria-label={rule.active ? 'Pause alert' : 'Resume alert'}
                    title={rule.active ? 'Pause' : 'Resume'}
                  >
                    {rule.active ? <BellOff className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm('Delete this alert?') && run(() => deleteRule(rule.id))}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-red-50 hover:text-red-800"
                    aria-label="Delete alert"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="mt-6 space-y-3">
          {messages.length === 0 && (
            <li className="rounded-lg border border-dashed border-rule p-8 text-center text-sm text-muted">No messages from the desk yet.</li>
          )}
          {messages.map((m) => (
            <li key={m.id} className="rounded-lg border border-rule bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy text-gold">
                  {m.kind === 'alert' ? <Bell className="h-4 w-4" aria-hidden="true" /> : <Megaphone className="h-4 w-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy">{m.title}</p>
                  <p className="mt-1 text-sm text-ink">{m.body}</p>
                  <p className="mt-2 text-xs text-muted">{formatDistanceToNow(parseISO(m.createdAt), { addSuffix: true })}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && crops && farm && (
        <NewAlertDialog
          crops={crops}
          onClose={() => setDialogOpen(false)}
          onSave={async (rule) => {
            await createRule(farm.id, rule);
            setDialogOpen(false);
            await load();
          }}
        />
      )}
    </section>
  );
}
