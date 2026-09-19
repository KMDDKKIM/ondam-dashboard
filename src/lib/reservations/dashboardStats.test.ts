import { describe, it, expect } from 'vitest';
import { computeWeeklyStats } from './dashboardStats';
import type { DailyRecordSummary } from './types';

function makeRecord(overrides: Partial<DailyRecordSummary>): DailyRecordSummary {
  return {
    id: 'x',
    date: '2026-09-08',
    memoText: '',
    visitCount: null,
    reservationCount: null,
    reservationRowCount: 0,
    excludedCount: null,
    chunaCount: null,
    nogyongCount: null,
    ilbanCount: null,
    firstVisitCount: null,
    dietCount: 0,
    specialAcupunctureCount: 0,
    ...overrides,
  };
}

describe('computeWeeklyStats', () => {
  it('sums this week only (Mon-Sun containing the reference date) and computes rates', () => {
    const records: DailyRecordSummary[] = [
      makeRecord({
        date: '2026-09-08', // Tuesday, same week as reference
        visitCount: 20,
        reservationCount: 15,
        excludedCount: 2,
        nogyongCount: 1,
        ilbanCount: 1,
        chunaCount: 2,
        dietCount: 1,
        specialAcupunctureCount: 0,
      }),
      makeRecord({
        date: '2026-09-09', // Wednesday, same week
        visitCount: 10,
        reservationCount: 8,
        excludedCount: 1,
        nogyongCount: 0,
        ilbanCount: 2,
        chunaCount: 1,
        dietCount: 0,
        specialAcupunctureCount: 3,
      }),
      makeRecord({
        date: '2026-08-31', // previous week, must be excluded
        visitCount: 100,
        reservationCount: 100,
        excludedCount: 100,
      }),
    ];

    const stats = computeWeeklyStats(records, new Date('2026-09-10T00:00:00'));

    expect(stats.nogyongTotal).toBe(1);
    expect(stats.ilbanTotal).toBe(3);
    expect(stats.herbTotal).toBe(4);
    expect(stats.chunaTotal).toBe(3);
    expect(stats.dietTotal).toBe(1);
    expect(stats.specialAcupunctureTotal).toBe(3);
  });

  it('returns zero totals when there are no records', () => {
    const stats = computeWeeklyStats([], new Date('2026-09-10T00:00:00'));

    expect(stats.nogyongTotal).toBe(0);
    expect(stats.ilbanTotal).toBe(0);
  });

  it('treats null counts as zero rather than breaking the sum', () => {
    const records = [makeRecord({ date: '2026-09-08', nogyongCount: null, ilbanCount: 2 })];
    const stats = computeWeeklyStats(records, new Date('2026-09-10T00:00:00'));

    expect(stats.herbTotal).toBe(2);
  });
});
