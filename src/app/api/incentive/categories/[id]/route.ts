import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { deleteCategory, updateCategory } from '@/lib/supabase/incentive';

// PATCH: 이름·색상·계산방식·비율(or 고정금액)·활성여부 수정 — 원장 전용.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | Partial<{ name: string; color: string; calcType: 'percent_of_amount' | 'fixed_per_entry'; percent: number | null; fixedAmount: number | null; active: boolean; sortOrder: number }>
    | null;
  if (!body) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    await updateCategory(admin, id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '수정하지 못했습니다.' }, { status: 500 });
  }
}

// DELETE: 항목 삭제 — 원장 전용. 이미 입력된 건이 참조 중이면 DB가 막는다(그때는
// 화면에서 비활성화(PATCH active:false)를 안내).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;

  const admin = createAdminClient();
  try {
    await deleteCategory(admin, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '이미 입력된 내역이 있는 항목은 삭제할 수 없어요. 대신 비활성화해 주세요.' }, { status: 409 });
  }
}
