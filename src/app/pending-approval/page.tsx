'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function PendingApprovalPage() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>승인 대기 중</h1>
      <p>가입 신청이 접수됐어요. 원장님이 승인하면 이 계정으로 바로 이용할 수 있어요.</p>
      <button onClick={handleLogout} style={{ width: '100%', padding: 8, marginTop: 8 }}>
        로그아웃
      </button>
    </main>
  );
}
