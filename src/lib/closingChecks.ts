// 일일 결산 저장 전 확인과 "어제 마감 누락" 알림 — 순수 함수. 날짜는 모두 한국(KST) YYYY-MM-DD.
// 병원은 주말에도 열기 때문에(달력 기준) 어제가 무슨 요일이든 마감이 있어야 한다 — 다만
// 추석·설 휴진일(clinicHolidays.ts)은 애초에 진료가 없어 마감도 없으니 예외다.
import { isClinicHoliday } from './clinicHolidays';
import { addDaysKst } from './kst';

/**
 * 저장된 일일 결산(daily_revenue) 날짜 목록을 받아, 어제 마감이 없으면 [어제]를 돌려준다.
 * 어제가 휴진일이면 애초에 마감이 없는 게 맞으니 알리지 않는다.
 * 오직 어제만 본다 — 더 오래된 누락은 알리지 않는다(과거 기록으로 잔소리하지 않기 위해).
 * 홈 화면에서도 이 함수를 그대로 쓴다.
 */
export function missingClosingDates(savedDates: string[], today: string): string[] {
  const yesterday = addDaysKst(today, -1);
  if (isClinicHoliday(yesterday)) return [];
  return savedDates.includes(yesterday) ? [] : [yesterday];
}

/** '2026-09-19' → '9/19' */
export function formatMonthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

/** 배너 문구. dates가 비었으면 null. 예) "어제(9/19) 마감이 아직 입력되지 않았어요" */
export function missingClosingMessage(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return `어제(${formatMonthDay(dates[0])}) 마감이 아직 입력되지 않았어요`;
}

export interface ClosingSaveInput {
  date: string;
  totalRevenue: number | null;
  visitCount: number | null;
  today: string;
  /** 그 날짜에 이미 저장된 마감(없으면 null) */
  existing: { totalRevenue: number; visitCount: number | null } | null;
}

function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/**
 * 저장 전에 사용자에게 다시 물어볼 경고 문구들(비어 있으면 그냥 저장해도 된다).
 *  (a) 총진료비가 0이거나 비어 있음, (b) 내원 환자수가 0(또는 못 읽음),
 *  (c) 날짜가 오늘(KST)보다 미래, (d) 이미 저장된 마감이 있어 덮어씀(예전 값 → 새 값).
 */
export function closingSaveWarnings(input: ClosingSaveInput): string[] {
  const warnings: string[] = [];
  const { date, totalRevenue, visitCount, today, existing } = input;

  if (!totalRevenue) warnings.push('총진료비가 0원(또는 비어 있음)이에요.');
  if (!visitCount) warnings.push('내원 환자수가 0명(또는 읽지 못함)이에요.');
  if (date > today) warnings.push(`${date}은(는) 오늘(${today})보다 미래 날짜예요.`);
  if (existing) {
    const oldVisit = existing.visitCount != null ? `, 내원 ${existing.visitCount}명` : '';
    const newVisit = visitCount != null ? `, 내원 ${visitCount}명` : '';
    warnings.push(
      `이미 저장된 마감이 있어요. 덮어쓸까요? (기존 ${won(existing.totalRevenue)}${oldVisit} → 새 ${won(totalRevenue ?? 0)}${newVisit})`
    );
  }
  return warnings;
}
