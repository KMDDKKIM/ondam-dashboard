import type { Reservation } from './types';

export interface DerivedStats {
  visitCount: number;
  reservationCount: number;
  excludedCount: number;
  excludedNames: string[];
  chunaCount: number;
  chunaNames: string[];
}

// 예약자 명단(엑셀 붙여넣기/수동 편집)이 저장될 때마다 마감 멘트 없이 바로 여기서
// 예약률/부도취소율/추나 통계를 뽑는다. 내원/취소는 명단의 visitStatus 그대로
// 쓰면 되지만, 녹용/일반 한약·다이어트·초진 구분은 명단 텍스트만으로는 믿을 만하게
// 가려낼 수 없어(치료 항목 표기가 병원마다/환자마다 제각각) 여기서 다루지 않는다
// — 이 값들은 계속 daily_records에 남아있던 마지막 값을 유지한다.
export function computeDerivedStats(rows: Reservation[]): DerivedStats {
  const excluded = rows.filter((r) => r.visitStatus === '취소');
  const visited = rows.filter((r) => r.visitStatus === '내원');
  const chuna = rows.filter((r) => r.treatmentArea.includes('추나') || r.treatment.includes('추나'));

  return {
    visitCount: visited.length,
    reservationCount: rows.length,
    excludedCount: excluded.length,
    excludedNames: excluded.map((r) => r.patientName).filter(Boolean),
    chunaCount: chuna.length,
    chunaNames: chuna.map((r) => r.patientName).filter(Boolean),
  };
}
