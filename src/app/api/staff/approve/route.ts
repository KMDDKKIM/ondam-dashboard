import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { DEFAULT_GRADE, isAssignableGrade } from '@/lib/staffGrade';

export async function POST(request: Request) {
  // service_role로 아무 staff 행이나 바꿀 수 있는 라우트이므로, 본문을 읽기 전에
  // 요청자가 실제로 로그인된 대표원장인지부터 검사한다.
  const denied = await requireOwner();
  if (denied) return denied;

  const { staffId, grade } = (await request.json()) as { staffId?: string; grade?: unknown };
  if (!staffId) {
    return NextResponse.json({ error: 'staffId가 필요합니다.' }, { status: 400 });
  }

  // 등급을 안 보내면 기본값(사원). 보냈는데 지정할 수 없는 값(대표원장 포함)이면 거부한다.
  const finalGrade = grade === undefined ? DEFAULT_GRADE : grade;
  if (!isAssignableGrade(finalGrade)) {
    return NextResponse.json({ error: '지정할 수 없는 등급입니다.' }, { status: 400 });
  }

  // role = 'staff' 조건: 원장 계정 행은 이 API로 바꾸지 못하게 한다.
  const admin = createAdminClient();
  const { error } = await admin
    .from('staff')
    .update({ status: 'approved', grade: finalGrade })
    .eq('id', staffId)
    .eq('role', 'staff');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
