import { describe, expect, it } from 'vitest';
import { formatFee, formatLogHeader, normalizeBirth, parseFee, summarize, weekdayKo, type ReceptionRecord } from './receptionLog';

function rec(o: Partial<ReceptionRecord>): ReceptionRecord {
  return { id: 'x', visitDate: '2026-09-21', seq: 1, visitKind: '', patientName: '가상환자', birthDate: null, treatment: null, fee: null, payment: null, reserved: false, note: null, ...o };
}

describe('날짜 머리글', () => {
  it('요일을 날짜에서 계산한다', () => {
    expect(weekdayKo('2026-09-21')).toBe('월');
    expect(weekdayKo('2026-09-20')).toBe('일');
    expect(weekdayKo('2026-01-01')).toBe('목');
  });

  it('월·일·요일로 적는다', () => {
    expect(formatLogHeader('2026-09-21')).toBe('9월 21일 월요일');
    expect(formatLogHeader('2026-12-05')).toBe('12월 5일 토요일');
  });
});

describe('진료비 입력', () => {
  it('쉼표·원·공백을 걷어 정수로', () => {
    expect(parseFee('2,400')).toBe(2400);
    expect(parseFee(' 24000원 ')).toBe(24000);
    expect(parseFee('0')).toBe(0);
  });

  it('비었거나 숫자가 아니면 null', () => {
    expect(parseFee('')).toBeNull();
    expect(parseFee('  ')).toBeNull();
    expect(parseFee('이만원')).toBeNull();
    expect(parseFee('-500')).toBeNull();
  });

  it('보여 줄 때는 천 단위 쉼표', () => {
    expect(formatFee(47700)).toBe('47,700');
    expect(formatFee(null)).toBe('');
  });
});

describe('하루 합계', () => {
  it('결제 방법별 금액, 초진·예약 수를 센다', () => {
    const s = summarize([
      rec({ fee: 2400, payment: '카드', reserved: true }),
      rec({ fee: 47700, payment: '카드', visitKind: '초' }),
      rec({ fee: 1500, payment: '현금' }),
      rec({ fee: 3000, payment: '미수', visitKind: '재초', reserved: true }),
    ]);
    expect(s).toMatchObject({ count: 4, firstVisitCount: 2, reservedCount: 2, feeTotal: 54600, cash: 1500, card: 50100, unpaid: 3000, paymentMissing: 0 });
  });

  it('진료비는 있는데 결제 방법이 빈 줄을 알려 준다(금액 없는 줄은 제외)', () => {
    const s = summarize([rec({ fee: 2400 }), rec({ fee: null }), rec({ fee: 1000, payment: '현금' })]);
    expect(s.paymentMissing).toBe(1);
    expect(s.feeTotal).toBe(3400);
  });

  it('빈 날은 전부 0', () => {
    expect(summarize([])).toMatchObject({ count: 0, feeTotal: 0, paymentMissing: 0 });
  });
});

describe('생년월일 입력', () => {
  it('숫자 6자리는 손글씨 모양(yy.m.d)으로', () => {
    expect(normalizeBirth('440630')).toBe('44.6.30');
    expect(normalizeBirth('090721')).toBe('09.7.21');
  });

  it('그 밖의 입력은 그대로, 비면 null', () => {
    expect(normalizeBirth(' 44.6.30 ')).toBe('44.6.30');
    expect(normalizeBirth('1944-06-30')).toBe('1944-06-30');
    expect(normalizeBirth('  ')).toBeNull();
  });
});
