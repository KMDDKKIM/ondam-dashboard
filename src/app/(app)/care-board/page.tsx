import { notFound } from 'next/navigation';
import { CareBoard } from '@/components/diet/CareBoard';
import { createClient } from '@/lib/supabase/server';

// 원장 전용 화면 — 메뉴에서 숨기는 것만으로는 부족해서 서버에서도 원장이 아니면 열리지 않게 한다(없는 화면처럼 보인다).
// 린다이어트 카드·보냄 기록은 데스크도 입력하는 공유 표라, 접근 제한은 이 화면 단계에서 건다.
export default async function CareBoardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user ? await supabase.from('staff').select('role, status').eq('id', user.id).maybeSingle() : { data: null };
  if (!(staff?.role === 'owner' && staff.status === 'approved')) notFound();
  return <CareBoard />;
}
