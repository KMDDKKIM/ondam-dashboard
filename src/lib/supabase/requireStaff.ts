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
