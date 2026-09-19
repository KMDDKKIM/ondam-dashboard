import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// 채팅은 별도 창(팝업)으로 열리므로 상단바 없이 채팅 화면만 보여준다.
// 로그인·승인 확인은 proxy가 이미 하지만, (app) 레이아웃과 마찬가지로 여기서도 막아둔다.
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <main style={{ padding: 16, height: '100vh' }}>{children}</main>;
}
