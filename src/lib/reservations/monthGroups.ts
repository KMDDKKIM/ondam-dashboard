// 예약관리 왼쪽 날짜 목록을 달별로 묶는 순수 로직. 날짜는 YYYY-MM-DD 문자열이다.

export interface MonthGroup<T extends { date: string }> {
  /** YYYY-MM */
  month: string;
  /** 그 달의 기록, 최근 날짜가 위 */
  records: T[];
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** 달별로 묶는다: 최근 달이 위, 각 달 안에서도 최근 날짜가 위. */
export function groupRecordsByMonth<T extends { date: string }>(records: T[]): MonthGroup<T>[] {
  const byMonth = new Map<string, T[]>();
  for (const record of [...records].sort((a, b) => b.date.localeCompare(a.date))) {
    const month = monthOf(record.date);
    const list = byMonth.get(month);
    if (list) list.push(record);
    else byMonth.set(month, [record]);
  }
  return [...byMonth.entries()].map(([month, list]) => ({ month, records: list }));
}

/**
 * 기본으로 펼쳐 둘지: 이번 달과 지금 고른 날짜의 달은 펼치고 나머지는 접는다.
 * override 는 직원이 직접 누른 달(true=펼침, false=접힘)이며 기본값보다 우선한다.
 */
export function isMonthOpen(month: string, currentMonth: string, selectedDate: string, override: Record<string, boolean>): boolean {
  if (month in override) return override[month];
  return month === currentMonth || month === monthOf(selectedDate);
}
