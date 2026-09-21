'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { FavoriteIcons } from '@/components/FavoriteIcons';
import type { StaffGrade } from '@/lib/staffGrade';
import { openChatWindow } from '@/lib/openChatWindow';

interface TopBarProps {
  staffName: string | null;
  staffGrade: StaffGrade | null;
  unreadCount: number;
}

export function TopBar({ staffName, staffGrade, unreadCount }: TopBarProps) {
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
        justifyContent: 'flex-end',
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
        <span className="muted-text">
          {staffName ?? '로그인됨'}
          {staffGrade ? ` · ${staffGrade}` : ''}
        </span>
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
