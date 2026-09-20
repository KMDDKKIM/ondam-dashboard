import { NextResponse } from 'next/server';
import { getFirstVisitCandidates } from '@/lib/reservations/firstVisitCandidates.server';
import { apiErrorResponse } from '@/lib/apiError';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';

// YYYY-MM-DD 형식이고 달력에 실제 있는 날짜인지(2026-02-31, 2026-13-01 거부).
function isRealDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

// GET /api/first-visit-candidates?date=YYYY-MM-DD
// 그 날짜 예약 명단의 환자와 각자의 이전 내원일. 분류(초진/재초진/재진)는 화면에서 classifyVisit 로 한다.
export async function GET(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  try {
    const date = new URL(request.url).searchParams.get('date') ?? '';
    // 형식뿐 아니라 실제 있는 날짜인지(2026-02-31 같은 값 거부) 확인한다: 파싱했다가 다시 써서 같아야 한다.
    const valid = isRealDate(date);
    if (!valid) {
      return NextResponse.json({ error: '날짜(date=YYYY-MM-DD)가 올바르지 않습니다.' }, { status: 400 });
    }
    return NextResponse.json(await getFirstVisitCandidates(date));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
