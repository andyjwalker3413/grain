import { AlertTriangle } from 'lucide-react';
import { STREAMS, formatWhen, type BoxHealth } from '@/admin/boxLinkData';

const streamLabel = (endpoint: string) => STREAMS.find((s) => s.endpoint === endpoint)?.label ?? endpoint;

export function RecentCalls({ health }: { health: BoxHealth }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-rule bg-card shadow-card">
        <p className="border-b border-rule px-4 py-3 text-sm font-medium text-navy">Recent deliveries</p>
        {health.recent_runs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Nothing received yet.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-rule overflow-y-auto">
            {health.recent_runs.map((r) => (
              <li key={r.request_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-navy">{streamLabel(r.endpoint)}</span>
                  <span className="block text-xs text-muted">{formatWhen(r.started_at)}</span>
                </span>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
                  title={r.error_code ?? undefined}
                >
                  {r.http_status} {r.ok ? 'OK' : (r.error_code ?? 'error')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-rule bg-card shadow-card">
        <p className="border-b border-rule px-4 py-3 text-sm font-medium text-navy">Warnings</p>
        {health.warnings.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No warnings.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-rule overflow-y-auto">
            {health.warnings.map((w) => (
              <li key={`${w.endpoint}-${w.at}`} className="px-4 py-2.5 text-sm">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
                  {streamLabel(w.endpoint)} · {formatWhen(w.at)}
                </p>
                <ul className="mt-1 list-disc pl-5 text-ink">
                  {w.warnings.map((text, i) => (
                    <li key={i}>{typeof text === 'string' ? text : JSON.stringify(text)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
