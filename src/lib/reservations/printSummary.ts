// 예약 시트를 인쇄할 때 위쪽에 같이 찍히는 "이번달 현황 + 주별 현황" 줄(원장 요청, 2026-10-26). 줄 수가 늘면 예약 명단이 한 장에 안 들어갈 수 있어
// 줄마다 한 줄에 들어가는 짧은 문구로 만든다.
import type { MonthlySummary } from '../monthlySummary';
import type { WeekTrend } from '../weeklyTrend';

const won = (v: number | null) => (v != null ? `${v.toLocaleString('ko-KR')}원` : '-');
const pct = (v: number | null) => (v != null ? `${v}%` : '-');
const people = (v: number | null) => (v != null ? `${v}명` : '-');

function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

/** "10월 현황 — 총매출 … · 평환수 … · 객단가 … · 한약 3/10 · …" 한 줄. 이번달 현황을 못 불러왔으면 그 사실만. */
export function monthPrintLine(summary: MonthlySummary | null, monthLabel?: string): string {
  if (!summary) return `${monthLabel ?? '이번달'} 현황 — 불러오지 못했습니다`;
  const month = `${Number(summary.month.split('-')[1])}월`;
  const goal = (label: string, g: { achieved: number; goal: number | null }) => `${label} ${g.goal != null ? `${g.achieved}/${g.goal}` : `${g.achieved}건`}`;
  return [
    `${month} 현황 — 총매출 ${won(summary.totalRevenue)}`,
    `평환수 ${summary.avgDailyVisits != null ? `${summary.avgDailyVisits}명` : '-'}`,
    `객단가 ${won(summary.averageTicket)}`,
    goal('한약', summary.goals.herb),
    goal('다이어트', summary.goals.diet),
    goal('특수한약', summary.goals.specialHerb),
    goal('추나', summary.goals.chuna),
  ].join(' · ');
}

/** 한 주의 한 줄 — "이번 주 10/26~11/1 — 예약률 … · 부도취소율 … · 매출 … · 평환수 … · 객단가 … · 비급여 한약 2 · …". */
export function weekPrintLine(w: WeekTrend): string {
  const parts = [`${w.label} ${monthDay(w.weekStart)}~${monthDay(w.weekEnd)} — 예약률 ${pct(w.reservationRate)}`, `부도취소율 ${pct(w.noShowRate)}`, `매출 ${won(w.totalRevenue)}`, `평환수 ${people(w.avgDailyVisits)}`, `객단가 ${won(w.averageTicket)}`];
  if (w.nonCovered) {
    const n = w.nonCovered;
    parts.push(`비급여 한약 ${n.herb} · 다이어트 ${n.diet} · 특수한약 ${n.specialHerb} · 추나 ${n.chuna}`);
  }
  return parts.join(' · ');
}

/** 인쇄 머리쪽 줄들 — 이번달 현황 한 줄, 그 아래 주별 현황(이번 주·지난주·지지난주). */
export function printSummaryLines(summary: MonthlySummary | null, weeks: WeekTrend[] | null): string[] {
  return [monthPrintLine(summary), ...(weeks ?? []).map(weekPrintLine)];
}
