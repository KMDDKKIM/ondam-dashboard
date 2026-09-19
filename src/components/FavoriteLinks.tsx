import { FAVORITE_LINKS } from '@/lib/favoriteLinks';

// 상단바 바로 아래 즐겨찾기 줄 — 한 번 클릭으로 새 탭에서 열린다. 홈의 "예약관리
// 바로가기"와 같은 아이콘 버튼 모양이되 그보다 작게, 서비스마다 어울리는 옅은 색을 넣었다.
export function FavoriteLinks() {
  return (
    <nav
      className="no-print"
      aria-label="즐겨찾기"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 24px',
        borderBottom: '1px solid var(--color-line)',
        background: 'var(--color-surface-2)',
        flexWrap: 'wrap',
      }}
    >
      {FAVORITE_LINKS.map(({ label, url, emoji, bg, fg }) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 11px',
            borderRadius: 10,
            background: bg,
            color: fg,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            border: `1px solid ${fg}33`,
          }}
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span>
          {label}
        </a>
      ))}
    </nav>
  );
}
