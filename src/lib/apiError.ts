import { NextResponse } from 'next/server';

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  // Supabase's PostgrestError has the Error shape (message/details/hint/code)
  // but isn't always a real `Error` instance at runtime, so `instanceof` alone
  // would silently fall through to the generic fallback below.
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message;
  }
  return '알 수 없는 오류가 발생했습니다.';
}

/**
 * DB 함수(예: replace_reservations)가 아직 설치되지 않았을 때의 오류인가.
 * PostgREST: code PGRST202 ("Could not find the function ... in the schema cache"),
 * Postgres: code 42883 (undefined_function) / "function ... does not exist".
 */
export function isMissingFunctionError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === 'PGRST202' || code === '42883') return true;
  const message = extractMessage(err);
  return /could not find the function/i.test(message) || /function .* does not exist/i.test(message);
}

export const MISSING_FUNCTION_MESSAGE = '예약 저장 함수가 아직 설치되지 않았어요(관리자 문의)';
export const GENERIC_SAVE_ERROR_MESSAGE = '예약 저장 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';

/** 실제 오류는 서버 로그에만 남기고, 화면에는 (함수 미설치는 안내 문구, hideDetails면 일반 문구) 를 준다. */
export function apiErrorResponse(err: unknown, options: { extra?: Record<string, unknown>; hideDetails?: boolean } = {}) {
  console.error(err);
  let message = extractMessage(err);
  if (isMissingFunctionError(err)) message = MISSING_FUNCTION_MESSAGE;
  else if (options.hideDetails) message = GENERIC_SAVE_ERROR_MESSAGE;
  return NextResponse.json({ error: message, ...options.extra }, { status: 500 });
}
