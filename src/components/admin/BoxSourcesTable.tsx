import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { formatWhen, type BoxSource } from '@/admin/boxLinkData';
import { RestrictSourceDialog } from '@/components/admin/RestrictSourceDialog';

const CLASS_LABEL: Record<string, string> = { chart: 'Prices and charts', display: 'Latest prices only' };
const SCOPE_LABEL: Record<string, string> = { general: 'Every farm', single_client: 'One client only' };

export function BoxSourcesTable({ sources, onChanged }: { sources: BoxSource[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<BoxSource | null>(null);

  if (sources.length === 0) {
    return <p className="rounded-lg border border-dashed border-rule bg-card px-4 py-6 text-center text-sm text-muted">The box has not sent its source catalogue yet.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-rule bg-card shadow-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-rule text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">In use as</th>
              <th className="px-4 py-3 font-medium">Box allows</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {sources.map((s) => (
              <tr key={s.code} className="transition-colors hover:bg-cream/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-navy">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.code} · updated {formatWhen(s.updated_at)}
                  </p>
                </td>
                <td className="px-4 py-3 text-ink">
                  {CLASS_LABEL[s.licence_class] ?? s.licence_class} · {SCOPE_LABEL[s.licence_scope] ?? s.licence_scope}
                </td>
                <td className="px-4 py-3 text-muted">
                  {CLASS_LABEL[s.box_licence_class ?? ''] ?? '—'} · {SCOPE_LABEL[s.box_licence_scope ?? ''] ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-cream text-muted'}`}>
                    {s.status === 'active' ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:border-gold hover:bg-cream"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    Restrict
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <RestrictSourceDialog
          source={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}
