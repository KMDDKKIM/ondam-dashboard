import { describe, expect, it } from 'vitest';
import { computeReservationRates } from './reservationRates';

const day = (over: Partial<Parameters<typeof computeReservationRates>[0][number]>) => ({
  visitCount: 34,
  excludedCount: 3,
  reservationCount: 21,
  keptCount: 15,
  noshowCount: 3,
  cancelCount: 3,
  ...over,
});

describe('computeReservationRates', () => {
  it('예약률 = 정상 이행 ÷ (내원 − 제외), 부도취소율 = (노쇼+취소) ÷ 예약', () => {
    const rates = computeReservationRates([day({})]);
    // 15 / (34 - 3) = 48.4%,  (3 + 3) / 21 = 28.6%
    expect(rates.reservationRate).toBe(48.4);
    expect(rates.noShowRate).toBe(28.6);
  });

  it('여러 날은 분자·분모를 각각 합쳐서 계산한다(비율 평균이 아니다)', () => {
    const rates = computeReservationRates([
      day({ visitCount: 30, excludedCount: 0, reservationCount: 10, keptCount: 10, noshowCount: 0, cancelCount: 0 }),
      day({ visitCount: 10, excludedCount: 0, reservationCount: 10, keptCount: 0, noshowCount: 5, cancelCount: 5 }),
    ]);
    // 예약률: (10 + 0) / (30 + 10) = 25%,  부도취소율: (0 + 10) / 20 = 50%
    expect(rates.reservationRate).toBe(25);
    expect(rates.noShowRate).toBe(50);
  });

  it('예약 숫자를 입력하지 않은 날은 계산에서 뺀다', () => {
    const rates = computeReservationRates([
      day({}),
      day({ reservationCount: null, visitCount: 999, keptCount: null }),
    ]);
    expect(rates.reservationRate).toBe(48.4);
  });

  it('데이터가 없거나 분모가 0이면 null', () => {
    expect(computeReservationRates([])).toEqual({ reservationRate: null, noShowRate: null });
    expect(
      computeReservationRates([day({ visitCount: 3, excludedCount: 3, reservationCount: 0, keptCount: 0, noshowCount: 0, cancelCount: 0 })])
    ).toEqual({ reservationRate: null, noShowRate: null });
  });
});
