import { describe, expect, it } from 'vitest';
import { buildClosingMessage, countMismatch, formatNames, summarizePurchases } from './closingMessage';

const BASE = {
  visitCount: 34,
  excludedNames: '',
  reservationCount: 21,
  chunaCount: null,
  chunaNames: '',
  herbSales: '',
  naverReviewCount: null,
  firstVisitCount: null,
  referralCount: null,
  referralNames: '',
};

describe('formatNames', () => {
  it('구분자가 무엇이든 이름 뒤에 님을 붙여 쉼표로 잇는다', () => {
    expect(formatNames('홍길동, 성춘향님  이몽룡')).toBe('홍길동님,성춘향님,이몽룡님');
    expect(formatNames('')).toBe('');
  });
});

describe('buildClosingMessage', () => {
  it('원장에게 보내던 마무리 멘트와 같은 모양으로 만든다', () => {
    const text = buildClosingMessage({
      visitCount: 34,
      excludedNames: '강백호, 서태웅, 채치수',
      reservationCount: 21,
      chunaCount: 7,
      chunaNames: '홍길동,성춘향,이몽룡,심청,흥부,놀부,콩쥐',
      herbSales: '일반한약15일 1명,녹용한약 1명,수녹용공진단 1명',
      naverReviewCount: 1,
      firstVisitCount: 2,
      referralCount: 1,
      referralNames: '변학도',
    });
    expect(text).toBe(
      '금일환자수 : 34명(제외환자:강백호님,서태웅님,채치수님) / 예약 환자 수 21명 / ' +
        '추나 7명 (홍길동님,성춘향님,이몽룡님,심청님,흥부님,놀부님,콩쥐님) / ' +
        '일반한약15일 1명,녹용한약 1명,수녹용공진단 1명 / 네이버리뷰 1명 / ' +
        '초진 2명,소개환 1명(변학도님) / 고생하셨습니다'
    );
  });

  it('비어 있는 항목은 빼고, 추나 인원을 안 적으면 이름 개수로 센다', () => {
    const text = buildClosingMessage({ ...BASE, chunaNames: '홍길동, 성춘향' });
    expect(text).toBe('금일환자수 : 34명 / 예약 환자 수 21명 / 추나 2명 (홍길동님,성춘향님) / 고생하셨습니다');
  });

  it('추나가 없으면 0명으로 적는다', () => {
    expect(buildClosingMessage(BASE)).toBe('금일환자수 : 34명 / 예약 환자 수 21명 / 추나 0명 / 고생하셨습니다');
  });

  it('소개환은 인원을 안 적어도 이름 개수로 센다', () => {
    const text = buildClosingMessage({ ...BASE, referralNames: '변학도, 김소개' });
    expect(text).toContain('소개환 2명(변학도님,김소개님)');
  });
});

describe('summarizePurchases', () => {
  it('상품명+처방일수별로 인원을 센다', () => {
    expect(
      summarizePurchases([
        { productName: '일반한약', durationDays: 15 },
        { productName: '일반한약', durationDays: 15 },
        { productName: '일반한약', durationDays: 30 },
        { productName: '녹용한약', durationDays: null },
      ])
    ).toBe('일반한약15일 2명,일반한약30일 1명,녹용한약 1명');
    expect(summarizePurchases([])).toBe('');
  });
});

describe('countMismatch', () => {
  it('인원과 이름 수가 같거나 둘 다 비어 있으면 null', () => {
    expect(countMismatch(2, '홍길동 성춘향')).toBeNull();
    expect(countMismatch(null, '')).toBeNull();
    expect(countMismatch(0, '')).toBeNull();
  });

  it('다르면 두 숫자를 알려준다(인원을 비워 두고 이름만 적은 경우 포함)', () => {
    expect(countMismatch(7, '홍길동 성춘향')).toEqual({ count: 7, names: 2 });
    expect(countMismatch(null, '홍길동')).toEqual({ count: 0, names: 1 });
    expect(countMismatch(2, '')).toEqual({ count: 2, names: 0 });
  });
});
