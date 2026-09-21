// 표에서 날짜를 좁은 칸에 보기 좋게 보여 주는 표기. 올해 날짜는 "9/14", 다른 해는 "25.12.26".
// (저장·입력은 항상 YYYY-MM-DD 이고, 여기는 화면 표기만 바꾼다.)
export function formatShortDate(value: string | null | undefined, todayYear: number): string {
  if (!value) return '';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return value;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year === todayYear) return `${month}/${day}`;
  return `${String(year).slice(2)}.${month}.${day}`;
}

// 초진일 오래된 순(오름차순). 같은 날이면 등록한 순서대로 — 같은 날짜 행이 등록할 때마다 뒤섞이지 않게.
export function compareByFirstVisitAsc(
  a: { firstVisitDate: string; createdAt: string },
  b: { firstVisitDate: string; createdAt: string }
): number {
  if (a.firstVisitDate !== b.firstVisitDate) return a.firstVisitDate < b.firstVisitDate ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}
