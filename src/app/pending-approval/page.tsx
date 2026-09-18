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
    <main className="auth-shell">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 32, marginBottom: 12, display: 'block' }}>⏳</span>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>승인 대기 중</h1>
        <p className="muted-text" style={{ marginBottom: 24 }}>
          가입 신청이 접수됐어요. 원장님이 승인하면 이 계정으로 바로 이용할 수 있어요.
        </p>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px 18px',
            borderRadius: 10,
            border: '1px solid var(--color-line)',
            background: 'var(--color-surface-2)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          로그아웃
        </button>
      </div>
    </main>
  );
}
