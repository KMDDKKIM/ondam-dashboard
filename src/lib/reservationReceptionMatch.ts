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

function normalizeName(name: string): string {
  return name.replace(/\s+/g, '');
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
