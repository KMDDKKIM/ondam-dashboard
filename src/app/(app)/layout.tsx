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
import { listDoctors } from '@/lib/supabase/doctors';
import { resolveHerbQueueDoctorFilter } from '@/lib/herbQueue';

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
  // (해피콜 콜 수·초진 등록 누락처럼 무거운 배지는 여기서 기다리지 않고, 메뉴가 뜬 뒤 /api/sidebar-badges 로 따로 읽는다.)
  const [unreadCount, closingMissing, remoteNewCount, doctorNames] = await Promise.all([
    // 채팅 목록을 못 가져와도 나머지 화면은 정상적으로 보여준다.
    listRoomsWithUnread(supabase).then(totalUnreadCount, () => 0),
    // 어제 결산이 비어 있으면 왼쪽 메뉴의 일일결산에 빨간 표시를 붙인다(조회 실패는 무시).
    fetchMissingClosingDates(supabase)
      .then((dates) => dates.length > 0)
      .catch(() => false),
    countNewRemoteRequests(supabase).then((n) => n ?? 0),
    listDoctors(supabase).then((doctors) => doctors.map((d) => d.name), () => [] as string[]),
  ]);
  // 로그인한 사람이 진료의 본인이면 자기 앞으로 신청된 것만, 데스크 직원이면 전체를 알림으로 보여준다.
  const herbQueueCount = await countWaitingHerbQueue(supabase, resolveHerbQueueDoctorFilter(staffName, doctorNames)).then((n) => n ?? 0);

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
