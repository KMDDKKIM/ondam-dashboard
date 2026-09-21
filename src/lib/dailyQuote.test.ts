import { describe, expect, it } from 'vitest';
import { QUOTES, quoteIndexForDate } from './dailyQuote';

describe('quoteIndexForDate', () => {
  it('같은 날짜면 항상 같은 번호', () => {
    expect(quoteIndexForDate('2026-09-21')).toBe(quoteIndexForDate('2026-09-21'));
  });

  it('하루 지나면 다음 문구로 넘어가고, 끝나면 처음으로 돈다', () => {
    const a = quoteIndexForDate('2026-09-21');
    expect(quoteIndexForDate('2026-09-22')).toBe((a + 1) % QUOTES.length);
    expect(quoteIndexForDate('2026-09-21', 6)).toBe(quoteIndexForDate('2026-09-27', 6));
  });

  it('범위를 벗어나지 않는다(과거 날짜 포함)', () => {
    for (const d of ['2025-01-01', '2026-01-01', '2030-12-31']) {
      const i = quoteIndexForDate(d);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(QUOTES.length);
    }
  });
});
