// "최근 저장 기록"에 붙이는 저장 시각. 오늘 저장했으면 시:분만, 아니면 월/일 시:분.
export function formatSavedAt(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}
