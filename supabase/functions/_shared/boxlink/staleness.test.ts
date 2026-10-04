import { describe, expect, it } from 'vitest';
import { isWorkingDay, londonToday, normaliseFrequency, seriesStaleness, workingDaysBetween } from './staleness.ts';

describe('working days (England)', () => {
  it('skips weekends', () => {
    expect(isWorkingDay('2026-10-03')).toBe(false);
    expect(isWorkingDay('2026-10-05')).toBe(true);
    expect(workingDaysBetween('2026-10-02', '2026-10-05')).toBe(1);
  });
  it('skips English bank holidays, including substitute days', () => {
    expect(isWorkingDay('2026-12-25')).toBe(false);
    expect(isWorkingDay('2026-12-28')).toBe(false);
    expect(workingDaysBetween('2026-12-24', '2026-12-29')).toBe(1);
    expect(isWorkingDay('2026-08-31')).toBe(false);
  });
});

describe('series staleness', () => {
  it('daily: Friday data is fresh on Monday morning', () =>
    expect(seriesStaleness('2026-10-02', 'daily', '2026-10-05')).toBe('fresh'));
  it('daily: Thursday data is still fresh on Monday (one day publication lag)', () =>
    expect(seriesStaleness('2026-10-01', 'daily', '2026-10-05')).toBe('fresh'));
  it('daily: Wednesday data is stale on Monday', () =>
    expect(seriesStaleness('2026-09-30', 'daily', '2026-10-05')).toBe('stale'));
  it('daily: Christmas Eve data is fresh on 29 December 2026', () =>
    expect(seriesStaleness('2026-12-24', 'daily', '2026-12-29')).toBe('fresh'));
  it('weekly: a fortnight old is fresh, three weeks old is stale', () => {
    expect(seriesStaleness('2026-09-21', 'weekly', '2026-10-05')).toBe('fresh');
    expect(seriesStaleness('2026-09-14', 'weekly', '2026-10-05')).toBe('stale');
  });
  it('monthly: last month is fresh, three months back is stale', () => {
    expect(seriesStaleness('2026-09-01', 'monthly', '2026-10-05')).toBe('fresh');
    expect(seriesStaleness('2026-06-01', 'monthly', '2026-10-05')).toBe('stale');
  });
  it('reports missing data and unknown frequency', () => {
    expect(seriesStaleness(null, 'daily', '2026-10-05')).toBe('no_data');
    expect(seriesStaleness('2026-10-02', null, '2026-10-05')).toBe('unknown_frequency');
    expect(normaliseFrequency('Weekly (Tuesdays)')).toBe('weekly');
    expect(normaliseFrequency('quarterly')).toBeNull();
  });
  it('uses the London date', () => expect(londonToday(new Date('2026-10-04T23:30:00Z'))).toBe('2026-10-05'));
});
