import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// service_role로 RLS를 우회하는 API 라우트 맨 앞에서 부른다. 로그인 + 원장 승인이
// 안 된 요청이면 바로 돌려줄 에러 응답을 반환하고, 통과하면 null을 반환한다.
export async function requireApprovedStaff(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { data: staff } = await supabase.from('staff').select('status').eq('id', user.id).maybeSingle();
  if (staff?.status !== 'approved') {
    return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });
  }
  return null;
}

/**
 * requireApprovedStaff()로 이미 통과를 확인한 라우트에서, "이 요청을 보낸 사람이
 * 누구인지"(본인 id·원장 여부)가 추가로 필요할 때 쓴다. 승인된 직원이 아니면 null.
 */
export async function getCurrentApprovedStaff(): Promise<{ id: string; isOwner: boolean } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: staff } = await supabase.from('staff').select('role, status').eq('id', user.id).maybeSingle();
  if (staff?.status !== 'approved') return null;
  return { id: user.id, isOwner: staff.role === 'owner' };
}
