'use client';

import type { HerbMessages as Messages } from './useHerbInventory';

// 화면 아래에 떠 있는 알림. 스크롤해 내려가 있어도 −1 실패 같은 오류를 놓치지 않는다.
export default function HerbMessages({ messages, onDismiss }: { messages: Messages; onDismiss: () => void }) {
  const rows = [
    { text: messages.error, color: 'var(--color-error)', icon: '⚠️', role: 'alert' as const },
    { text: messages.warning, color: '#9a6f12', icon: '⚠️', role: 'status' as const },
    { text: messages.notice, color: 'var(--color-green)', icon: '✅', role: 'status' as const },
  ].filter((r) => r.text);
  if (rows.length === 0) return null;

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 30,
        width: 'min(560px, calc(100vw - 48px))',
        display: 'grid',
        gap: 6,
      }}
    >
      {rows.map((r) => (
        <div
          key={r.text}
          role={r.role}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 12,
            border: `1px solid ${r.color}`,
            background: 'var(--color-surface)',
            boxShadow: '0 6px 20px rgba(43, 42, 39, 0.2)',
            color: r.color,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ flex: 1, overflowWrap: 'anywhere' }}>
            {r.icon} {r.text}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="알림 닫기"
            style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 14, padding: 0 }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
