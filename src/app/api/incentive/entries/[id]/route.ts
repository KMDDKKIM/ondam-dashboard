import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff, getCurrentApprovedStaff } from '@/lib/supabase/requireStaff';
import { deleteEntry, getEntryProfileId, getProfile, listCategories, updateEntry } from '@/lib/supabase/incentive';

// PATCH: 내역 수정(날짜·환자명·구분·결제금액·메모) — 원장이거나 본인 프로필일 때만. 구분은 같은 프로필의 항목이어야 한다.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();
  if (!me) return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as
    | { categoryId?: string; entryDate?: string; patientName?: string; amount?: number; note?: string }
    | null;
  if (!body?.categoryId || !body.entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.entryDate) || !body.patientName?.trim()) {
    return NextResponse.json({ error: '필수 항목이 비어 있습니다.' }, { status: 400 });
  }
  const amount = Number(body.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: '결제금액이 올바르지 않습니다.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    const profileId = await getEntryProfileId(admin, id);
    if (!profileId) return NextResponse.json({ error: '기록을 찾을 수 없습니다.' }, { status: 404 });
    if (!me.isOwner) {
      const profile = await getProfile(admin, profileId);
      if (!profile || profile.staffId !== me.id) {
        return NextResponse.json({ error: '수정할 수 없습니다.' }, { status: 403 });
      }
    }
    const categories = await listCategories(admin, profileId);
    if (!categories.some((c) => c.id === body.categoryId)) {
      return NextResponse.json({ error: '이 프로필의 구분이 아닙니다.' }, { status: 400 });
    }
    await updateEntry(admin, id, {
      categoryId: body.categoryId,
      entryDate: body.entryDate,
      patientName: body.patientName.trim(),
      amount,
      note: body.note ?? '',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '수정하지 못했습니다.' }, { status: 500 });
  }
}

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
