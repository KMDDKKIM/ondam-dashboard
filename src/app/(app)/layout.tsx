import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AppMain } from '@/components/AppMain';
import { listRoomsWithUnread } from '@/lib/supabase/chatRooms';
import { totalUnreadCount } from '@/lib/chatHelpers';

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

  let unreadCount = 0;
  try {
    const rooms = await listRoomsWithUnread(supabase);
    unreadCount = totalUnreadCount(rooms);
  } catch {
    // 채팅 목록을 못 가져와도 나머지 화면은 정상적으로 보여준다.
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <TopBar staffName={staffName} staffGrade={staff?.grade ?? null} unreadCount={unreadCount} />
      <AppMain>{children}</AppMain>
    </div>
  );
}
