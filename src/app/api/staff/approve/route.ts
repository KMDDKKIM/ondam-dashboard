import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { DEFAULT_GRADE, isAssignableGrade } from '@/lib/staffGrade';
import { syncDoctorsFromStaff } from '@/lib/supabase/doctorSync.server';

export async function POST(request: Request) {
  // service_role로 아무 staff 행이나 바꿀 수 있는 라우트이므로, 본문을 읽기 전에
  // 요청자가 실제로 로그인된 대표원장인지부터 검사한다.
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { staffId?: string; grade?: unknown } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const { staffId, grade } = body;
  if (!staffId) {
    return NextResponse.json({ error: 'staffId가 필요합니다.' }, { status: 400 });
  }

  // 등급을 안 보내면 기본값(사원). 보냈는데 지정할 수 없는 값(대표원장 포함)이면 거부한다.
  const finalGrade = grade === undefined ? DEFAULT_GRADE : grade;
  if (!isAssignableGrade(finalGrade)) {
    return NextResponse.json({ error: '지정할 수 없는 등급입니다.' }, { status: 400 });
  }

  // role = 'staff' + status = 'pending'으로 좁혀서, 원장 계정 행이나 이미 승인된 계정은
  // 바꾸지 못하게 한다. 조건에 맞는 행이 없으면 갱신된 행이 0개다.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('staff')
    .update({ status: 'approved', grade: finalGrade })
    .eq('id', staffId)
    .eq('role', 'staff')
    .eq('status', 'pending')
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: '승인 대기 중인 직원이 아닙니다.' }, { status: 404 });
  }

  // 대표원장·부원장으로 승인됐으면 진료의 목록에도 자동으로 들어가게 맞춘다(실패해도 승인 자체는 이미 끝났다).
  await syncDoctorsFromStaff(admin).catch((err) => console.error('staff.approve: doctor sync failed', err));

  return NextResponse.json({ ok: true });
}
