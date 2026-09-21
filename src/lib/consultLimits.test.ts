import { describe, it, expect } from 'vitest';
import { kstMidnightIso, decideUsage, isMissingTableError, MAX_TRANSCRIPT_CHARS, DAILY_SUMMARY_LIMIT } from './consultLimits';

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

  it('decideUsage: 59번 썼으면 허용, 60번 이상이면 거부', () => {
    expect(decideUsage(0, 60)).toBe('allow');
    expect(decideUsage(59, 60)).toBe('allow');
    expect(decideUsage(60, 60)).toBe('deny');
    expect(decideUsage(61, 60)).toBe('deny');
  });

  it('decideUsage: 한도 기본값은 DAILY_SUMMARY_LIMIT', () => {
    expect(decideUsage(DAILY_SUMMARY_LIMIT - 1)).toBe('allow');
    expect(decideUsage(DAILY_SUMMARY_LIMIT)).toBe('deny');
  });

  it('isMissingTableError: 테이블 없음 오류만 true', () => {
    expect(isMissingTableError({ code: '42P01', message: 'relation "consult_usage" does not exist' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
    expect(isMissingTableError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
