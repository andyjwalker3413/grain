import { useEffect, useState } from 'react';
import { format, parseISO, subMonths, subYears } from 'date-fns';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Info } from 'lucide-react';
import { canChart, fetchObservations, formatValue, unitSuffix, type Observation, type Series } from '@/markets/marketData';

const RANGES = [
  { id: '3m', label: '3M', since: (d: Date) => subMonths(d, 3) },
  { id: '1y', label: '1Y', since: (d: Date) => subYears(d, 1) },
  { id: '3y', label: '3Y', since: (d: Date) => subYears(d, 3) },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

export function PriceChart({ series, asOf }: { series: Series; asOf: Date }) {
  const [range, setRange] = useState<RangeId>('1y');
  const [points, setPoints] = useState<Observation[] | null>(null);
  const [error, setError] = useState(false);
  const chartable = canChart(series.source);

  useEffect(() => {
    if (!chartable) return;
    let cancelled = false;
    setPoints(null);
    setError(false);
    const since = RANGES.find((r) => r.id === range)!.since(asOf);
    fetchObservations(series.id, format(since, 'yyyy-MM-dd'))
      .then((rows) => !cancelled && setPoints(rows))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [series.id, range, asOf, chartable]);

  return (
    <section className="rounded-lg border border-rule bg-card p-4 shadow-card sm:p-6" aria-label={`${series.name} chart`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{series.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {series.unit} · {series.source.name}
          </p>
        </div>
        {chartable && (
          <div className="flex rounded-md border border-rule bg-cream p-1 text-xs font-medium" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                aria-pressed={range === r.id}
                className={`rounded px-3 py-1.5 transition-colors ${range === r.id ? 'bg-navy text-white' : 'text-muted hover:text-navy'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 h-72">
        {!chartable ? (
          <div className="flex h-full items-center justify-center gap-2 rounded-md border border-dashed border-rule px-6 text-center text-sm text-muted">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            {series.source.licence_class === 'display'
              ? 'This source’s licence allows the latest price to be shown, but not a chart.'
              : 'This source’s licence doesn’t allow its prices to be shown or charted.'}
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-800">Couldn’t load the price history.</div>
        ) : !points ? (
          <div className="h-full animate-pulse rounded-md bg-rule/40" aria-hidden="true" />
        ) : points.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No prices in this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E2DCCB" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => format(parseISO(d), range === '3m' ? 'd MMM' : 'MMM yy')}
                tick={{ fill: '#5A6372', fontSize: 12 }}
                axisLine={{ stroke: '#E2DCCB' }}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#5A6372', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, borderColor: '#E2DCCB', fontSize: 13 }}
                labelFormatter={(d) => format(parseISO(String(d)), 'd MMM yyyy')}
                formatter={(v) => [`${formatValue(Number(v), series.unit)} ${unitSuffix(series.unit)}`, 'Price']}
              />
              <Area type="monotone" dataKey="value" stroke="#14213D" strokeWidth={2} fill="url(#priceFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
