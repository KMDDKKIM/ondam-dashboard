import { describe, expect, it } from 'vitest';
import { compareByFirstVisitAsc, formatShortDate } from './dateDisplay';

describe('formatShortDate', () => {
  it('올해 날짜는 월/일, 다른 해는 YY.M.D 로 짧게', () => {
    expect(formatShortDate('2026-09-14', 2026)).toBe('9/14');
    expect(formatShortDate('2026-01-05', 2026)).toBe('1/5');
    expect(formatShortDate('2025-12-26', 2026)).toBe('25.12.26');
  });

  it('비어 있으면 빈 글자(칸을 비워 둔다)', () => {
    expect(formatShortDate('', 2026)).toBe('');
    expect(formatShortDate(null, 2026)).toBe('');
    expect(formatShortDate(undefined, 2026)).toBe('');
  });
});

describe('compareByFirstVisitAsc', () => {
  it('초진일 오래된 순, 같은 날이면 등록 순서', () => {
    const rows = [
      { id: 'c', firstVisitDate: '2026-09-12', createdAt: '2026-09-20T01:00:00Z' },
      { id: 'a', firstVisitDate: '2026-08-20', createdAt: '2026-09-21T01:00:00Z' },
      { id: 'b2', firstVisitDate: '2026-09-01', createdAt: '2026-09-21T02:00:00Z' },
      { id: 'b1', firstVisitDate: '2026-09-01', createdAt: '2026-09-21T01:00:00Z' },
    ];
    expect([...rows].sort(compareByFirstVisitAsc).map((r) => r.id)).toEqual(['a', 'b1', 'b2', 'c']);
  });
});
