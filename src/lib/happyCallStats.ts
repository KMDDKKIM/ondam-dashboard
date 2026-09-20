import type { HappyCallPatient } from './types';

const MATURITY_DAYS = 21;

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromStr: string, toStr: string): number {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

export function computeHerbCallDates(
  pickupDate: string,
  durationDays: number
): { callDate1: string; callDate2: string; callDate3: string } {
  const callDate1 = addDays(pickupDate, 1);
  const callDate2 = addDays(pickupDate, Math.floor(durationDays / 2));
  let callDate3 = addDays(pickupDate, durationDays - 3);
  if (callDate3 < callDate1) {
    callDate3 = callDate1;
  }
  return { callDate1, callDate2, callDate3 };
}

export function computeDietCallDates(detoxStartDate: string): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= 7; i++) {
    dates.push(addDays(detoxStartDate, i));
  }
  return dates;
}

// 삼진 = 초진 후 3주(21일) 안에 3번 내원. 재내원 1~3이 모두 있고, 세 번째 내원일이
// 초진일 + 21일 이내여야 한다(그보다 늦게 채워진 3번째 내원은 삼진이 아니다).
export function isTripleVisit(p: HappyCallPatient): boolean {
  if (!p.revisit1 || !p.revisit2 || !p.revisit3) return false;
  const latest = [p.revisit1, p.revisit2, p.revisit3].reduce((a, b) => (a > b ? a : b));
  return daysBetween(p.firstVisitDate, latest) <= MATURITY_DAYS;
}

// 성숙(21일 경과)한 환자인데 재내원 날짜가 하나도 안 적혀 있는 환자 — 이탈로 잡히기 전에
// 실제로는 왔는데 입력이 안 된 것일 수 있어 대조를 요청한다.
export function countUnreconciledRevisits(patients: HappyCallPatient[], referenceDate: string): number {
  return patients.filter(
    (p) =>
      daysBetween(p.firstVisitDate, referenceDate) >= MATURITY_DAYS &&
      !p.revisit1 &&
      !p.revisit2 &&
      !p.revisit3
  ).length;
}

/** 오늘(KST) 이전에 끝난 가장 최근 월~일 주. 오늘이 일요일이어도 아직 안 끝난 이번 주가 아니라 지난주다. */
export function lastCompletedWeekRange(today: string): { start: string; end: string } {
  return getWeekRange(addDays(getWeekRange(today).start, -1));
}

export interface FirstVisitStats {
  patientCount: number;
  revisitRate: number;
  dropoutRate: number;
  tripleVisitRate: number;
  matureCount: number;
}

export function computeFirstVisitStats(
  patients: HappyCallPatient[],
  referenceDate: string
): FirstVisitStats {
  const patientCount = patients.length;
  if (patientCount === 0) {
    return { patientCount: 0, revisitRate: 0, dropoutRate: 0, tripleVisitRate: 0, matureCount: 0 };
  }

  const revisitedCount = patients.filter((p) => p.revisit1 !== null).length;
  const revisitRate = revisitedCount / patientCount;

  const mature = patients.filter(
    (p) => daysBetween(p.firstVisitDate, referenceDate) >= MATURITY_DAYS
  );
  const matureCount = mature.length;

  const dropoutCount = mature.filter((p) => p.revisit1 === null).length;
  const tripleCount = mature.filter(isTripleVisit).length;

  return {
    patientCount,
    revisitRate,
    dropoutRate: matureCount > 0 ? dropoutCount / matureCount : 0,
    tripleVisitRate: matureCount > 0 ? tripleCount / matureCount : 0,
    matureCount,
  };
}

export interface WeeklyTrendPoint {
  start: string;
  end: string;
  stats: FirstVisitStats;
}

// 초진환자 시트의 "진료의별 통계"처럼, 기준일이 속한 주부터 거슬러 최근 N주
// 흐름을 본다. 배열 맨 앞(index 0)이 가장 최근 주다.
export function computeWeeklyTrend(
  patients: HappyCallPatient[],
  referenceDate: string,
  today: string,
  weeksBack = 5
): WeeklyTrendPoint[] {
  const points: WeeklyTrendPoint[] = [];
  for (let i = 0; i < weeksBack; i++) {
    const shifted = addDays(referenceDate, -7 * i);
    const { start, end } = getWeekRange(shifted);
    const weekPatients = patients.filter((p) => p.firstVisitDate >= start && p.firstVisitDate <= end);
    points.push({ start, end, stats: computeFirstVisitStats(weekPatients, today) });
  }
  return points;
}

export function getWeekRange(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}
