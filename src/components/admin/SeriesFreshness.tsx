import { normaliseFrequency, seriesStaleness, type Staleness } from '@boxlink/staleness.ts';
import type { BoxSeries } from '@/admin/boxLinkData';

const BADGE: Record<Staleness, { label: string; className: string }> = {
  fresh: { label: 'Up to date', className: 'bg-emerald-50 text-emerald-800' },
  stale: { label: 'Overdue', className: 'bg-red-50 text-red-800' },
  no_data: { label: 'No prices yet', className: 'bg-cream text-muted' },
  unknown_frequency: { label: 'No schedule', className: 'bg-amber-50 text-amber-900' },
};

interface Props {
  series: BoxSeries[];
  today: string;
}

export function SeriesFreshness({ series, today }: Props) {
  if (series.length === 0) {
    return <p className="rounded-lg border border-dashed border-rule bg-card px-4 py-6 text-center text-sm text-muted">The box has not sent any series yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-card shadow-card">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-rule text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Series</th>
            <th className="px-4 py-3 font-medium">Schedule</th>
            <th className="px-4 py-3 font-medium">Latest price date</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {series.map((s) => {
            const status = seriesStaleness(s.last_observed_on, normaliseFrequency(s.frequency ?? s.refresh_cadence), today);
            const badge = BADGE[status];
            return (
              <tr key={s.code} className="transition-colors hover:bg-cream/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-navy">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.code} · {s.source_code} · {s.observations} prices
                  </p>
                </td>
                <td className="px-4 py-3 text-ink">{s.frequency ?? s.refresh_cadence ?? 'Not set'}</td>
                <td className="px-4 py-3 text-ink">{s.last_observed_on ?? 'None'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-rule px-4 py-2 text-xs text-muted">
        Overdue allows for weekends and English bank holidays: daily series after 2 working days, weekly after 10, monthly after 45.
      </p>
    </div>
  );
}
