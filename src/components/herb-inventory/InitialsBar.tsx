'use client';

import { groupElementId, groupLabel } from './HerbList';

// 화면 오른쪽 끝의 ㄱㄴㄷ 바로가기. 목록에 있는 묶음만 보여주고, 누르면 그 묶음으로 스크롤한다.
export default function InitialsBar({ keys }: { keys: string[] }) {
  if (keys.length === 0) return null;

  function jump(key: string) {
    document.getElementById(groupElementId(key))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  return (
    <nav
      aria-label="초성 바로가기"
      className="no-print"
      style={{
        position: 'fixed',
        right: 4,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: '4px 2px',
        borderRadius: 14,
        background: 'rgba(250, 247, 240, 0.92)',
        border: '1px solid var(--color-line)',
        boxShadow: '0 2px 8px rgba(43, 42, 39, 0.12)',
        maxHeight: '80vh',
      }}
    >
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => jump(k)}
          aria-label={`${groupLabel(k)}으로 이동`}
          style={{
            width: 26,
            height: 26,
            padding: 0,
            border: 'none',
            background: 'transparent',
            borderRadius: 6,
            fontSize: k === '#' ? 10 : 13,
            fontWeight: 700,
            color: 'var(--color-brand-b)',
          }}
        >
          {groupLabel(k)}
        </button>
      ))}
    </nav>
  );
}
