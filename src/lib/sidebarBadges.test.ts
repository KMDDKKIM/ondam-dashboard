import { describe, expect, it } from 'vitest';
import { shouldRefreshBadges } from './sidebarBadges';

describe('shouldRefreshBadges', () => {
  it('처음에는 읽는다', () => {
    expect(shouldRefreshBadges(null, 1000)).toBe(true);
  });
  it('60초가 지나기 전에는 다시 읽지 않는다', () => {
    expect(shouldRefreshBadges(1000, 60_999)).toBe(false);
    expect(shouldRefreshBadges(1000, 61_000)).toBe(true);
  });
});
