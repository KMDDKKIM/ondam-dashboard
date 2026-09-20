import { describe, expect, it } from 'vitest';
import { closingSaveWarnings, formatMonthDay, missingClosingDates, missingClosingMessage } from './closingChecks';

describe('missingClosingDates', () => {
  it('returns yesterday when there is no saved closing for it', () => {
    expect(missingClosingDates([], '2026-09-20')).toEqual(['2026-09-19']);
    expect(missingClosingDates(['2026-09-18', '2026-09-20'], '2026-09-20')).toEqual(['2026-09-19']);
  });

  it('returns nothing when yesterday is saved', () => {
    expect(missingClosingDates(['2026-09-19'], '2026-09-20')).toEqual([]);
  });

  it('never returns older dates, even if many days are missing', () => {
    expect(missingClosingDates(['2026-09-19'], '2026-09-20')).toEqual([]);
    expect(missingClosingDates(['2026-09-01'], '2026-09-20')).toEqual(['2026-09-19']);
  });

  it('is calendar-day based: weekends and month boundaries are not skipped', () => {
    expect(missingClosingDates([], '2026-09-21')).toEqual(['2026-09-20']);
    expect(missingClosingDates([], '2026-10-01')).toEqual(['2026-09-30']);
    expect(missingClosingDates([], '2027-01-01')).toEqual(['2026-12-31']);
  });

  it('a closing saved for today does not count as yesterday', () => {
    expect(missingClosingDates(['2026-09-20'], '2026-09-20')).toEqual(['2026-09-19']);
  });
});

describe('missingClosingMessage', () => {
  it('formats yesterday as M/D', () => {
    expect(formatMonthDay('2026-09-19')).toBe('9/19');
    expect(missingClosingMessage(['2026-09-19'])).toBe('어제(9/19) 마감이 아직 입력되지 않았어요');
  });

  it('is null when nothing is missing', () => {
    expect(missingClosingMessage([])).toBeNull();
  });
});

describe('closingSaveWarnings', () => {
  const base = { date: '2026-09-19', totalRevenue: 1500000, visitCount: 30, today: '2026-09-20', existing: null };

  it('has no warnings for a normal closing', () => {
    expect(closingSaveWarnings(base)).toEqual([]);
  });

  it('warns on zero or empty revenue', () => {
    expect(closingSaveWarnings({ ...base, totalRevenue: 0 })).toHaveLength(1);
    expect(closingSaveWarnings({ ...base, totalRevenue: null })[0]).toContain('총진료비');
  });

  it('warns on zero or unknown visit count', () => {
    expect(closingSaveWarnings({ ...base, visitCount: 0 })[0]).toContain('내원 환자수');
    expect(closingSaveWarnings({ ...base, visitCount: null })[0]).toContain('내원 환자수');
  });

  it('warns on a future date but not on today', () => {
    expect(closingSaveWarnings({ ...base, date: '2026-09-21' })[0]).toContain('미래');
    expect(closingSaveWarnings({ ...base, date: '2026-09-20' })).toEqual([]);
  });

  it('warns on overwrite with old vs new totals', () => {
    const w = closingSaveWarnings({ ...base, existing: { totalRevenue: 1000000, visitCount: 25 } });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('이미 저장된 마감이 있어요. 덮어쓸까요?');
    expect(w[0]).toContain('기존 1,000,000원');
    expect(w[0]).toContain('새 1,500,000원');
  });

  it('collects every applicable warning', () => {
    const w = closingSaveWarnings({
      date: '2026-09-25',
      totalRevenue: 0,
      visitCount: 0,
      today: '2026-09-20',
      existing: { totalRevenue: 10, visitCount: 1 },
    });
    expect(w).toHaveLength(4);
  });
});
