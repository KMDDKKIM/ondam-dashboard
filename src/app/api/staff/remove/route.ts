import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { syncDoctorsFromStaff } from '@/lib/supabase/doctorSync.server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 직원 삭제(퇴사) / 가입 신청 거절. auth 계정을 지우면 staff 행이 같이 지워지고,
// 그 직원이 남긴 기록은 migration_staff_removal.sql 의 on delete set null 로
// 그대로 남는다(작성자 칸만 빈다).
export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { staffId?: unknown } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const { staffId } = body;
  if (typeof staffId !== 'string' || !UUID_PATTERN.test(staffId)) {
    return NextResponse.json({ error: '삭제할 직원을 지정해주세요.' }, { status: 400 });
  }

  // requireOwner를 통과했으므로 로그인한 대표원장이다. 본인 삭제를 막으려고 id만 다시 읽는다.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === staffId) {
    return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target, error: lookupError } = await admin
    .from('staff')
    .select('id, role')
    .eq('id', staffId)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: '해당 직원을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: '대표원장 계정은 삭제할 수 없습니다.' }, { status: 400 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(staffId);
  if (deleteError) {
    // auth 계정은 이미 없는데 staff 행만 남은 경우(고아 행)는 staff 행을 직접 지워 정리한다.
    const authUserMissing =
      deleteError.status === 404 || /not.?found/i.test(deleteError.message);
    if (!authUserMissing) {
      return NextResponse.json(
        { error: `직원을 삭제하지 못했습니다. ${deleteError.message}` },
        { status: 500 }
      );
    }
    const { error: staffDeleteError } = await admin.from('staff').delete().eq('id', staffId);
    if (staffDeleteError) {
      return NextResponse.json(
        { error: `직원을 삭제하지 못했습니다. ${staffDeleteError.message}` },
        { status: 500 }
      );
    }
  }

  // 퇴사한 사람이 진료의였다면 진료의 목록에서 숨긴다(실패해도 삭제 자체는 이미 끝났다).
  await syncDoctorsFromStaff(admin).catch((err) => console.error('staff.remove: doctor sync failed', err));

  return NextResponse.json({ ok: true });
}
