import { NextResponse } from 'next/server';
import { getFirstVisitCandidates } from '@/lib/reservations/firstVisitCandidates.server';
import { apiErrorResponse } from '@/lib/apiError';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';

// GET /api/first-visit-candidates?date=YYYY-MM-DD
// 그 날짜 예약 명단의 환자와 각자의 이전 내원일. 분류(초진/재초진/재진)는 화면에서 classifyVisit 로 한다.
export async function GET(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  try {
    const date = new URL(request.url).searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return NextResponse.json({ error: '날짜(date=YYYY-MM-DD)가 올바르지 않습니다.' }, { status: 400 });
    }
    return NextResponse.json(await getFirstVisitCandidates(date));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
