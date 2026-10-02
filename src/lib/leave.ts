// 직원 연차/월차 계산의 순수 로직. 입사일 기준 자동 계산 대신, 원장이 직원별로 월차·연차를
// 직접 부여(leave_adjustments에 +로 기록)한다 — 월차는 보통 매달 하루씩, 연차는 일년에 정해진
// 일수만큼 원장이 그때그때 넣어 준다. 잔여일수는 그 부여 합계에서 승인된 신청분을 뺀 값으로,
// 저장해 두지 않고 매번 계산한다(크론 작업 없이 Vercel 서버리스에서 그대로 동작).

import { countHolidaysInRange } from './clinicHolidays';

export type LeaveKind = 'monthly' | 'annual';

/** 'YYYY-MM-DD' → 연도(숫자). 연차는 연도가 바뀌면 전년도 잔여분이 소멸되므로 이 기준으로 끊는다. */
export function yearOfDate(date: string): number {
  return Number(date.slice(0, 4));
}

/** 신청 기간의 실제 차감 일수 — 추석·설 휴진일은 원래 아무도 안 쉬는 날이라 빼고 센다. 반차면 0.5. */
export function leaveDaysUsed(startDate: string, endDate: string, halfDay: 'am' | 'pm' | null): number {
  if (halfDay) return 0.5;
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const totalDays = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
  const holidays = countHolidaysInRange(startDate, endDate);
  return Math.max(0, totalDays - holidays);
}

export interface LeaveBalance {
  entitled: number;
  used: number;
  available: number;
}

/**
 * month(YYYY-MM)가 속한 달력을 일요일 시작 7일씩 주 단위로 나눈다. 앞뒤는 이전/다음 달
 * 날짜로 채워 항상 꽉 찬 주가 되게 한다(달력 그리드 렌더링용).
 */
export function monthGridWeeks(month: string): string[][] {
  const [y, m] = month.split('-').map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const startOffset = firstOfMonth.getUTCDay(); // 0=일요일
  const gridStart = new Date(Date.UTC(y, m - 1, 1 - startOffset));

  const lastOfMonth = new Date(Date.UTC(y, m, 0));
  const endOffset = 6 - lastOfMonth.getUTCDay();
  const totalDays = startOffset + lastOfMonth.getUTCDate() + endOffset;

  const dates: string[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(gridStart.getTime() + i * 86400000);
    dates.push(d.toISOString().slice(0, 10));
  }

  const weeks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));
  return weeks;
}

/** 부여(수동 조정 합) - 사용(승인된 신청 합) = 남은 일수. */
export function summarizeBalance(
  entitlement: number,
  adjustments: number[],
  approvedUsedDays: number[]
): LeaveBalance {
  const adjustedTotal = adjustments.reduce((sum, d) => sum + d, 0);
  const used = approvedUsedDays.reduce((sum, d) => sum + d, 0);
  const entitled = entitlement + adjustedTotal;
  return { entitled, used, available: entitled - used };
}

export interface LeaveBalances {
  monthly: LeaveBalance;
  annual: LeaveBalance;
}

/**
 * 월차/연차 각각의 잔여일수. DB 타입(LeaveAdjustment/LeaveRequest)에 의존하지 않도록
 * {kind, days, year} 꼴로 받는다 — 신청 건은 호출하는 쪽에서 leaveDaysUsed로 일수를, year는
 * yearOfDate(startDate)로 미리 구해 넘긴다. 자동 계산되는 기본 부여분은 없다(원장이 조정으로
 * 넣은 만큼이 전부) — summarizeBalance의 entitlement 인자는 항상 0.
 *
 * 연차는 year가 일치하는 부여·사용만 더해 그 해가 지나면 미사용분이 소멸되게 한다(이월 없음).
 * 월차는 매달 쌓이는 누적분이라 year와 무관하게 전체를 더한다.
 */
export function computeBalances(
  year: number,
  adjustments: { kind: LeaveKind; days: number; year: number }[],
  approvedUsage: { kind: LeaveKind; days: number; year: number }[]
): LeaveBalances {
  const forKind = (kind: LeaveKind) => {
    const scoped = kind === 'annual';
    const adj = adjustments.filter((a) => a.kind === kind && (!scoped || a.year === year));
    const used = approvedUsage.filter((a) => a.kind === kind && (!scoped || a.year === year));
    return summarizeBalance(0, adj.map((a) => a.days), used.map((a) => a.days));
  };
  return { monthly: forKind('monthly'), annual: forKind('annual') };
}
