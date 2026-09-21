import { describe, it, expect } from 'vitest';
import { kstMidnightIso, MAX_TRANSCRIPT_CHARS, DAILY_SUMMARY_LIMIT } from './consultLimits';

describe('consultLimits', () => {
  it('한도 값', () => {
    expect(MAX_TRANSCRIPT_CHARS).toBe(30000);
    expect(DAILY_SUMMARY_LIMIT).toBe(60);
  });

  it('kstMidnightIso 는 한국 날짜의 0시(+09:00)', () => {
    // 2026-09-20 16:00 UTC = 2026-09-21 01:00 KST
    const iso = kstMidnightIso(new Date('2026-09-20T16:00:00Z'));
    expect(iso).toBe('2026-09-21T00:00:00+09:00');
    expect(new Date(iso).toISOString()).toBe('2026-09-20T15:00:00.000Z');
  });

  it('한국 날짜가 아직 전날이면 전날 0시', () => {
    expect(kstMidnightIso(new Date('2026-09-20T14:59:00Z'))).toBe('2026-09-20T00:00:00+09:00');
  });
});
