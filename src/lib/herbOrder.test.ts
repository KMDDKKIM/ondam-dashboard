import { describe, it, expect } from 'vitest';
import { isShort, listShortHerbs, formatOrderLines, isValidThreshold, excludeMemoedHerbs } from './herbOrder';

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
    { id: 'c', name: '천궁', currentStock: 9, lowStockThreshold: 5 },
    { id: 'd', name: '당귀', currentStock: 2, lowStockThreshold: 5 },
    { id: 'g', name: '감초', currentStock: 0, lowStockThreshold: null },
    { id: 's', name: '생강', currentStock: 1, lowStockThreshold: 1 },
  ];
  it('부족한 것만 이름순으로', () => {
    expect(listShortHerbs(items).map((s) => s.name)).toEqual(['당귀', '생강']);
  });
  it('id도 함께 담는다', () => {
    expect(listShortHerbs(items).map((s) => s.id)).toEqual(['d', 's']);
  });
  it('이름만 한 줄씩', () => {
    expect(formatOrderLines(listShortHerbs(items))).toBe('당귀\n생강');
  });
  it('부족한 게 없으면 빈 문자열', () => {
    expect(formatOrderLines([])).toBe('');
  });
});

describe('excludeMemoedHerbs', () => {
  const shorts = [
    { id: 'd', name: '당귀' },
    { id: 's', name: '생강' },
    { id: 'c', name: '천궁' },
  ];
  it('메모에 이름이 있는 약재는 뺀다', () => {
    expect(excludeMemoedHerbs(shorts, '당귀 다음에 같이 시키기').map((s) => s.name)).toEqual(['생강', '천궁']);
  });
  it('메모가 비어 있으면 그대로', () => {
    expect(excludeMemoedHerbs(shorts, '')).toEqual(shorts);
    expect(excludeMemoedHerbs(shorts, '   ')).toEqual(shorts);
  });
  it('메모에 여러 개 적혀 있으면 여러 개를 뺀다', () => {
    expect(excludeMemoedHerbs(shorts, '당귀, 천궁 주문').map((s) => s.name)).toEqual(['생강']);
  });
  it('메모에 없는 이름은 그대로 남는다', () => {
    expect(excludeMemoedHerbs(shorts, '인삼 주문').map((s) => s.name)).toEqual(['당귀', '생강', '천궁']);
  });
});
