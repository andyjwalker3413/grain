import { CheckCircle2, CircleDashed, HeartPulse } from 'lucide-react';
import { STREAMS, formatWhen, type BoxHealth } from '@/admin/boxLinkData';

export function StreamHealth({ health }: { health: BoxHealth }) {
  const beat = health.heartbeats[0];

  return (
    <div className="rounded-lg border border-rule bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <HeartPulse className={`mt-0.5 h-5 w-5 shrink-0 ${beat ? 'text-emerald-700' : 'text-muted'}`} aria-hidden="true" />
        <div>
          <p className="font-medium text-navy">Last heartbeat</p>
          <p className="mt-1 text-sm text-ink">
            {beat ? `${formatWhen(beat.received_at)} · ${beat.phase} · run ${beat.run_id}` : 'The box has not checked in yet.'}
          </p>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-rule border-t border-rule">
        {STREAMS.map(({ endpoint, label }) => {
          const at = health.last_success[endpoint];
          const Icon = at ? CheckCircle2 : CircleDashed;
          return (
            <li key={endpoint} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-navy">
                <Icon className={`h-4 w-4 ${at ? 'text-emerald-700' : 'text-muted'}`} aria-hidden="true" />
                {label}
              </span>
              <span className="text-right text-muted">{at ? `Last success ${formatWhen(at)}` : 'No successful delivery yet'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
