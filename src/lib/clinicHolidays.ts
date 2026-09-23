// 한의원이 매년 쉬는 날(추석·설 연휴). 지표(월 목표 진도·일평균 등)가 "매일 진료한다"고
// 가정하지 않도록 여기서 뺀다. 설·추석은 음력이라 매년 날짜가 다르다 — 원장님이 알려준
// 날짜만 확보돼 있고(2026-09-24 기준 2026·2027년), 다음 해 날짜는 그때그때 알려주시면 추가한다.
export const CLINIC_HOLIDAYS: readonly string[] = [
  '2026-02-16', '2026-02-17', '2026-02-18', // 설(2026)
  '2026-09-24', '2026-09-25', '2026-09-26', // 추석(2026)
  '2027-02-07', '2027-02-08', '2027-02-09', // 설(2027)
  '2027-09-14', '2027-09-15', '2027-09-16', // 추석(2027)
];

const HOLIDAY_SET = new Set(CLINIC_HOLIDAYS);

/** 'YYYY-MM-DD'가 휴진일인가. */
export function isClinicHoliday(date: string): boolean {
  return HOLIDAY_SET.has(date);
}

/** start~end(둘 다 포함, YYYY-MM-DD) 사이의 휴진일 수. */
export function countHolidaysInRange(start: string, end: string): number {
  if (start > end) return 0;
  let count = 0;
  for (const d of CLINIC_HOLIDAYS) {
    if (d >= start && d <= end) count += 1;
  }
  return count;
}
