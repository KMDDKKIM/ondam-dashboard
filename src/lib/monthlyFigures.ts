import { currentMonthKst, diffDaysKst, todayKst } from './kst';

// 일일결산 한 줄(날짜별). 내원 수를 안 넣은 옛 기록은 visitCount가 null이다.
export interface VisitFigure {
  totalRevenue: number;
  visitCount: number | null;
}

export interface DailyFigure extends VisitFigure {
  date: string; // YYYY-MM-DD
}

export interface MonthlyOverrideFigure {
  totalRevenue: number;
  // 진료일평균환자수(하루당 평균 — 총합이 아니다).
  avgDailyVisits: number | null;
  // 월말결산표를 붙여넣은 시점의 "마지막 데이터 날짜"(그 날짜까지의 누계). 옛 행은 null.
  asOfDate: string | null;
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 'YYYY-MM' 달의 일수(28~31). */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' 의 일(1~31). */
export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

// 진료일평균환자수 = 내원환자수 합계 ÷ 진료한 날 수. 내원 0명인 날(휴진일, 아직 안 온
// 날짜)은 진료일이 아니라서 빼고, 내원 수를 안 넣은 옛 기록(visitCount 없음)도 뺀다.
// OK차트 월말결산표의 진료일평균환자수(예: 520명 ÷ 19일 = 27.4)와 같은 계산이다.
export function averageVisitsPerDay(daily: VisitFigure[]): number | null {
  const worked = daily.filter((d) => d.visitCount != null && d.visitCount > 0);
  if (worked.length === 0) return null;
  const total = worked.reduce((acc, d) => acc + (d.visitCount ?? 0), 0);
  return roundOne(total / worked.length);
}

export interface MonthFigures {
  totalRevenue: number | null;
  avgDailyVisits: number | null;
  // 이번 달 총 내원 인원(객단가의 분모). 알 수 없으면 null.
  totalVisits: number | null;
  // 객단가 = 총진료비 ÷ 총 내원 인원(원, 반올림). 내원이 0이거나 알 수 없으면 null.
  averageTicket: number | null;
  // 총매출에 반영된 마지막 날짜(월말결산 기준일 또는 마지막 일일결산일). 모르면 null.
  dataThrough: string | null;
  // 월말결산 값은 있는데 기준일이 없어 일일 마감이 합산되지 않는 옛 행이면 true.
  legacyOverride: boolean;
}

function ticketOf(revenue: number, visits: number | null): number | null {
  return visits != null && visits > 0 ? Math.round(revenue / visits) : null;
}

// 이번달 총매출·일평균 환자수·객단가를 정하는 규칙.
//
//  A) 월말결산(override)에 기준일(asOfDate)이 있는 경우 — 월말결산은 "기준일까지의 누계"다.
//     총매출 = override 총매출 + 기준일 이후(date > asOfDate) 일일결산 매출 합계.
//     (기준일 당일과 그 이전의 일일결산은 이미 월말결산에 들어 있으므로 더하지 않는다.)
//     환자수: override의 avgDailyVisits는 "하루당 평균"이지 합계가 아니므로
//        기준 내원 합계 = avgDailyVisits × (1일부터 기준일까지의 경과일수)  ← 반올림
//        총 내원 = 기준 내원 합계 + 기준일 이후 일일결산 내원 합계
//        일평균 = 총 내원 ÷ (1일부터 "내원 수가 적힌 마지막 날짜"까지의 경과일수)
//     (내원 수를 안 적은 날은 "모름"이라 내원 합계·나눗셈 일수·객단가에서 뺀다. 총매출에는 그대로 더한다.)
//     한의원은 공휴일·주말 포함 매일 진료하므로 달력 기준 경과일수가 맞다.
//     기준일 이후 일일결산이 없으면 override의 값을 그대로 쓴다(반올림 오차를 피하려고).
//     예) 2026-09: 27.4명 × 19일 ≈ 521명 → 9/20에 30명이 오면 (521+30) ÷ 20 = 27.6명.
//  B) 기준일이 없는 옛 override — 예전처럼 override 값만 쓴다(일일결산은 더하지 않는다).
//     그래서 화면에 경고를 띄운다(legacyOverride). 총 내원을 알 수 없어 객단가는 없다.
//  C) override가 없으면 일일결산을 그대로 누적한다. 일평균은 진료한 날 기준
//     (averageVisitsPerDay), 결산 데이터가 전혀 없을 때만 예약 명단 값(fallbackAvgVisits)을 쓴다.
//
// daily는 그 달의 일일결산이다(다른 달 날짜는 무시한다).
export function computeMonthFigures(
  month: string,
  daily: DailyFigure[],
  override: MonthlyOverrideFigure | null,
  fallbackAvgVisits: number | null
): MonthFigures {
  const rows = daily.filter((d) => d.date.startsWith(`${month}-`));
  const dailyAvg = averageVisitsPerDay(rows);

  if (override && override.asOfDate) {
    const dim = daysInMonth(month);
    const monthStart = `${month}-01`;
    const asOf = override.asOfDate;
    const clampDays = (date: string) => Math.min(dim, Math.max(0, diffDaysKst(monthStart, date) + 1));
    const after = rows.filter((d) => d.date > asOf);

    const totalRevenue = override.totalRevenue + after.reduce((acc, d) => acc + d.totalRevenue, 0);
    const monthEnd = `${month}-${String(dim).padStart(2, '0')}`;
    const latestRaw = after.reduce((max, d) => (d.date > max ? d.date : max), asOf);
    const latest = latestRaw > monthEnd ? monthEnd : latestRaw;
    const elapsed = clampDays(latest);
    const dataThrough = elapsed > 0 ? latest : null;

    if (override.avgDailyVisits == null) {
      return {
        totalRevenue,
        avgDailyVisits: dailyAvg ?? fallbackAvgVisits,
        totalVisits: null,
        averageTicket: null,
        dataThrough,
        legacyOverride: false,
      };
    }

    // 내원 수를 안 적은 날(visitCount null)은 "모름"이다 — 내원 합계·일평균의 나눗셈 일수·객단가에서 모두 뺀다.
    const afterWithVisits = after.filter((d) => d.visitCount != null);
    const baselineVisits = Math.round(override.avgDailyVisits * clampDays(asOf));
    const totalVisits = baselineVisits + afterWithVisits.reduce((acc, d) => acc + (d.visitCount ?? 0), 0);
    const latestVisitDate = afterWithVisits.reduce((max, d) => (d.date > max ? d.date : max), asOf);
    const visitElapsed = clampDays(latestVisitDate > monthEnd ? monthEnd : latestVisitDate);
    const avgDailyVisits =
      afterWithVisits.length === 0 || visitElapsed === 0 ? override.avgDailyVisits : roundOne(totalVisits / visitElapsed);
    const ticketRevenue = override.totalRevenue + afterWithVisits.reduce((acc, d) => acc + d.totalRevenue, 0);
    return { totalRevenue, avgDailyVisits, totalVisits, averageTicket: ticketOf(ticketRevenue, totalVisits), dataThrough, legacyOverride: false };
  }

  if (override) {
    return {
      totalRevenue: override.totalRevenue,
      avgDailyVisits: override.avgDailyVisits ?? dailyAvg ?? fallbackAvgVisits,
      totalVisits: null,
      averageTicket: null,
      dataThrough: null,
      legacyOverride: true,
    };
  }

  if (rows.length === 0) {
    return { totalRevenue: null, avgDailyVisits: fallbackAvgVisits, totalVisits: null, averageTicket: null, dataThrough: null, legacyOverride: false };
  }

  // 객단가는 내원 수가 적힌 날만으로 계산한다(내원 없는 옛 기록의 매출이 분자에만 들어가면 부풀려진다).
  const withVisits = rows.filter((d) => d.visitCount != null);
  const totalVisits = withVisits.length > 0 ? withVisits.reduce((acc, d) => acc + (d.visitCount ?? 0), 0) : null;
  return {
    totalRevenue: rows.reduce((acc, d) => acc + d.totalRevenue, 0),
    avgDailyVisits: dailyAvg ?? fallbackAvgVisits,
    totalVisits,
    averageTicket: ticketOf(withVisits.reduce((acc, d) => acc + d.totalRevenue, 0), totalVisits),
    dataThrough: rows.reduce((max, d) => (d.date > max ? d.date : max), rows[0].date),
    legacyOverride: false,
  };
}

// 달성률(%) — 목표가 없거나 0이면 null. 목표를 넘기면 100을 넘는 값 그대로 돌려준다.
export function achievementPercent(achieved: number | null, goal: number | null): number | null {
  if (achieved == null || goal == null || goal <= 0) return null;
  return Math.round((achieved / goal) * 100);
}

export type Pace = 'behind' | 'onTrack';

// 목표 대비 "이번 달 날짜 진도"를 판단한다(총매출·한약·다이어트·특수한약·추나 공통).
// - 이번 달에만 의미가 있다(지난달·다음달은 null). 목표가 없어도 null.
// - 결산·기록은 그날이 끝난 뒤 들어오므로, 오늘은 아직 없다고 보고 어제까지 지난 날
//   (오늘 날짜 - 1)만큼의 목표 진도(expected)와 비교한다. 매월 1일은 null.
// - "조금 늦다 싶으면" 알려주려고 여유는 5%만 둔다(진도의 95%에 못 미치면 behind).
export function goalPace(
  achieved: number | null,
  goal: number | null,
  month: string,
  today: Date
): { status: Pace; expected: number } | null {
  if (achieved == null || goal == null || goal <= 0) return null;

  // 서버(UTC)에서 먼저 그려질 때도 한국 날짜 기준으로 같은 값이 나오게 한다.
  if (month !== currentMonthKst(today)) return null;

  const [y, m, d] = todayKst(today).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysPassed = d - 1;
  if (daysPassed <= 0) return null;

  const expected = goal * (daysPassed / daysInMonth);
  return { status: achieved < expected * 0.95 ? 'behind' : 'onTrack', expected };
}

export function revenuePace(
  achieved: number | null,
  goal: number | null,
  month: string,
  today: Date
): Pace | null {
  return goalPace(achieved, goal, month, today)?.status ?? null;
}

// 건수 목표(한약 등)에서 지금 진도를 맞추려면 몇 건이 더 필요한지(올림, 최소 1).
export function shortfallCount(achieved: number, expected: number): number {
  return Math.max(1, Math.ceil(expected - achieved));
}

export interface PreviousMonthData {
  month: string;
  // 지난달 일일결산(날짜별).
  daily: Pick<DailyFigure, 'date' | 'totalRevenue'>[];
  // 지난달 최종 총매출(월말결산/일일결산 규칙으로 계산한 값). 없으면 null.
  totalRevenue: number | null;
}

// 지난달 "같은 날까지"의 누계.
//  - 지난달 1일~D일 일일결산이 하루도 빠짐없이 있으면 그 합계를 그대로 쓴다(exact).
//  - 빠진 날이 있으면(예: 월말결산으로만 채운 달) 지난달 총매출을 일수로 나눠 D일분만큼
//    잡는다(일할 계산, approximate=true) — 정확하지 않아 화면에도 "일할 추정"이라고 밝힌다.
//  - 지난달 데이터가 아예 없으면 null.
export function previousSameDayTotal(
  previous: PreviousMonthData,
  day: number
): { amount: number; approximate: boolean } | null {
  if (day <= 0) return null;
  const dim = daysInMonth(previous.month);
  const upTo = Math.min(day, dim);
  const covered = new Map<string, number>();
  for (const d of previous.daily) {
    if (d.date.startsWith(`${previous.month}-`) && dayOfMonth(d.date) <= upTo) covered.set(d.date, d.totalRevenue);
  }
  if (covered.size === upTo) {
    return { amount: Array.from(covered.values()).reduce((a, b) => a + b, 0), approximate: false };
  }
  if (previous.totalRevenue != null) {
    return { amount: Math.round((previous.totalRevenue * upTo) / dim), approximate: true };
  }
  return null;
}

export interface RevenueMotivationInput {
  month: string; // 보고 있는 달 'YYYY-MM'
  today: string; // 한국 기준 오늘 'YYYY-MM-DD'
  totalRevenue: number | null;
  goal: number | null;
  dataThrough: string | null; // MonthFigures.dataThrough
  previous: PreviousMonthData | null;
}

export interface RevenueMotivation {
  reached: boolean;
  lines: string[];
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

// 이번 달 진행 일수(달력 기준 — 한의원은 매일 진료한다). 마지막 데이터 날짜까지, 모르면
// 어제까지(결산은 그날이 끝난 뒤 들어오므로). 오늘보다 앞선 날만 센다.
export function elapsedDaysForMonth(today: string, dataThrough: string | null): number {
  if (dataThrough) return dayOfMonth(dataThrough < today ? dataThrough : today);
  return Math.max(0, dayOfMonth(today) - 1);
}

// 총매출 아래에 보여줄 동기부여 문구. 이번 달(month === today의 달)에는 남은 금액/필요
// 일평균/월말 예상/지난달 같은 날 대비를 보여주고, 지난 달에는 목표 달성 여부만 본다.
//  - 남은 일수 = 오늘을 포함한 이번 달 남은 날. 단 오늘 마감까지 이미 들어왔으면(dataThrough ≥ today) 오늘은 뺀다.
//  - 현재 일평균 매출 = 총매출 ÷ 진행 일수(달력 기준). 월말 예상 = 일평균 × 그 달 일수.
export function revenueMotivation(input: RevenueMotivationInput): RevenueMotivation {
  const { month, today, totalRevenue, goal, dataThrough, previous } = input;
  const lines: string[] = [];
  const hasGoal = goal != null && goal > 0;
  const reached = hasGoal && totalRevenue != null && totalRevenue >= goal;
  const isCurrent = today.startsWith(`${month}-`);

  if (reached) lines.push('🎉 목표 달성!');
  if (!isCurrent || totalRevenue == null) return { reached, lines };

  const dim = daysInMonth(month);
  const elapsed = elapsedDaysForMonth(today, dataThrough);

  if (hasGoal && !reached) {
    const remaining = goal - totalRevenue;
    lines.push(`목표까지 ${won(remaining)} 남았어요`);
    const remainingDays = dim - dayOfMonth(today) + (dataThrough != null && dataThrough >= today ? 0 : 1);
    if (remainingDays > 0) {
      lines.push(`남은 ${remainingDays}일 동안 하루 평균 ${won(Math.ceil(remaining / remainingDays))}이 필요해요`);
    }
    if (elapsed > 0) {
      const dailyPace = totalRevenue / elapsed;
      const projected = Math.round(dailyPace * dim);
      lines.push(`이 속도(일평균 ${won(dailyPace)})면 월말 예상 ${won(projected)} (목표의 ${Math.round((projected / goal) * 100)}%)`);
    }
  }

  if (previous && elapsed > 0) {
    const prev = previousSameDayTotal(previous, elapsed);
    if (prev && prev.amount > 0) {
      const pct = Math.round(((totalRevenue - prev.amount) / prev.amount) * 100);
      lines.push(`지난달 같은 날${prev.approximate ? '(일할 추정)' : ''} 대비 ${pct > 0 ? '+' : ''}${pct}%`);
    }
  }

  return { reached, lines };
}
