'use client';

import { useEffect, useState } from 'react';

type PermissionState = NotificationPermission | 'unsupported';

function readPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

// 다른 탭·창을 보고 있을 때도 새 비대면진료 신청을 바탕화면(윈도우) 알림으로 받을 수 있게 권한을 묻는 작은 버튼.
// 아직 묻지 않은 상태('default')일 때만 보이고, 허용·차단을 한 번 고르면 사라진다(차단은 브라우저 설정에서 풀어야 한다).
export function RemoteNotifyButton({ style }: { style?: React.CSSProperties }) {
  const [permission, setPermission] = useState<PermissionState>('unsupported');

  useEffect(() => {
    setPermission(readPermission());
  }, []);

  if (permission !== 'default') return null;

  async function ask() {
    try {
      const result = await window.Notification.requestPermission();
      setPermission(result);
    } catch {
      setPermission(readPermission());
    }
  }

  return (
    <button
      type="button"
      onClick={ask}
      title="다른 탭을 보고 있을 때도 새 신청을 윈도우 알림으로 알려 드려요"
      style={{ border: 'none', background: 'transparent', color: 'var(--color-blue)', fontSize: 12, fontWeight: 600, padding: 0, ...style }}
    >
      🔔 바탕화면 알림 켜기
    </button>
  );
}
