import { describe, expect, it } from 'vitest';
import { achievementPercent, averageVisitsPerDay, resolveMonthlyFigures } from './monthlyFigures';

describe('averageVisitsPerDay', () => {
  it('내원 합계를 진료한 날 수로 나눈다(0명인 날·수 없는 날은 뺀다)', () => {
    const avg = averageVisitsPerDay([
      { totalRevenue: 1, visitCount: 16 },
      { totalRevenue: 1, visitCount: 38 },
      { totalRevenue: 0, visitCount: 0 },
      { totalRevenue: 1, visitCount: null },
    ]);
    expect(avg).toBe(27);
  });

  it('OK차트 월말결산 예시(520명/19일)와 같은 27.4가 나온다', () => {
    const visits = [16, 38, 21, 40, 23, 9, 39, 26, 38, 20, 36, 23, 11, 46, 27, 34, 23, 34, 16];
    expect(averageVisitsPerDay(visits.map((v) => ({ totalRevenue: 0, visitCount: v })))).toBe(27.4);
  });

  it('센 날이 하나도 없으면 null', () => {
    expect(averageVisitsPerDay([])).toBeNull();
    expect(averageVisitsPerDay([{ totalRevenue: 5, visitCount: null }])).toBeNull();
  });
});

describe('resolveMonthlyFigures', () => {
  const daily = [
    { totalRevenue: 1000, visitCount: 10 },
    { totalRevenue: 2000, visitCount: 20 },
  ];

  it('월말결산이 없으면 일일결산을 누적한다', () => {
    expect(resolveMonthlyFigures(daily, null, 99)).toEqual({ totalRevenue: 3000, avgDailyVisits: 15 });
  });

  it('월말결산이 있으면 총매출·일평균 모두 그 값이 최우선', () => {
    expect(resolveMonthlyFigures(daily, { totalRevenue: 5000, avgDailyVisits: 27.4 }, 99)).toEqual({
      totalRevenue: 5000,
      avgDailyVisits: 27.4,
    });
  });

  it('월말결산에 일평균이 없으면 일평균만 일일 누적을 쓴다', () => {
    expect(resolveMonthlyFigures(daily, { totalRevenue: 5000, avgDailyVisits: null }, 99)).toEqual({
      totalRevenue: 5000,
      avgDailyVisits: 15,
    });
  });

  it('결산 데이터가 전혀 없으면 예약 명단 값으로, 그것도 없으면 null', () => {
    expect(resolveMonthlyFigures([], null, 12.3)).toEqual({ totalRevenue: null, avgDailyVisits: 12.3 });
    expect(resolveMonthlyFigures([], null, null)).toEqual({ totalRevenue: null, avgDailyVisits: null });
  });
});

describe('achievementPercent', () => {
  it('달성/목표를 %로 반올림하고 목표 초과는 100을 넘겨 그대로 보여준다', () => {
    expect(achievementPercent(47338780, 60000000)).toBe(79);
    expect(achievementPercent(27.4, 25)).toBe(110);
  });

  it('목표가 없거나 0이거나 실적이 없으면 null', () => {
    expect(achievementPercent(10, null)).toBeNull();
    expect(achievementPercent(10, 0)).toBeNull();
    expect(achievementPercent(null, 10)).toBeNull();
  });
});
