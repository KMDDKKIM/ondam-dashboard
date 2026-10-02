import { describe, expect, it } from 'vitest';
import { categoryNeedsAmount, computeEntryIncentive, isInMonth, nextMonthFirstDay, sumIncentive } from './incentive';

const categories = [
  { id: 'c1', calcType: 'percent_of_amount' as const, percent: 0.1, fixedAmount: null },
  { id: 'c2', calcType: 'percent_of_amount' as const, percent: 0.05, fixedAmount: null },
  { id: 'c3', calcType: 'fixed_per_entry' as const, percent: null, fixedAmount: 5000 },
];

describe('computeEntryIncentive', () => {
  it('percent_of_amount: 결제금액 × 비율', () => {
    expect(computeEntryIncentive({ categoryId: 'c1', amount: 990000 }, categories)).toBe(99000);
  });

  it('fixed_per_entry: 결제금액과 무관하게 고정 금액', () => {
    expect(computeEntryIncentive({ categoryId: 'c3', amount: 0 }, categories)).toBe(5000);
    expect(computeEntryIncentive({ categoryId: 'c3', amount: 999999 }, categories)).toBe(5000);
  });

  it('반올림한다', () => {
    expect(computeEntryIncentive({ categoryId: 'c2', amount: 540000 }, categories)).toBe(27000);
  });

  it('카테고리를 못 찾으면(삭제됨 등) 0', () => {
    expect(computeEntryIncentive({ categoryId: 'missing', amount: 100000 }, categories)).toBe(0);
  });
});

describe('sumIncentive', () => {
  it('여러 건을 더한다', () => {
    const entries = [
      { categoryId: 'c1', amount: 990000 }, // 99,000
      { categoryId: 'c3', amount: 0 }, // 5,000
    ];
    expect(sumIncentive(entries, categories)).toBe(104000);
  });

  it('건이 없으면 0', () => {
    expect(sumIncentive([], categories)).toBe(0);
  });
});

describe('isInMonth', () => {
  it('해당 달이면 true', () => {
    expect(isInMonth('2026-09-30', '2026-09')).toBe(true);
  });

  it('다른 달이면 false', () => {
    expect(isInMonth('2026-10-01', '2026-09')).toBe(false);
  });
});

describe('nextMonthFirstDay', () => {
  it('보통 달', () => {
    expect(nextMonthFirstDay('2026-09')).toBe('2026-10-01');
  });

  it('31일까지 있는 달도 정확하다(존재하지 않는 "32일" 같은 값을 안 만든다)', () => {
    expect(nextMonthFirstDay('2026-10')).toBe('2026-11-01');
  });

  it('12월은 다음 해 1월로 넘어간다', () => {
    expect(nextMonthFirstDay('2026-12')).toBe('2027-01-01');
  });

  it('2월(윤년 여부 상관없이 날짜 계산이 아니라 달만 넘긴다)', () => {
    expect(nextMonthFirstDay('2028-02')).toBe('2028-03-01');
  });
});

describe('categoryNeedsAmount', () => {
  it('percent_of_amount는 금액이 필요하다', () => {
    expect(categoryNeedsAmount({ calcType: 'percent_of_amount' })).toBe(true);
  });

  it('fixed_per_entry는 금액이 필요 없다', () => {
    expect(categoryNeedsAmount({ calcType: 'fixed_per_entry' })).toBe(false);
  });

  it('카테고리가 없으면(아직 안 고름) 기본은 금액 필요', () => {
    expect(categoryNeedsAmount(null)).toBe(true);
  });
});
