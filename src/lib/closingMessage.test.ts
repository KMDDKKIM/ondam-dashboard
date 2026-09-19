import { describe, expect, it } from 'vitest';
import { buildClosingMessage, formatNames, summarizePurchases } from './closingMessage';

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
    expect(formatNames('조현지, 변경은님  조현미')).toBe('조현지님,변경은님,조현미님');
    expect(formatNames('')).toBe('');
  });
});

describe('buildClosingMessage', () => {
  it('원장에게 보내던 마무리 멘트와 같은 모양으로 만든다', () => {
    const text = buildClosingMessage({
      visitCount: 34,
      excludedNames: '박혜진, 박나령, 조은솔',
      reservationCount: 21,
      chunaCount: 7,
      chunaNames: '조현지,변경은,조현미,송원관,엄주희,이난옥,우희숙',
      herbSales: '일반한약15일 1명,녹용한약 1명,수녹용공진단 1명',
      naverReviewCount: 1,
      firstVisitCount: 2,
      referralCount: 1,
      referralNames: '임수진',
    });
    expect(text).toBe(
      '금일환자수 : 34명(제외환자:박혜진님,박나령님,조은솔님) / 예약 환자 수 21명 / ' +
        '추나 7명 (조현지님,변경은님,조현미님,송원관님,엄주희님,이난옥님,우희숙님) / ' +
        '일반한약15일 1명,녹용한약 1명,수녹용공진단 1명 / 네이버리뷰 1명 / ' +
        '초진 2명,소개환 1명(임수진님) / 고생하셨습니다'
    );
  });

  it('비어 있는 항목은 빼고, 추나 인원을 안 적으면 이름 개수로 센다', () => {
    const text = buildClosingMessage({ ...BASE, chunaNames: '조현지, 변경은' });
    expect(text).toBe('금일환자수 : 34명 / 예약 환자 수 21명 / 추나 2명 (조현지님,변경은님) / 고생하셨습니다');
  });

  it('추나가 없으면 0명으로 적는다', () => {
    expect(buildClosingMessage(BASE)).toBe('금일환자수 : 34명 / 예약 환자 수 21명 / 추나 0명 / 고생하셨습니다');
  });

  it('소개환은 인원을 안 적어도 이름 개수로 센다', () => {
    const text = buildClosingMessage({ ...BASE, referralNames: '임수진, 김소개' });
    expect(text).toContain('소개환 2명(임수진님,김소개님)');
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
