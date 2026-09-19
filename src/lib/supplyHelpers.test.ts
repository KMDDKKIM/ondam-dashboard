import { describe, expect, it } from 'vitest';
import { matchesFilter, safeUrl, supplyStatus } from './supplyHelpers';

const requested = { orderedAt: null, receivedAt: null };
const ordered = { orderedAt: '2026-09-20T01:00:00Z', receivedAt: null };
const received = { orderedAt: '2026-09-20T01:00:00Z', receivedAt: '2026-09-22T01:00:00Z' };

describe('supplyStatus', () => {
  it('신청/주문/도착을 시각으로 판단한다', () => {
    expect(supplyStatus(requested)).toBe('requested');
    expect(supplyStatus(ordered)).toBe('ordered');
    expect(supplyStatus(received)).toBe('received');
  });
});

describe('matchesFilter', () => {
  it('open은 도착 전 전부, 나머지는 해당 상태만', () => {
    expect(matchesFilter(requested, 'open')).toBe(true);
    expect(matchesFilter(ordered, 'open')).toBe(true);
    expect(matchesFilter(received, 'open')).toBe(false);
    expect(matchesFilter(ordered, 'ordered')).toBe(true);
    expect(matchesFilter(ordered, 'requested')).toBe(false);
    expect(matchesFilter(received, 'all')).toBe(true);
  });
});

describe('safeUrl', () => {
  it('http(s)만 허용하고 스킴이 없으면 https를 붙인다', () => {
    expect(safeUrl('https://a.com/x')).toBe('https://a.com/x');
    expect(safeUrl('a.com/x')).toBe('https://a.com/x');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});
