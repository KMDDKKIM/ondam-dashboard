import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff, getCurrentApprovedStaff } from '@/lib/supabase/requireStaff';
import { deleteEntry, getEntryProfileId, getProfile } from '@/lib/supabase/incentive';

// DELETE: 원장이거나 본인 프로필일 때만(직원·팀장용 입력 화면은 없앴다, 2026-10-02).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();
  if (!me) return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });
  const { id } = await params;

  const admin = createAdminClient();
  try {
    const profileId = await getEntryProfileId(admin, id);
    if (!profileId) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 });
    if (!me.isOwner) {
      const profile = await getProfile(admin, profileId);
      if (!profile || profile.staffId !== me.id) {
        return NextResponse.json({ error: '삭제할 수 없습니다.' }, { status: 403 });
      }
    }
    await deleteEntry(admin, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '삭제하지 못했습니다.' }, { status: 500 });
  }
}
