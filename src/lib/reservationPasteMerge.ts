// 예약시트를 다시 붙여넣으면 그날 명단이 통째로 대체된다(reservation-paste API). 그런데 붙여넣는
// 표(OK차트 내보내기)에는 직원이 직접 표시한 정상이행/노쇼(ReservationTable의 결과 버튼),
// 핀셋포인트에서 가져온 결과, 직접 적어 둔 특이사항·비고가 애초에 들어있지 않다 — 그래서 오후에
// 명단을 한 번 더 붙여넣으면 그날 오전에 눌러 둔 표시가 전부 지워졌다(감사 결과 #1, 2026-09-29).
//
// 같은 환자(차트번호가 둘 다 있으면 차트번호, 없으면 이름)로 새 줄과 기존 줄을 짝지어, 직원이
// 직접 넣은 값만 새 줄로 옮겨 붙인다. 시간·주치의·치료부위처럼 매번 최신 스케줄을 따라야 하는
// 칸은 그대로 새로 붙여넣은 값을 쓴다 — 예약이 바뀌었으면 그게 맞다.
import type { ParsedReservationRow } from './pasteImport';

interface ExistingReservationLike {
  patientName: string;
  chartNo: string;
  visitStatus: string;
  specialNotes: string;
  memo: string;
}

// 직원이 예약자 명단 화면에서 직접 눌러야만 붙는 값 — 붙여넣은 표에는 나오지 않는다
// (ReservationTable.tsx 참고). 이 값이 아니면(빈칸·'내원'·'취소') 새로 붙여넣은 값이 이긴다.
const DESK_MARKED_STATUS = new Set(['정상이행', '노쇼']);

function keyOf(patientName: string, chartNo: string): string {
  const chart = chartNo.trim();
  if (chart) return `chart:${chart}`;
  return `name:${patientName.replace(/\s+/g, '')}`;
}

export function mergeReservationPaste(
  existing: ExistingReservationLike[],
  incoming: ParsedReservationRow[]
): ParsedReservationRow[] {
  // 이름/차트번호가 같은 예약이 여러 건이면(동명이인·중복 예약) 먼저 온 순서대로 하나씩 짝짓는다.
  const pool = new Map<string, ExistingReservationLike[]>();
  for (const row of existing) {
    const key = keyOf(row.patientName, row.chartNo);
    const list = pool.get(key);
    if (list) list.push(row);
    else pool.set(key, [row]);
  }

  return incoming.map((row) => {
    const list = pool.get(keyOf(row.patientName, row.chartNo));
    const match = list?.shift();
    if (!match) return row;
    return {
      ...row,
      visitStatus: DESK_MARKED_STATUS.has(match.visitStatus) ? match.visitStatus : row.visitStatus,
      specialNotes: match.specialNotes.trim() ? match.specialNotes : row.specialNotes,
      memo: match.memo.trim() ? match.memo : row.memo,
    };
  });
}
