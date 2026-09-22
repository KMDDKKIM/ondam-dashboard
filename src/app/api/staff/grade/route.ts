import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { isAssignableGrade } from '@/lib/staffGrade';
import { syncDoctorsFromStaff } from '@/lib/supabase/doctorSync.server';

export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { staffId?: string; grade?: unknown } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const { staffId, grade } = body;
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

  // 등급이 부원장으로/부원장에서 바뀌었을 수 있으니 진료의 목록도 맞춘다(실패해도 등급 변경 자체는 이미 끝났다).
  await syncDoctorsFromStaff(admin).catch((err) => console.error('staff.grade: doctor sync failed', err));

  return NextResponse.json({ ok: true });
}
