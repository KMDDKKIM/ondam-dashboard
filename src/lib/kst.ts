// 한국 표준시(Asia/Seoul, UTC+9, 서머타임 없음) 기준 날짜 도우미.
// 서버/브라우저의 로컬 시간대와 상관없이 "한의원의 오늘"을 구한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 지금(또는 주어진 시각)의 한국 날짜 YYYY-MM-DD. */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 지금(또는 주어진 시각)의 한국 달 YYYY-MM. */
export function currentMonthKst(now: Date = new Date()): string {
  return todayKst(now).slice(0, 7);
}

/** 날짜 문자열(YYYY-MM-DD)에 n일을 더한다(음수 가능). 주말/공휴일 보정 없음. */
export function addDaysKst(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d));
  result.setUTCDate(result.getUTCDate() + n);
  return result.toISOString().slice(0, 10);
}

/** to - from 을 일 단위로(같은 날이면 0, to가 더 늦으면 양수). */
export function diffDaysKst(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** ISO 타임스탬프(timestamptz)를 한국 날짜 YYYY-MM-DD 로. */
export function kstDateOf(iso: string): string {
  return todayKst(new Date(iso));
}

/** ISO 타임스탬프를 한국 시각 HH:mm 으로. */
export function kstTimeOf(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/** YYYY-MM-DD → "26.9.23"(두 자리 연도, 앞자리 0 없는 월·일) — 좁은 자리에 날짜를 줄여 보여줄 때. */
export function shortDateKo(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${String(y).slice(-2)}.${m}.${d}`;
}
