import { todayKst } from './kst';

// 상담 녹음 차팅 사용 한도 — 서버(API)와 화면이 같은 숫자를 쓴다.
export const MAX_TRANSCRIPT_CHARS = 30000;
/** 직원 한 명이 하루(한국 시간 0시 기준)에 AI로 만들 수 있는 차팅 수(저장 여부와 상관없이 생성 횟수) */
export const DAILY_SUMMARY_LIMIT = 60;

/** 오늘 한국 시간 0시(ISO, +09:00). created_at 이 이 시각 이후면 오늘 만든 것이다. */
export function kstMidnightIso(now: Date = new Date()): string {
  return `${todayKst(now)}T00:00:00+09:00`;
}

/**
 * 오늘 이미 기록된 AI 생성 횟수(countBefore)로 이번 요청을 허용할지 정한다.
 * countBefore 는 이번 요청을 세기 전 값이다 — 59번 썼으면 60번째는 허용, 60번 썼으면 거부.
 */
export function decideUsage(countBefore: number, limit: number = DAILY_SUMMARY_LIMIT): 'allow' | 'deny' {
  return countBefore < limit ? 'allow' : 'deny';
}

/** 사용량 테이블(consult_usage)이 아직 없어서 난 오류인지(마이그레이션 미적용) */
export function isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /does not exist|schema cache/i.test(error.message ?? '');
}
