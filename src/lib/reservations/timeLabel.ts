// 예약시간(timeLabel) 입력칸 — 직원이 "930", "9:30", "1400" 등 편하게 치면 "HH:MM"(zero-padded)로
// 바꿔준다. printSheet.ts의 groupByDoctor/flattenForPrint가 timeLabel을 문자열 그대로
// localeCompare로 정렬하므로, zero-padded "HH:MM" 형식이어야 정렬이 맞는다.
export function normalizeTimeLabel(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') return '';

  const colonMatch = trimmed.match(/^(\d{1,2})\s*[:.]\s*(\d{1,2})$/);
  if (colonMatch) {
    return formatHm(Number(colonMatch[1]), Number(colonMatch[2]));
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') return trimmed; // 숫자를 못 읽으면 원문을 그대로 둔다(뭔지 모를 값을 지우지 않는다)

  if (digits.length <= 2) return formatHm(Number(digits), 0);
  if (digits.length === 3) return formatHm(Number(digits.slice(0, 1)), Number(digits.slice(1)));
  // 4자리 이상이면 앞 2자리를 시, 다음 2자리를 분으로 본다(그 뒤는 버린다).
  return formatHm(Number(digits.slice(0, 2)), Number(digits.slice(2, 4)));
}

function formatHm(hour: number, minute: number): string {
  const h = Math.min(Math.max(hour, 0), 23);
  const m = Math.min(Math.max(minute, 0), 59);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 예약시간(timeLabel) 순으로 정렬한다(안정 정렬). 시간이 비어 있는 줄은 맨 뒤로 보낸다. */
export function sortReservationsByTime<T extends { timeLabel: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const at = a.timeLabel.trim();
    const bt = b.timeLabel.trim();
    if (at === '' && bt === '') return 0;
    if (at === '') return 1;
    if (bt === '') return -1;
    return at.localeCompare(bt);
  });
}
