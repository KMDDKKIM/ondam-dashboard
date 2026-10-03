import { describe, expect, it } from 'vitest';
import { HIDE_AFTER_DAYS, isPastHideWindow } from './happyCallVisibility';

describe('isPastHideWindow', () => {
  it('초진 후 3주(21일) 전까지는 보인다', () => {
    expect(HIDE_AFTER_DAYS).toBe(21);
    expect(isPastHideWindow('2026-09-14', '2026-10-03')).toBe(false); // 19일째
    expect(isPastHideWindow('2026-09-13', '2026-10-03')).toBe(false); // 20일째
  });

  it('21일이 지나면 숨긴다', () => {
    expect(isPastHideWindow('2026-09-12', '2026-10-03')).toBe(true); // 21일째
    expect(isPastHideWindow('2026-01-01', '2026-10-03')).toBe(true);
  });

  it('오늘 등록한 환자는 보인다', () => {
    expect(isPastHideWindow('2026-10-03', '2026-10-03')).toBe(false);
  });
});
