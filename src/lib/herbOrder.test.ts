import { describe, it, expect } from 'vitest';
import { isShort, listShortHerbs, formatOrderLines, isValidThreshold } from './herbOrder';

describe('isShort', () => {
  it('현재 재고가 기준 이하면 부족', () => {
    expect(isShort(5, 5)).toBe(true);
    expect(isShort(2, 5)).toBe(true);
    expect(isShort(0, 5)).toBe(true);
  });
  it('기준보다 많으면 부족 아님', () => {
    expect(isShort(6, 5)).toBe(false);
  });
  it('기준이 없으면(null) 부족으로 보지 않는다', () => {
    expect(isShort(0, null)).toBe(false);
  });
  it('기준이 0이면 재고가 0일 때만 부족으로 본다', () => {
    expect(isShort(0, 0)).toBe(true);
    expect(isShort(1, 0)).toBe(false);
  });
});

describe('isValidThreshold', () => {
  it('0 이상 정수만', () => {
    expect(isValidThreshold(0)).toBe(true);
    expect(isValidThreshold(5)).toBe(true);
    expect(isValidThreshold(-1)).toBe(false);
    expect(isValidThreshold(1.5)).toBe(false);
    expect(isValidThreshold(NaN)).toBe(false);
  });
});

describe('listShortHerbs / formatOrderLines', () => {
  const items = [
    { name: '천궁', currentStock: 9, lowStockThreshold: 5 },
    { name: '당귀', currentStock: 2, lowStockThreshold: 5 },
    { name: '감초', currentStock: 0, lowStockThreshold: null },
    { name: '생강', currentStock: 1, lowStockThreshold: 1 },
  ];
  it('부족한 것만 이름순으로', () => {
    expect(listShortHerbs(items).map((s) => s.name)).toEqual(['당귀', '생강']);
  });
  it('요구된 형식으로 줄을 만든다', () => {
    expect(formatOrderLines(listShortHerbs(items))).toBe('당귀 — 현재 2봉지\n생강 — 현재 1봉지');
  });
  it('부족한 게 없으면 빈 문자열', () => {
    expect(formatOrderLines([])).toBe('');
  });
});
