import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { upsertMonthlyOverride } from '@/lib/supabase/dailyRevenue';

// 월말결산 덮어쓰기 — 그 달 총매출 누계의 기준값을 통째로 바꾼다. 사원이 실수로 눌러도
// 그 달 대시보드 총매출이 통째로 바뀔 수 있어(감사 결과 #4), RLS의 "승인된 직원이면 누구나"
// 대신 이 라우트를 통해서만 저장하게 하고 대표원장만 통과시킨다.
export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as
    | { month?: unknown; totalRevenue?: unknown; avgDailyVisits?: unknown; asOfDate?: unknown }
    | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const { month, totalRevenue, avgDailyVisits, asOfDate } = body;
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month(YYYY-MM)가 올바르지 않습니다.' }, { status: 400 });
  }
  if (typeof totalRevenue !== 'number' || !Number.isFinite(totalRevenue) || totalRevenue < 0) {
    return NextResponse.json({ error: 'totalRevenue가 올바르지 않습니다.' }, { status: 400 });
  }
  if (avgDailyVisits !== null && avgDailyVisits !== undefined && (typeof avgDailyVisits !== 'number' || !Number.isFinite(avgDailyVisits))) {
    return NextResponse.json({ error: 'avgDailyVisits가 올바르지 않습니다.' }, { status: 400 });
  }
  if (typeof asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return NextResponse.json({ error: 'asOfDate(YYYY-MM-DD)가 올바르지 않습니다.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  try {
    await upsertMonthlyOverride(admin, month, totalRevenue, avgDailyVisits ?? null, asOfDate, user?.id ?? null);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '저장에 실패했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
