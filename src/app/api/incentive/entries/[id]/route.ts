import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';
import { deleteEntry } from '@/lib/supabase/incentive';

// DELETE: 승인된 직원 누구나 지울 수 있다(원장 요청 — 접수한 직원이 실수를 바로잡을 수 있어야 함).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const { id } = await params;

  const admin = createAdminClient();
  try {
    await deleteEntry(admin, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '삭제하지 못했습니다.' }, { status: 500 });
  }
}
