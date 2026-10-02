// 직원 연차/월차 계산의 순수 로직. 잔여일수는 저장해 두지 않고, 입사일+오늘을 기준으로
// "정책상 받아야 할 일수"를 그때그때 계산한 뒤, 원장이 넣은 수동 조정과 승인된 신청분을
// 더하고 뺀다(크론 작업 없이 Vercel 서버리스에서 그대로 동작). 화면/DB 코드는 따로 있다.

import { countHolidaysInRange } from './clinicHolidays';

/** 수습 기간(개월) — 이 기간 동안은 월차·연차 모두 0. */
export const PROBATION_MONTHS = 3;
/** 입사 1년이 지나면 받는 법정연차 기본 일수(사람마다 다르게 주려면 조정(leave_adjustments)으로 얹는다). */
export const DEFAULT_ANNUAL_DAYS = 15;

export type LeaveKind = 'monthly' | 'annual';

export interface LeaveEntitlement {
  monthly: number;
  annual: number;
}

/** hireDate부터 today까지 지난 "꽉 찬 달" 수(일수 근사가 아니라 달력 기준) — 음수면 0. */
export function monthsBetween(hireDate: string, today: string): number {
  const [hy, hm, hd] = hireDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let months = (ty - hy) * 12 + (tm - hm);
  if (td < hd) months -= 1;
  return Math.max(0, months);
}

/**
 * 입사일 기준 정책상 받아야 할 일수.
 * - 수습(입사 후 3개월 미만): 월차·연차 모두 0.
 * - 수습 끝~1년 미만: 수습이 끝난 뒤 지난 달 수만큼 월차 1일씩(최대 1년 미만이니 최대 9개월치).
 * - 1년 이상: 월차는 더 안 늘어나고(이미 받은 건 남아 있음, adjustments로 추적), 법정연차 발생.
 */
export function computePolicyEntitlement(hireDate: string | null, today: string): LeaveEntitlement {
  if (!hireDate) return { monthly: 0, annual: 0 };
  const months = monthsBetween(hireDate, today);
  if (months < PROBATION_MONTHS) return { monthly: 0, annual: 0 };
  if (months < 12) return { monthly: months - PROBATION_MONTHS + 1, annual: 0 };
  return { monthly: 9, annual: DEFAULT_ANNUAL_DAYS }; // 수습 끝~1년 사이 최대로 쌓일 수 있는 월차(9개월치)는 유지
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

/** 부여(entitlement + 수동 조정 합) - 사용(승인된 신청 합) = 남은 일수. */
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
 * {kind, days} 꼴로 받는다 — 신청 건은 호출하는 쪽에서 leaveDaysUsed로 일수를 미리 구해 넘긴다.
 */
export function computeBalances(
  hireDate: string | null,
  today: string,
  adjustments: { kind: LeaveKind; days: number }[],
  approvedUsage: { kind: LeaveKind; days: number }[]
): LeaveBalances {
  const entitlement = computePolicyEntitlement(hireDate, today);
  const forKind = (kind: LeaveKind) =>
    summarizeBalance(
      entitlement[kind],
      adjustments.filter((a) => a.kind === kind).map((a) => a.days),
      approvedUsage.filter((a) => a.kind === kind).map((a) => a.days)
    );
  return { monthly: forKind('monthly'), annual: forKind('annual') };
}
