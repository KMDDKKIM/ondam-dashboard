import { describe, expect, it } from 'vitest';
import { groupRecordsByMonth, isMonthOpen } from './monthGroups';

const rec = (date: string) => ({ date });

describe('groupRecordsByMonth', () => {
  it('최근 달이 위, 달 안에서도 최근 날짜가 위', () => {
    const groups = groupRecordsByMonth([rec('2026-08-30'), rec('2026-09-02'), rec('2026-08-01'), rec('2026-09-20'), rec('2025-12-31')]);
    expect(groups.map((g) => g.month)).toEqual(['2026-09', '2026-08', '2025-12']);
    expect(groups[0].records.map((r) => r.date)).toEqual(['2026-09-20', '2026-09-02']);
    expect(groups[1].records.map((r) => r.date)).toEqual(['2026-08-30', '2026-08-01']);
  });
  it('빈 목록은 빈 결과', () => {
    expect(groupRecordsByMonth([])).toEqual([]);
  });
});

describe('isMonthOpen', () => {
  it('이번 달과 고른 날짜의 달은 펼치고 나머지는 접는다', () => {
    expect(isMonthOpen('2026-09', '2026-09', '2026-07-05', {})).toBe(true);
    expect(isMonthOpen('2026-07', '2026-09', '2026-07-05', {})).toBe(true);
    expect(isMonthOpen('2026-08', '2026-09', '2026-07-05', {})).toBe(false);
  });
  it('직접 누른 값이 기본값보다 우선한다', () => {
    expect(isMonthOpen('2026-08', '2026-09', '2026-09-01', { '2026-08': true })).toBe(true);
    expect(isMonthOpen('2026-09', '2026-09', '2026-09-01', { '2026-09': false })).toBe(false);
  });
});
