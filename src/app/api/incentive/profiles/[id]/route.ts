import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { deleteProfile, updateProfile } from '@/lib/supabase/incentive';

// PATCH: 안내 문구(note)·활성 여부 수정 — 원장 전용.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { note?: string; active?: boolean } | null;
  if (!body) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    await updateProfile(admin, id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '수정하지 못했습니다.' }, { status: 500 });
  }
}

// DELETE: 프로필 전체 삭제(항목·내역 전부 함께 지워짐) — 원장 전용.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;

  const admin = createAdminClient();
  try {
    await deleteProfile(admin, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '삭제하지 못했습니다.' }, { status: 500 });
  }
}
