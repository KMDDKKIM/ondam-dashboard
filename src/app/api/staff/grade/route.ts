import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { isAssignableGrade } from '@/lib/staffGrade';

export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { staffId, grade } = (await request.json()) as { staffId?: string; grade?: unknown };
  if (!staffId || !isAssignableGrade(grade)) {
    return NextResponse.json({ error: 'staffId와 지정 가능한 등급이 필요합니다.' }, { status: 400 });
  }

  // role = 'staff' + status = 'approved'로 좁혀서, 대표원장 행이나 승인 전 계정은
  // 바꾸지 못하게 한다. 조건에 맞는 행이 없으면 갱신된 행이 0개다.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('staff')
    .update({ grade })
    .eq('id', staffId)
    .eq('role', 'staff')
    .eq('status', 'approved')
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: '등급을 바꿀 수 있는 직원이 아닙니다.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
