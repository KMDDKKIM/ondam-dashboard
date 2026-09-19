// 일일 결산에 입력한 예약 관련 숫자로 예약률·부도취소율을 계산한다.
// - 예약률   = 예약 정상 이행 ÷ (내원환자수 − 제외환자수)
//              (실제로 진료받은 환자 중 예약을 하고 온 사람의 비율)
// - 부도취소율 = (예약 노쇼 + 예약 취소) ÷ 오늘 예약 환자수
//              (예약을 한 사람 중 안 오거나 취소한 사람의 비율)
// 여러 날(이번 주)을 합칠 때는 비율의 평균이 아니라 분자·분모를 각각 합쳐서 계산한다.

export interface DailyRateInput {
  visitCount: number | null; // 내원환자수(결산표)
  excludedCount: number | null; // 제외환자수
  reservationCount: number | null; // 오늘 예약 환자수
  keptCount: number | null; // 예약 정상 이행
  noshowCount: number | null; // 예약 노쇼
  cancelCount: number | null; // 예약 취소
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

// 예약 숫자를 입력하지 않은 날(reservationCount 없음)은 통째로 계산에서 뺀다.
export function computeReservationRates(days: DailyRateInput[]): {
  reservationRate: number | null;
  noShowRate: number | null;
} {
  const entered = days.filter((d) => d.reservationCount != null);

  let kept = 0;
  let patients = 0; // 내원 − 제외
  let reservations = 0;
  let lost = 0; // 노쇼 + 취소

  for (const d of entered) {
    kept += d.keptCount ?? 0;
    patients += Math.max(0, (d.visitCount ?? 0) - (d.excludedCount ?? 0));
    reservations += d.reservationCount ?? 0;
    lost += (d.noshowCount ?? 0) + (d.cancelCount ?? 0);
  }

  return {
    reservationRate: patients > 0 ? roundOne((kept / patients) * 100) : null,
    noShowRate: reservations > 0 ? roundOne((lost / reservations) * 100) : null,
  };
}
