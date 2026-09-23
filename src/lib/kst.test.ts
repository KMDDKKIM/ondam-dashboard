import { describe, it, expect } from 'vitest';
import { currentMonthKst, todayKst, addDaysKst, diffDaysKst, kstDateOf, kstTimeOf, shortDateKo } from './kst';

describe('todayKst', () => {
  it('uses the Seoul date, not the UTC date', () => {
    // 2026-09-20 16:00 UTC = 2026-09-21 01:00 KST
    expect(todayKst(new Date('2026-09-20T16:00:00Z'))).toBe('2026-09-21');
  });

  it('stays on the same day up to 23:59 KST', () => {
    // 2026-09-20 14:59 UTC = 2026-09-20 23:59 KST
    expect(todayKst(new Date('2026-09-20T14:59:59Z'))).toBe('2026-09-20');
    // one second later it is the next Seoul day
    expect(todayKst(new Date('2026-09-20T15:00:00Z'))).toBe('2026-09-21');
  });

  it('handles the month and year boundary', () => {
    expect(todayKst(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });
});

describe('addDaysKst', () => {
  it('adds and subtracts days across month/year/leap boundaries', () => {
    expect(addDaysKst('2026-09-20', 1)).toBe('2026-09-21');
    expect(addDaysKst('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysKst('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysKst('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysKst('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysKst('2026-09-20', 0)).toBe('2026-09-20');
  });

  it('does not skip weekends (2026-09-19 is a Saturday)', () => {
    expect(addDaysKst('2026-09-19', 1)).toBe('2026-09-20');
    expect(addDaysKst('2026-09-20', 1)).toBe('2026-09-21');
  });
});

describe('diffDaysKst', () => {
  it('counts calendar days', () => {
    expect(diffDaysKst('2026-09-20', '2026-09-20')).toBe(0);
    expect(diffDaysKst('2026-09-18', '2026-09-20')).toBe(2);
    expect(diffDaysKst('2026-09-20', '2026-09-18')).toBe(-2);
    expect(diffDaysKst('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('kstDateOf / kstTimeOf', () => {
  it('converts a timestamptz to the Seoul date and time', () => {
    expect(kstDateOf('2026-09-20T16:30:00Z')).toBe('2026-09-21');
    expect(kstTimeOf('2026-09-20T16:30:00Z')).toBe('01:30');
    expect(kstDateOf('2026-09-20T05:00:00+00:00')).toBe('2026-09-20');
    expect(kstTimeOf('2026-09-20T05:00:00+00:00')).toBe('14:00');
  });
});

describe('shortDateKo', () => {
  it('두 자리 연도, 앞자리 0 없는 월·일로 줄인다', () => {
    expect(shortDateKo('2026-09-23')).toBe('26.9.23');
    expect(shortDateKo('2026-01-05')).toBe('26.1.5');
    expect(shortDateKo('2026-12-31')).toBe('26.12.31');
  });
});

describe('currentMonthKst', () => {
  it('uses the Seoul month, not the UTC month', () => {
    // 2026-09-30 16:00 UTC = 2026-10-01 01:00 KST
    expect(currentMonthKst(new Date('2026-09-30T16:00:00Z'))).toBe('2026-10');
    expect(currentMonthKst(new Date('2026-09-30T14:59:59Z'))).toBe('2026-09');
  });
});
