// 예약 명단과 접수기록부를 이름으로 대조해서 "정상 이행/노쇼"를 가른다.
// 취소는 예약 명단 자체의 취소 표시를 그대로 쓴다(이미 정확하고 자동이라 손댈 이유가 없다).
// 노쇼는 "나머지"다: 예약 인원에서 매칭된 정상 이행과 취소를 뺀 값 — 접수기록부에 없고
// 취소로도 표시되지 않은 예약은 노쇼로 본다. 매칭은 이름만으로 한다(접수기록부에는 차트번호가
// 없어서) — 동명이인이 있으면 잘못 매칭될 수 있지만, 그 정도는 감수하기로 원장님과 합의했다
// (2026-09-24). 한 이름이 여러 번 나오면(동명이인·중복 예약) 멀티셋으로 대조해서 실제로 있는
// 개수만큼만 매칭한다 — 한쪽에 한 번 있는 이름이 다른 쪽 여러 예약을 동시에 채우지 않는다.

export interface AttendanceMatch {
  keptCount: number;
  cancelCount: number;
  noshowCount: number;
}

// API 응답이 항상 깨끗한 문자열이라는 보장이 없어(누락·null 등) 방어적으로 문자열로 바꾼 뒤 다듬는다.
function normalizeName(name: string | null | undefined): string {
  return String(name ?? '').replace(/\s+/g, '');
}

/**
 * 접수기록부에서 정상이행 이름 대조에 쓸 이름들. "제외"(예약률에서 빼는 분 — 진단서만 받아가신 분,
 * 실제로 안 오셨는데 처방전 출력으로 잡힌 분 등)는 뺀다. 예약률 = 정상이행 ÷ (내원 − 제외)라서
 * 제외한 사람은 분모에서 이미 빠지는데, 그 사람이 예약자 명단에도 있다고 정상이행에 넣으면
 * 분자에만 남아 예약률이 부풀려진다(2026-09-25). 빠진 사람이 예약자라면 노쇼(나머지)로 잡힌다.
 */
export function attendanceNamesFrom(records: { patientName: string; excluded?: boolean }[]): string[] {
  return records.filter((r) => !r.excluded).map((r) => r.patientName);
}

export function matchAttendance(
  reservations: { patientName: string; visitStatus: string }[],
  receptionNames: string[]
): AttendanceMatch {
  const cancelCount = reservations.filter((r) => r.visitStatus === '취소').length;
  const candidates = reservations.filter((r) => r.visitStatus !== '취소');

  // 접수기록부 이름들을 멀티셋(이름 → 남은 개수)으로 쌓는다.
  const pool = new Map<string, number>();
  for (const raw of receptionNames) {
    const name = normalizeName(raw);
    if (name === '') continue;
    pool.set(name, (pool.get(name) ?? 0) + 1);
  }

  let keptCount = 0;
  for (const r of candidates) {
    const name = normalizeName(r.patientName);
    if (name === '') continue;
    const remaining = pool.get(name) ?? 0;
    if (remaining > 0) {
      pool.set(name, remaining - 1);
      keptCount += 1;
    }
  }

  const noshowCount = Math.max(0, reservations.length - keptCount - cancelCount);

  return { keptCount, cancelCount, noshowCount };
}

export interface MarkedAttendance {
  keptCount: number;
  noshowCount: number;
}

/**
 * 예약자 명단 화면에서 직접 표시한 정상이행/노쇼로 직접 센다(취소는 원래도 명단 자체 값을
 * 그대로 썼으니 여기 다시 안 건드린다 — 위 matchAttendance와 같은 방식으로 계속 잰다).
 * "정상이행"은 붙여넣은 표의 '내원' 값과 일부러 다른 문자열이다 — OK차트 예약표는 취소만
 * 아니면 방문 전부터 그 칸에 항상 '내원'이라고 적어 두므로(실제 방문 여부와 무관한 기본값),
 * 그대로 정상이행으로 세면 하루가 시작하기도 전에 예약 전원이 정상이행으로 잡힌다. 그래서
 * 직원이 예약자 명단 화면에서 직접 눌러야만 이 값이 붙는다(ReservationTable.tsx).
 * 하나도 안 표시돼 있으면 null — 그러면 호출하는 쪽에서 matchAttendance(이름 대조)로 채운다
 * (원장 결정, 2026-09-24: 직접 표시가 이름 대조보다 정확하니 있으면 그걸 우선한다).
 */
export function countMarkedAttendance(reservations: { visitStatus: string }[]): MarkedAttendance | null {
  const hasMarked = reservations.some((r) => r.visitStatus === '정상이행' || r.visitStatus === '노쇼');
  if (!hasMarked) return null;
  let keptCount = 0;
  let noshowCount = 0;
  for (const r of reservations) {
    if (r.visitStatus === '정상이행') keptCount += 1;
    else if (r.visitStatus === '노쇼') noshowCount += 1;
  }
  return { keptCount, noshowCount };
}
