import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';
import { AppMain } from '@/components/AppMain';
import { ConfirmHost } from '@/components/ConfirmHost';
import { listRoomsWithUnread } from '@/lib/supabase/chatRooms';
import { totalUnreadCount } from '@/lib/chatHelpers';
import { isStaffGrade } from '@/lib/staffGrade';
import { fetchMissingClosingDates } from '@/lib/supabase/dailyRevenue';
import { countNewRemoteRequests } from '@/lib/supabase/remoteConsult';
import { countWaitingHerbQueue } from '@/lib/supabase/herbQueue';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: staff } = await supabase
    .from('staff')
    .select('name, role, grade')
    .eq('id', user.id)
    .maybeSingle();
  const staffName = staff?.name ?? user.email ?? null;
  const rawGrade = staff?.grade;
  const staffGrade = isStaffGrade(rawGrade) ? rawGrade : null;

  // 왼쪽 메뉴의 숫자 표시들은 서로 상관없으니 한꺼번에 읽는다(하나씩 기다리면 화면마다 그만큼 느려진다).
  const [unreadCount, closingMissing, remoteNewCount, herbQueueCount] = await Promise.all([
    // 채팅 목록을 못 가져와도 나머지 화면은 정상적으로 보여준다.
    listRoomsWithUnread(supabase).then(totalUnreadCount, () => 0),
    // 어제 결산이 비어 있으면 왼쪽 메뉴의 일일결산에 빨간 표시를 붙인다(조회 실패는 무시).
    fetchMissingClosingDates(supabase)
      .then((dates) => dates.length > 0)
      .catch(() => false),
    countNewRemoteRequests(supabase).then((n) => n ?? 0),
    countWaitingHerbQueue(supabase).then((n) => n ?? 0),
  ]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar isOwner={staff?.role === 'owner'} grade={staffGrade} unreadCount={unreadCount} closingMissing={closingMissing} remoteNewCount={remoteNewCount} herbQueueCount={herbQueueCount} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <TopBar staffName={staffName} staffGrade={staffGrade} unreadCount={unreadCount} />
        <AppMain>{children}</AppMain>
      </div>
      <ConfirmHost />
    </div>
  );
}
