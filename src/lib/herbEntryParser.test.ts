import { describe, it, expect } from 'vitest';
import { parseBulkHerbEntry, parseNewHerbs } from './herbEntryParser';

const KNOWN = ['당귀', '천궁', '생강', '대조', '생지황', '감초'];

describe('parseBulkHerbEntry', () => {
  it('applies a trailing number to every preceding name in its group', () => {
    const result = parseBulkHerbEntry('당귀 천궁 3 생강 대조 1', KNOWN);
    expect(result.matched).toEqual(
      expect.arrayContaining([
        { name: '당귀', amount: 3 },
        { name: '천궁', amount: 3 },
        { name: '생강', amount: 1 },
        { name: '대조', amount: 1 },
      ])
    );
    expect(result.matched).toHaveLength(4);
    expect(result.unmatchedNames).toEqual([]);
    expect(result.danglingNames).toEqual([]);
  });

  it('handles a single-name group', () => {
    const result = parseBulkHerbEntry('당귀 생지황 1', KNOWN);
    expect(result.matched).toEqual(
      expect.arrayContaining([
        { name: '당귀', amount: 1 },
        { name: '생지황', amount: 1 },
      ])
    );
    expect(result.matched).toHaveLength(2);
  });

  it('flags names not in the known inventory instead of applying them', () => {
    const result = parseBulkHerbEntry('당귀 천궁 3', ['당귀']);
    expect(result.matched).toEqual([{ name: '당귀', amount: 3 }]);
    expect(result.unmatchedNames).toEqual(['천궁']);
  });

  it('flags trailing names with no number as dangling instead of guessing a count', () => {
    const result = parseBulkHerbEntry('당귀 3 천궁', KNOWN);
    expect(result.matched).toEqual([{ name: '당귀', amount: 3 }]);
    expect(result.danglingNames).toEqual(['천궁']);
  });

  it('sums repeated names across multiple groups in the same entry', () => {
    const result = parseBulkHerbEntry('당귀 1 당귀 2', KNOWN);
    expect(result.matched).toEqual([{ name: '당귀', amount: 3 }]);
  });

  it('ignores a leading number with no preceding names', () => {
    const result = parseBulkHerbEntry('3 당귀 1', KNOWN);
    expect(result.matched).toEqual([{ name: '당귀', amount: 1 }]);
  });

  it('returns empty results for blank input', () => {
    const result = parseBulkHerbEntry('   ', KNOWN);
    expect(result.matched).toEqual([]);
    expect(result.unmatchedNames).toEqual([]);
    expect(result.danglingNames).toEqual([]);
  });
});

describe('parseBulkHerbEntry invalid amounts', () => {
  it('0봉지나 소수는 반영하지 않고 잘못된 개수로 알린다', () => {
    const result = parseBulkHerbEntry('당귀 0 천궁 1.5 생강 2', KNOWN);
    expect(result.matched).toEqual([{ name: '생강', amount: 2 }]);
    expect(result.invalidAmountNames).toEqual(['당귀', '천궁']);
  });
});

describe('parseNewHerbs', () => {
  it('숫자가 나오면 앞의 이름들에 그 재고를 준다', () => {
    const { entries } = parseNewHerbs('당귀 5 천궁 3 생강 대조 1');
    expect(entries).toEqual([
      { name: '당귀', stock: 5, missingStock: false },
      { name: '천궁', stock: 3, missingStock: false },
      { name: '생강', stock: 1, missingStock: false },
      { name: '대조', stock: 1, missingStock: false },
    ]);
  });

  it('줄바꿈·쉼표·탭으로 구분한 목록도 받는다', () => {
    const { entries } = parseNewHerbs('당귀\t5\n천궁, 3\n감초 0');
    expect(entries.map((e) => [e.name, e.stock])).toEqual([
      ['당귀', 5],
      ['천궁', 3],
      ['감초', 0],
    ]);
  });

  it('끝까지 숫자가 없는 이름은 재고 0 + missingStock으로 표시한다', () => {
    const { entries } = parseNewHerbs('당귀 2 천궁 생강');
    expect(entries.slice(1)).toEqual([
      { name: '천궁', stock: 0, missingStock: true },
      { name: '생강', stock: 0, missingStock: true },
    ]);
  });

  it('같은 이름이 또 나오면 처음 것만 쓰고 중복으로 알린다', () => {
    const { entries, duplicateNames } = parseNewHerbs('당귀 5 당귀 9');
    expect(entries).toEqual([{ name: '당귀', stock: 5, missingStock: false }]);
    expect(duplicateNames).toEqual(['당귀']);
  });

  it('빈 입력이면 아무것도 만들지 않는다', () => {
    expect(parseNewHerbs('  \n ').entries).toEqual([]);
  });

  it('소수 재고는 등록하지 않고 알린다', () => {
    const { entries, invalidStockNames } = parseNewHerbs('당귀 2.5 천궁 3');
    expect(entries).toEqual([{ name: '천궁', stock: 3, missingStock: false }]);
    expect(invalidStockNames).toEqual(['당귀']);
  });
});
