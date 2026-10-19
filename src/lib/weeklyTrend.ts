// 예약관리 화면 위쪽의 "주별 동향" — 이번 주·지난주·지지난주의 예약률, 부도취소율, 주간매출, 평환수, 객단가.
// 한 주는 월요일~일요일이고, 이번 주는 오늘까지만 센다. 계산은 이번달 현황과 같은 규칙을 쓴다.

import { addDaysKst, weekStartKst } from './kst';
import { averageVisitsPerDay } from './monthlyFigures';
import { computeReservationRates } from './reservationRates';

export interface WeekRow {
  date: string; // YYYY-MM-DD
  totalRevenue: number | null;
  visitCount: number | null;
  excludedCount: number | null;
  reservationCount: number | null;
  keptCount: number | null;
  noshowCount: number | null;
  cancelCount: number | null;
}

export interface WeekTrend {
  /** 그 주 월요일 */
  weekStart: string;
  /** 그 주 일요일(이번 주도 일요일 날짜) */
  weekEnd: string;
  label: string;
  /** 일일 결산이 들어온 날 수 */
  daysEntered: number;
  reservationRate: number | null;
  noShowRate: number | null;
  /** 주간매출(원) — 결산이 하나도 없으면 null */
  totalRevenue: number | null;
  /** 평환수 = 진료한 날(내원 1명 이상)의 하루 평균 내원환자수 */
  avgDailyVisits: number | null;
  /** 객단가 = 주간매출 ÷ 총 내원 인원(원). 내원 수를 아는 날만 센다. */
  averageTicket: number | null;
}

const WEEK_LABELS = ['이번 주', '지난주', '지지난주'];

export function buildWeekTrends(rows: WeekRow[], today: string, weeks = 3): WeekTrend[] {
  const thisMonday = weekStartKst(today);
  const result: WeekTrend[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = addDaysKst(thisMonday, -7 * i);
    const weekEnd = addDaysKst(weekStart, 6);
    const inWeek = rows.filter((r) => r.date >= weekStart && r.date <= weekEnd && r.date <= today);
    const rates = computeReservationRates(inWeek);
    const withVisits = inWeek.filter((r) => r.visitCount != null && r.visitCount > 0);
    const visitTotal = withVisits.reduce((acc, r) => acc + (r.visitCount ?? 0), 0);
    const ticketRevenue = withVisits.reduce((acc, r) => acc + (r.totalRevenue ?? 0), 0);
    result.push({
      weekStart,
      weekEnd,
      label: WEEK_LABELS[i] ?? `${i}주 전`,
      daysEntered: inWeek.length,
      reservationRate: rates.reservationRate,
      noShowRate: rates.noShowRate,
      totalRevenue: inWeek.length > 0 ? inWeek.reduce((acc, r) => acc + (r.totalRevenue ?? 0), 0) : null,
      avgDailyVisits: averageVisitsPerDay(inWeek.map((r) => ({ totalRevenue: r.totalRevenue ?? 0, visitCount: r.visitCount }))),
      averageTicket: visitTotal > 0 ? Math.round(ticketRevenue / visitTotal) : null,
    });
  }
  return result;
}
