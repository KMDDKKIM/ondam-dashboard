import { describe, it, expect } from 'vitest';
import { parseBulkHerbEntry } from './herbEntryParser';

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
