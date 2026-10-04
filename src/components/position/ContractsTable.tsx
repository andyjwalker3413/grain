import { format, parseISO } from 'date-fns';
import { formatPence, formatTonnes, type ContractRow } from '@/position/positionData';

const TYPE_LABEL: Record<ContractRow['type'], string> = {
  fixed: 'Fixed price',
  pool: 'Pool',
  min_price: 'Minimum price',
};

const PRICE_LABEL: Record<ContractRow['type'], string> = {
  fixed: '',
  pool: 'estimate',
  min_price: 'floor',
};

const STATUS_STYLE: Record<ContractRow['status'], string> = {
  open: 'bg-sky-50 text-sky-900 border-sky-200',
  delivered: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  cancelled: 'bg-cream text-muted border-rule line-through',
};

export function ContractsTable({ contracts }: { contracts: ContractRow[] }) {
  if (contracts.length === 0) {
    return <p className="rounded-lg border border-dashed border-rule p-6 text-center text-sm text-muted">No contracts for this crop yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-rule bg-cream/60 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Merchant</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 text-right font-medium">Tonnes</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Delivery</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {contracts.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-cream/50">
                <td className="px-4 py-3">
                  <p className="font-medium text-navy">{c.merchant}</p>
                  {c.reference && <p className="text-xs text-muted">{c.reference}</p>}
                </td>
                <td className="px-4 py-3 text-ink">{TYPE_LABEL[c.type]}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatTonnes(c.tonnes)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">
                  {formatPence(c.priceP)}/t
                  {PRICE_LABEL[c.type] && <span className="block text-xs text-muted">{PRICE_LABEL[c.type]}</span>}
                </td>
                <td className="px-4 py-3 text-ink">{c.deliveryMonth ? format(parseISO(c.deliveryMonth), 'MMM yyyy') : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[c.status]}`}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
