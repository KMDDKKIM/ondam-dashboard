import { describe, expect, it } from 'vitest';
import { formatSavedAt } from './savedAt';

describe('formatSavedAt', () => {
  const now = new Date(2026, 8, 19, 18, 0);

  it('오늘 저장한 것은 시:분만 보여준다', () => {
    expect(formatSavedAt(new Date(2026, 8, 19, 9, 5).toISOString(), now)).toBe('09:05');
  });

  it('다른 날 저장한 것은 월/일과 시:분을 보여준다', () => {
    expect(formatSavedAt(new Date(2026, 8, 18, 21, 30).toISOString(), now)).toBe('9/18 21:30');
  });

  it('값이 없거나 잘못되면 빈 글자', () => {
    expect(formatSavedAt(null, now)).toBe('');
    expect(formatSavedAt('not a date', now)).toBe('');
  });
});
