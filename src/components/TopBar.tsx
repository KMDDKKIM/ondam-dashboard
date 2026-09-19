'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { FavoriteIcons } from '@/components/FavoriteIcons';

interface TopBarProps {
  staffName: string | null;
  unreadCount: number;
}

// 창 이름을 고정해서 이미 열려 있으면 새로 만들지 않고 그 창을 앞으로 가져온다.
function openChatWindow() {
  const width = 1000;
  const height = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(
    '/chat',
    'ondam-chat',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  );
  popup?.focus();
}

export function TopBar({ staffName, unreadCount }: TopBarProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header
      className="no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <FavoriteIcons />
        <button
          type="button"
          onClick={openChatWindow}
          aria-label="채팅 열기"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid var(--color-line)',
            background: 'var(--color-surface-2)',
            fontSize: 16,
            padding: 0,
          }}
        >
          💬
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 8,
                background: 'var(--color-error)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
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
