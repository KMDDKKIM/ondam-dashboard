import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const { staffId } = (await request.json()) as { staffId?: string };
  if (!staffId) {
    return NextResponse.json({ error: 'staffId가 필요합니다.' }, { status: 400 });
  }

  // 요청자를 일반(anon key, RLS 적용) 클라이언트로 먼저 확인한다 — 이 라우트는
  // service_role로 아무 staff 행이나 바꿀 수 있으므로, 실제로 로그인된 원장인지를
  // 여기서 직접 검사해야 한다.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from('staff')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();
  if (requester?.role !== 'owner' || requester.status !== 'approved') {
    return NextResponse.json({ error: '원장만 승인할 수 있습니다.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('staff')
    .update({ status: 'approved' })
    .eq('id', staffId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
