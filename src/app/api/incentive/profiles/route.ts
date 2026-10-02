import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff, getCurrentApprovedStaff } from '@/lib/supabase/requireStaff';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { createProfile, listProfiles } from '@/lib/supabase/incentive';

// GET: 원장이면 전체 프로필(부원장 목록), 그 외는 본인 프로필만(없으면 빈 배열).
// "인센티브" 화면이 누구를 보여줄지 고르는 데 쓴다 — 민감 정보(비율/금액)는 안 담겨 있다.
export async function GET() {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();
  if (!me) return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });

  const admin = createAdminClient();
  try {
    const profiles = await listProfiles(admin);
    const visible = me.isOwner ? profiles : profiles.filter((p) => p.staffId === me.id);
    return NextResponse.json({ isOwner: me.isOwner, profiles: visible });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '불러오지 못했습니다.' }, { status: 500 });
  }
}

// POST: 새 부원장 인센티브 프로필 추가(원장 전용). 기존 프로필에서 항목을 복사해 올 수 있다.
export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as
    | { staffId?: string; note?: string; cloneFromProfileId?: string }
    | null;
  if (!body?.staffId) {
    return NextResponse.json({ error: 'staffId가 필요합니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const profile = await createProfile(admin, {
      staffId: body.staffId,
      note: body.note ?? '',
      cloneFromProfileId: body.cloneFromProfileId,
    });
    return NextResponse.json(profile);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error && err.message.includes('duplicate') ? '이미 인센티브 프로필이 있는 직원입니다.' : '추가하지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
