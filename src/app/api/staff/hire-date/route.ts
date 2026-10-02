import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';

// 입사일은 연차/월차 적립 계산의 기준이라 원장만 고칠 수 있다. staff 표의 기존 update
// 정책은 본인 행의 name 컬럼만 허용해서(자기 등급 상승 방지), 원장이 남의 입사일을
// 고치려면 admin 클라이언트를 쓰는 이 경로가 필요하다(/api/staff/grade와 같은 이유).
export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { staffId?: string; hireDate?: string | null } | null;
  if (!body?.staffId) {
    return NextResponse.json({ error: 'staffId가 필요합니다.' }, { status: 400 });
  }
  if (body.hireDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(body.hireDate)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('staff')
    .update({ hire_date: body.hireDate || null })
    .eq('id', body.staffId)
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
