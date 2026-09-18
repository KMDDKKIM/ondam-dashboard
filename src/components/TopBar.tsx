'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface TopBarProps {
  staffName: string | null;
}

export function TopBar({ staffName }: TopBarProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid var(--color-line)',
        background: 'var(--color-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 9,
            background: 'linear-gradient(135deg, var(--color-brand-a), var(--color-brand-b))',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          경
        </span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>경희온담한의원</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="muted-text">{staffName ?? '로그인됨'}</span>
        <button
          onClick={handleLogout}
          style={{
            padding: '7px 14px',
            borderRadius: 10,
            border: '1px solid var(--color-line)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-ink)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
