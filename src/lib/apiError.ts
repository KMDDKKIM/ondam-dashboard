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

export function apiErrorResponse(err: unknown) {
  console.error(err);
  return NextResponse.json({ error: extractMessage(err) }, { status: 500 });
}
