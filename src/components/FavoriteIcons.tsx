'use client';

import { useState } from 'react';
import { FAVORITE_LINKS, type FavoriteLink } from '@/lib/favoriteLinks';

const SIZE = 36;

// 상단바에 채팅 버튼과 같은 크기(정사각형)로 나란히 붙는 즐겨찾기 아이콘.
// 사이트 아이콘(파비콘)을 보여주고, 못 불러오면 이모지로 대신한다. 이름은 마우스를
// 올렸을 때 툴팁으로 보인다.
function FavoriteIcon({ link }: { link: FavoriteLink }) {
  const [failed, setFailed] = useState(false);
  const host = new URL(link.url).hostname;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.label}
      aria-label={link.label}
      style={{
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
    </a>
  );
}

export function FavoriteIcons() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {FAVORITE_LINKS.map((link) => (
        <FavoriteIcon key={link.label} link={link} />
      ))}
    </div>
  );
}
