import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMonthlySummary } from '@/lib/monthlySummary';

// 새로고침 버튼(클라이언트)에서 쓰는 라우트. 홈 화면 최초 렌더링은 이 라우트를
// 거치지 않고 서버 컴포넌트가 getMonthlySummary()를 직접 호출한다.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { data: staff } = await supabase
    .from('staff')
    .select('status')
    .eq('id', user.id)
    .maybeSingle();
  if (staff?.status !== 'approved') {
    return NextResponse.json({ error: '승인된 계정만 볼 수 있습니다.' }, { status: 403 });
  }

  try {
    const summary = await getMonthlySummary();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
