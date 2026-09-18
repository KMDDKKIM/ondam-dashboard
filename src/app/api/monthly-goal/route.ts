import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MONTH_RE = /^\d{4}-\d{2}$/;

function toGoalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// 이번달 목표 입력 — 대표원장만 쓸 수 있다. 예약관리(kh-ondam-reservation)의
// monthly_goals 테이블에 직접 쓴다(같은 hanyak-ondam 프로젝트를 공유하지만 그
// 테이블은 RLS가 전부 막혀 있어 admin/service_role로만 접근 가능하다).
// special_acupuncture_goal 컬럼은 이름은 그대로지만 이제 "특수한약" 목표값이다.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { data: staff } = await supabase.from('staff').select('role, status').eq('id', user.id).maybeSingle();
  if (staff?.status !== 'approved' || staff?.role !== 'owner') {
    return NextResponse.json({ error: '대표원장만 목표를 입력할 수 있습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const month = body?.month;
  if (typeof month !== 'string' || !MONTH_RE.test(month)) {
    return NextResponse.json({ error: '잘못된 월 형식입니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('monthly_goals').upsert(
    {
      month,
      herb_goal: toGoalNumber(body.herbGoal),
      diet_goal: toGoalNumber(body.dietGoal),
      special_acupuncture_goal: toGoalNumber(body.specialHerbGoal),
      chuna_goal: toGoalNumber(body.chunaGoal),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'month' }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
