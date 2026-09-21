import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canUseConsultChart, isStaffGrade } from '@/lib/staffGrade';

// 상담 녹음 차팅은 원장님(대표원장·부원장)만 열 수 있다. 메뉴에서 숨기는 것만으로는 주소를 직접 치면 열리므로 화면도 막는다.
export default async function ConsultSummaryLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: staff } = await supabase.from('staff').select('grade').eq('id', user.id).maybeSingle();
  if (!canUseConsultChart(isStaffGrade(staff?.grade) ? staff.grade : null)) redirect('/');

  return <>{children}</>;
}
