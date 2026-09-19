import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// service_role로 다른 사람의 staff 행을 바꾸는 API 라우트 맨 앞에서 부른다.
// 로그인된 승인 완료 원장(role = 'owner')이 아니면 바로 돌려줄 에러 응답을
// 반환하고, 통과하면 null을 반환한다. 요청자 확인은 RLS가 적용되는 일반
// 클라이언트로 하므로 service_role을 쓰기 전에 반드시 이 검사를 거친다.
export async function requireOwner(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from('staff')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();
  if (requester?.role !== 'owner' || requester.status !== 'approved') {
    return NextResponse.json({ error: '대표원장만 사용할 수 있습니다.' }, { status: 403 });
  }
  return null;
}
