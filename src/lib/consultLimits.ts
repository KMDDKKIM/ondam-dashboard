import { todayKst } from './kst';

// 상담 녹음 차팅 사용 한도 — 서버(API)와 화면이 같은 숫자를 쓴다.
export const MAX_TRANSCRIPT_CHARS = 30000;
/** 직원 한 명이 하루(한국 시간 0시 기준)에 저장할 수 있는 차팅 수 */
export const DAILY_SUMMARY_LIMIT = 60;

/** 오늘 한국 시간 0시(ISO, +09:00). created_at 이 이 시각 이후면 오늘 만든 것이다. */
export function kstMidnightIso(now: Date = new Date()): string {
  return `${todayKst(now)}T00:00:00+09:00`;
}
