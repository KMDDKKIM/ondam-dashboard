import { describe, expect, it } from 'vitest';
import { defaultHappyCallDate } from './nonCoveredPurchases';

describe('defaultHappyCallDate', () => {
  it('한약 수령일 기본값은 구매일 다음날이다(월말·연말도 넘어간다)', () => {
    expect(defaultHappyCallDate('2026-09-19')).toBe('2026-09-20');
    expect(defaultHappyCallDate('2026-09-30')).toBe('2026-10-01');
    expect(defaultHappyCallDate('2026-12-31')).toBe('2027-01-01');
  });
});
