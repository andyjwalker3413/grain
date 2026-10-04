const ENGLAND_BANK_HOLIDAYS = new Set([
  '2023-01-02', '2023-04-07', '2023-04-10', '2023-05-01', '2023-05-08', '2023-05-29', '2023-08-28', '2023-12-25', '2023-12-26',
  '2024-01-01', '2024-03-29', '2024-04-01', '2024-05-06', '2024-05-27', '2024-08-26', '2024-12-25', '2024-12-26',
  '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
]);

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function isWorkingDay(iso: string): boolean {
  const day = toDate(iso).getUTCDay();
  return day !== 0 && day !== 6 && !ENGLAND_BANK_HOLIDAYS.has(iso);
}

export function workingDaysBetween(fromIso: string, toIsoDate: string): number {
  let count = 0;
  const d = toDate(fromIso);
  const end = toDate(toIsoDate);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(toIso(d))) count++;
  }
  return count;
}

export type Frequency = 'daily' | 'weekly' | 'monthly';

const ALLOWANCE_WORKING_DAYS: Record<Frequency, number> = { daily: 2, weekly: 10, monthly: 45 };

export function normaliseFrequency(value: string | null | undefined): Frequency | null {
  const v = (value ?? '').toLowerCase();
  if (v.startsWith('daily') || v === 'weekdays') return 'daily';
  if (v.startsWith('weekly')) return 'weekly';
  if (v.startsWith('monthly')) return 'monthly';
  return null;
}

export type Staleness = 'fresh' | 'stale' | 'no_data' | 'unknown_frequency';

export function seriesStaleness(lastObservedOn: string | null, frequency: Frequency | null, todayIso: string): Staleness {
  if (!lastObservedOn) return 'no_data';
  if (!frequency) return 'unknown_frequency';
  return workingDaysBetween(lastObservedOn, todayIso) > ALLOWANCE_WORKING_DAYS[frequency] ? 'stale' : 'fresh';
}

export function londonToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
