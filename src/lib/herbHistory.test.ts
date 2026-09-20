import { describe, it, expect } from 'vitest';
import { formatKstDateTime, signedChange, staffLabel } from './herbHistory';

describe('herbHistory', () => {
  it('UTC 시각을 한국 시각으로 표시한다', () => {
    expect(formatKstDateTime('2026-09-19T15:30:00Z')).toBe('2026-09-20 00:30');
  });
  it('입고는 +, 사용은 -', () => {
    expect(signedChange('restock', 5)).toBe('+5봉지');
    expect(signedChange('use', 2)).toBe('-2봉지');
  });
  it('삭제된 직원은 (삭제된 직원)', () => {
    expect(staffLabel(null, { a: '김' })).toBe('(삭제된 직원)');
    expect(staffLabel('zzz', { a: '김' })).toBe('(삭제된 직원)');
    expect(staffLabel('a', { a: '김' })).toBe('김');
  });
});
