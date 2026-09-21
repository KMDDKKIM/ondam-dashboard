import { diffDaysKst } from './kst';

export const QUOTES = [
  '오늘도 환자분의 이야기를 먼저 들어주세요.',
  '작은 친절이 재진율을 만듭니다.',
  '기록이 쌓이면 진료의 방향이 보입니다.',
  '바쁠수록 해피콜 한 통이 더 중요합니다.',
  '오늘 걸어야 할 전화, 미루지 않기.',
  '환자의 다음 방문을 미리 준비하세요.',
];

// 날짜(YYYY-MM-DD)만으로 그날의 첫 문구 번호를 정한다 — 같은 날이면 서버/브라우저 어디서나
// 같은 값이라 화면이 어긋나지 않고, 날이 바뀌면 다음 문구로 넘어간다.
export function quoteIndexForDate(date: string, count: number = QUOTES.length): number {
  const days = diffDaysKst('2026-01-01', date);
  return ((days % count) + count) % count;
}
