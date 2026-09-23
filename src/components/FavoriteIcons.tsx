'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FAVORITE_LINKS, type FavoriteLink } from '@/lib/favoriteLinks';
import { shouldRefreshBadges, SIDEBAR_BADGE_REFRESH_MS, type SidebarBadges } from '@/lib/sidebarBadges';

const SIZE = 36;

// 새 메시지 배지가 있는 즐겨찾기(지금은 네이버톡톡만) — 누르면 안읽음 배지를 비운다.
const BADGED_LABEL = '네이버톡톡';

// 상단바에 채팅 버튼과 같은 크기(정사각형)로 나란히 붙는 즐겨찾기 아이콘.
// 사이트 아이콘(파비콘)을 보여주고, 못 불러오면 이모지로 대신한다. 이름은 마우스를
// 올렸을 때 툴팁으로 보인다.
function FavoriteIcon({ link, unreadCount, onOpen }: { link: FavoriteLink; unreadCount: number; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const host = new URL(link.url).hostname;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.label}
      aria-label={unreadCount > 0 ? `${link.label} (안읽은 메시지 ${unreadCount}개)` : link.label}
      onClick={unreadCount > 0 ? onOpen : undefined}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: SIZE,
        height: SIZE,
        borderRadius: 10,
        border: `1px solid ${link.fg}33`,
        background: link.bg,
        textDecoration: 'none',
        flexShrink: 0,
      }}
    >
      {failed ? (
        <span style={{ fontSize: 17, lineHeight: 1 }}>{link.emoji}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={link.icon ?? `https://www.google.com/s2/favicons?domain=${host}&sz=64`}
          alt=""
          width={20}
          height={20}
          onError={() => setFailed(true)}
          style={{ display: 'block' }}
        />
      )}
      {unreadCount > 0 && (
        <span
          className="side-badge"
          style={{ position: 'absolute', top: -6, right: -6, minWidth: 16, padding: '0 4px', fontSize: 11, lineHeight: '16px' }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </a>
  );
}

let lastFavoriteBadgeFetchAt: number | null = null;

export function FavoriteIcons() {
  const [naverTalkTalkUnread, setNaverTalkTalkUnread] = useState(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current || !shouldRefreshBadges(lastFavoriteBadgeFetchAt, Date.now(), SIDEBAR_BADGE_REFRESH_MS)) return;
    inFlight.current = true;
    try {
      const response = await fetch('/api/sidebar-badges');
      if (!response.ok) return;
      const body = (await response.json()) as SidebarBadges;
      lastFavoriteBadgeFetchAt = Date.now();
      if (body.naverTalkTalkUnread != null) setNaverTalkTalkUnread(body.naverTalkTalkUnread);
    } catch {
      // 배지를 못 읽어도 즐겨찾기 아이콘은 정상 동작한다.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  // 링크를 열면(새 탭) 바로 배지를 비운다 — 실제로 읽었는지는 톡톡파트너센터에서 확인하지만,
  // 눌러서 열었다는 것 자체를 "확인함"으로 본다.
  function handleOpen() {
    setNaverTalkTalkUnread(0);
    fetch('/api/naver-talktalk-mark-read', { method: 'POST' }).catch(() => {});
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {FAVORITE_LINKS.map((link) => (
        <FavoriteIcon key={link.label} link={link} unreadCount={link.label === BADGED_LABEL ? naverTalkTalkUnread : 0} onOpen={handleOpen} />
      ))}
    </div>
  );
}
