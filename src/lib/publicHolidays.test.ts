import { describe, expect, it } from 'vitest';
import { PUBLIC_HOLIDAYS, holidayName, isPublicHoliday } from './publicHolidays';
import { CLINIC_HOLIDAYS } from './clinicHolidays';

describe('publicHolidays', () => {
  it('공휴일은 이름을 돌려준다', () => {
    expect(holidayName('2026-10-09')).toBe('한글날');
    expect(holidayName('2026-10-05')).toBe('대체공휴일');
    expect(isPublicHoliday('2026-12-25')).toBe(true);
  });

  it('평일·일반 날짜는 공휴일이 아니다', () => {
    expect(holidayName('2026-10-06')).toBeNull();
    expect(isPublicHoliday('2026-10-06')).toBe(false);
  });

  it('날짜 형식이 모두 YYYY-MM-DD 이다', () => {
    for (const d of Object.keys(PUBLIC_HOLIDAYS)) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('한의원 휴진일(설·추석)은 2026년 기준 모두 공휴일이기도 하다', () => {
    for (const d of CLINIC_HOLIDAYS.filter((x) => x.startsWith('2026-'))) expect(isPublicHoliday(d)).toBe(true);
  });
});
