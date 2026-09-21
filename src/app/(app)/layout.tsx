import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';
import { AppMain } from '@/components/AppMain';
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

  let unreadCount = 0;
  try {
    const rooms = await listRoomsWithUnread(supabase);
    unreadCount = totalUnreadCount(rooms);
  } catch {
    // 채팅 목록을 못 가져와도 나머지 화면은 정상적으로 보여준다.
  }

  // 어제 결산이 비어 있으면 왼쪽 메뉴의 일일결산에 빨간 표시를 붙인다(조회 실패는 무시).
  const closingMissing = await fetchMissingClosingDates(supabase)
    .then((dates) => dates.length > 0)
    .catch(() => false);

  const remoteNewCount = (await countNewRemoteRequests(supabase)) ?? 0;
  const herbQueueCount = (await countWaitingHerbQueue(supabase)) ?? 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar isOwner={staff?.role === 'owner'} unreadCount={unreadCount} closingMissing={closingMissing} remoteNewCount={remoteNewCount} herbQueueCount={herbQueueCount} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <TopBar staffName={staffName} staffGrade={staffGrade} unreadCount={unreadCount} />
        <AppMain>{children}</AppMain>
      </div>
    </div>
  );
}
