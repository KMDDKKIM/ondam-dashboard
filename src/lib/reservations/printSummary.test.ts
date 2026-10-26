import { describe, expect, it } from 'vitest';
import { monthPrintLine, printSummaryLines, weekPrintLine } from './printSummary';
import type { MonthlySummary } from '../monthlySummary';
import type { WeekTrend } from '../weeklyTrend';

const summary = {
  month: '2026-10',
  avgDailyVisits: 18.5,
  totalRevenue: 12345000,
  averageTicket: 56000,
  legacyOverride: false,
  motivation: { reached: false, lines: [], projectedPercent: null, projectedPace: null },
  totalRevenueGoal: null,
  avgDailyVisitsGoal: null,
  goals: {
    herb: { achieved: 3, goal: 10, adjust: 0 },
    diet: { achieved: 2, goal: null, adjust: 0 },
    specialHerb: { achieved: 0, goal: 3, adjust: 0 },
    chuna: { achieved: 12, goal: 20, adjust: 0 },
  },
} as MonthlySummary;

const week = (p: Partial<WeekTrend> = {}): WeekTrend => ({
  weekStart: '2026-10-26', weekEnd: '2026-11-01', label: '이번 주', daysEntered: 1, reservationRate: 80, noShowRate: 5, totalRevenue: 3000000, avgDailyVisits: 20, averageTicket: 150000,
  nonCovered: { herb: 2, diet: 1, specialHerb: 0, chuna: 4 }, ...p,
});

describe('monthPrintLine', () => {
  it('이번달 현황을 한 줄로 — 목표가 없으면 건수만', () => {
    expect(monthPrintLine(summary)).toBe('10월 현황 — 총매출 12,345,000원 · 평환수 18.5명 · 객단가 56,000원 · 한약 3/10 · 다이어트 2건 · 특수한약 0/3 · 추나 12/20');
  });
  it('못 불러왔으면 그 사실만', () => {
    expect(monthPrintLine(null)).toContain('불러오지 못했습니다');
  });
});

describe('weekPrintLine', () => {
  it('예약률·부도취소율·매출·평환수·객단가·비급여', () => {
    expect(weekPrintLine(week())).toBe('이번 주 10/26~11/1 — 예약률 80% · 부도취소율 5% · 매출 3,000,000원 · 평환수 20명 · 객단가 150,000원 · 비급여 한약 2 · 다이어트 1 · 특수한약 0 · 추나 4');
  });
  it('값이 없으면 -, 비급여를 못 읽었으면 그 부분은 뺀다', () => {
    const line = weekPrintLine(week({ reservationRate: null, totalRevenue: null, nonCovered: null }));
    expect(line).toContain('예약률 -');
    expect(line).toContain('매출 -');
    expect(line).not.toContain('비급여');
  });
});

describe('printSummaryLines', () => {
  it('이번달 한 줄 + 주별 줄', () => {
    expect(printSummaryLines(summary, [week(), week({ label: '지난주' })])).toHaveLength(3);
    expect(printSummaryLines(summary, null)).toHaveLength(1);
  });
});
