export interface DailyFigure {
  totalRevenue: number;
  visitCount: number | null;
}

export interface MonthlyOverrideFigure {
  totalRevenue: number;
  avgDailyVisits: number | null;
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

// 진료일평균환자수 = 내원환자수 합계 ÷ 진료한 날 수. 내원 0명인 날(휴진일, 아직 안 온
// 날짜)은 진료일이 아니라서 빼고, 내원 수를 안 넣은 옛 기록(visitCount 없음)도 뺀다.
// OK차트 월말결산표의 진료일평균환자수(예: 520명 ÷ 19일 = 27.4)와 같은 계산이다.
export function averageVisitsPerDay(daily: DailyFigure[]): number | null {
  const worked = daily.filter((d) => d.visitCount != null && d.visitCount > 0);
  if (worked.length === 0) return null;
  const total = worked.reduce((acc, d) => acc + (d.visitCount ?? 0), 0);
  return roundOne(total / worked.length);
}

// 이번달 총매출·일평균 환자수를 정하는 우선순위.
//   1) 월말결산표(override) — 환불 등으로 일일결산 누적이 어긋날 수 있어서 항상 최우선
//   2) 일일결산을 매일 누적한 값
//   3) (일평균 환자수만) 예약 명단에서 센 값 — 결산 데이터가 아무것도 없을 때의 대비책
// 총매출과 일평균은 각각 따로 우선순위를 적용한다(월말결산에 일평균이 없으면 일일 누적을 쓴다).
export function resolveMonthlyFigures(
  daily: DailyFigure[],
  override: MonthlyOverrideFigure | null,
  fallbackAvgVisits: number | null
): { totalRevenue: number | null; avgDailyVisits: number | null } {
  const dailySum = daily.length > 0 ? daily.reduce((acc, d) => acc + d.totalRevenue, 0) : null;

  return {
    totalRevenue: override ? override.totalRevenue : dailySum,
    avgDailyVisits: override?.avgDailyVisits ?? averageVisitsPerDay(daily) ?? fallbackAvgVisits,
  };
}

// 달성률(%) — 목표가 없거나 0이면 null. 목표를 넘기면 100을 넘는 값 그대로 돌려준다.
export function achievementPercent(achieved: number | null, goal: number | null): number | null {
  if (achieved == null || goal == null || goal <= 0) return null;
  return Math.round((achieved / goal) * 100);
}

export type RevenuePace = 'behind' | 'onTrack';

// 총매출이 "이번 달 날짜 진도"에 맞게 쌓이고 있는지 판단한다.
// - 이번 달에만 의미가 있다(지난달·다음달은 null). 목표가 없어도 null.
// - 결산은 그날 진료가 끝난 뒤 들어오므로, 오늘 매출은 아직 없다고 보고 어제까지
//   지난 날(오늘 날짜 - 1)만큼의 목표 진도와 비교한다. 매월 1일은 비교할 날이 없어 null.
// - "조금 늦다 싶으면" 알려주려고 여유는 5%만 둔다(진도의 95%에 못 미치면 behind).
export function revenuePace(
  achieved: number | null,
  goal: number | null,
  month: string,
  today: Date
): RevenuePace | null {
  if (achieved == null || goal == null || goal <= 0) return null;

  const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (month !== todayMonth) return null;

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysPassed = today.getDate() - 1;
  if (daysPassed <= 0) return null;

  const expected = goal * (daysPassed / daysInMonth);
  return achieved < expected * 0.95 ? 'behind' : 'onTrack';
}
