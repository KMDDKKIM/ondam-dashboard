import { describe, expect, it } from 'vitest';
import { weekdayKo, weekStartKst } from './kst';
import { buildWeekTrends, type WeekRow } from './weeklyTrend';

function row(date: string, p: Partial<WeekRow> = {}): WeekRow {
  return { date, totalRevenue: 1000000, visitCount: 20, excludedCount: 0, reservationCount: 10, keptCount: 8, noshowCount: 1, cancelCount: 1, ...p };
}

describe('weekdayKo / weekStartKst', () => {
  it('요일 한 글자', () => {
    expect(weekdayKo('2026-10-19')).toBe('월');
    expect(weekdayKo('2026-10-24')).toBe('토');
    expect(weekdayKo('2026-10-25')).toBe('일');
  });

  it('주의 시작은 월요일(일요일은 그 전 월요일)', () => {
    expect(weekStartKst('2026-10-19')).toBe('2026-10-19');
    expect(weekStartKst('2026-10-22')).toBe('2026-10-19');
    expect(weekStartKst('2026-10-25')).toBe('2026-10-19');
    expect(weekStartKst('2026-10-26')).toBe('2026-10-26');
  });
});

describe('buildWeekTrends', () => {
  const today = '2026-10-21'; // 수요일

  it('이번 주·지난주·지지난주 세 줄(월~일), 이번 주는 오늘까지만', () => {
    const weeks = buildWeekTrends([row('2026-10-19'), row('2026-10-12'), row('2026-10-05')], today);
    expect(weeks.map((w) => [w.label, w.weekStart, w.weekEnd])).toEqual([
      ['이번 주', '2026-10-19', '2026-10-25'],
      ['지난주', '2026-10-12', '2026-10-18'],
      ['지지난주', '2026-10-05', '2026-10-11'],
    ]);
  });

  it('주간매출·평환수·객단가·예약률·부도취소율', () => {
    const rows = [row('2026-10-12', { totalRevenue: 2000000, visitCount: 20 }), row('2026-10-13', { totalRevenue: 1000000, visitCount: 10 }), row('2026-10-14', { totalRevenue: 0, visitCount: 0, reservationCount: null })];
    const last = buildWeekTrends(rows, today)[1];
    expect(last.totalRevenue).toBe(3000000);
    expect(last.avgDailyVisits).toBe(15); // 내원 0명인 날은 평균에서 뺀다
    expect(last.averageTicket).toBe(100000); // 3,000,000 ÷ 30명
    expect(last.reservationRate).toBe(53.3); // 예약 숫자를 적은 이틀만: 이행 16 ÷ 내원 30
    expect(last.noShowRate).toBe(20); // (노쇼+취소 4) ÷ 예약 20
    expect(last.daysEntered).toBe(3);
  });

  it('결산이 없는 주는 모두 null', () => {
    const w = buildWeekTrends([], today)[2];
    expect(w).toMatchObject({ totalRevenue: null, avgDailyVisits: null, averageTicket: null, reservationRate: null, noShowRate: null, daysEntered: 0 });
  });

  it('오늘 이후 날짜는 이번 주에 세지 않는다', () => {
    const w = buildWeekTrends([row('2026-10-19'), row('2026-10-23')], today)[0];
    expect(w.daysEntered).toBe(1);
  });
});
