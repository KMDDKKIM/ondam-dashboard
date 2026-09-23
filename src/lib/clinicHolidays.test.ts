import { describe, expect, it } from 'vitest';
import { countHolidaysInRange, isClinicHoliday } from './clinicHolidays';

describe('isClinicHoliday', () => {
  it('추석·설 연휴 3일씩을 휴진일로 안다', () => {
    expect(isClinicHoliday('2026-09-24')).toBe(true);
    expect(isClinicHoliday('2026-09-25')).toBe(true);
    expect(isClinicHoliday('2026-09-26')).toBe(true);
    expect(isClinicHoliday('2026-09-27')).toBe(false);
    expect(isClinicHoliday('2026-02-17')).toBe(true);
  });
});

describe('countHolidaysInRange', () => {
  it('범위(양끝 포함) 안의 휴진일 수를 센다', () => {
    expect(countHolidaysInRange('2026-09-01', '2026-09-30')).toBe(3);
    expect(countHolidaysInRange('2026-09-01', '2026-09-23')).toBe(0);
    expect(countHolidaysInRange('2026-09-25', '2026-09-25')).toBe(1);
    expect(countHolidaysInRange('2026-01-01', '2026-12-31')).toBe(6);
  });

  it('시작이 끝보다 늦으면 0', () => {
    expect(countHolidaysInRange('2026-09-30', '2026-09-01')).toBe(0);
  });
});
