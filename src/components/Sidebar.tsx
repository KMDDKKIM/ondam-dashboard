'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath, isWidePath, visibleGroups } from '@/lib/navItems';

interface SidebarProps {
  isOwner: boolean;
  unreadCount: number;
  /** 어제 결산이 아직 입력되지 않았으면 true — 일일결산 메뉴에 빨간 표시를 붙인다. */
  closingMissing?: boolean;
  /** 처리 대기 중인 비대면진료 신청 건수 — 메뉴에 숫자 배지를 붙인다. */
  remoteNewCount?: number;
}

const STORAGE_KEY = 'ondam-sidebar';
const OPEN_WIDTH = 216;
const RAIL_WIDTH = 60;

// 도구를 묶어 항상 보여 주는 왼쪽 메뉴. 표가 넓은 화면이나 좁은 창에서는 처음에 아이콘만
// 남겨 접어 두고, 아래 버튼으로 직접 펴고 접을 수 있다(직접 고른 선택은 기억한다).
export function Sidebar({ isOwner, unreadCount, closingMissing = false, remoteNewCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [pref, setPref] = useState<'open' | 'collapsed' | null>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'open' || saved === 'collapsed') setPref(saved);
    } catch {
      // 저장소를 못 써도 메뉴는 정상 동작한다.
    }
    const media = window.matchMedia('(max-width: 900px)');
    setNarrow(media.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const collapsed = pref ? pref === 'collapsed' : narrow || isWidePath(pathname);

  function toggle() {
    const next = collapsed ? 'open' : 'collapsed';
    setPref(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 기억하지 못해도 이번 화면에서는 바뀐다.
    }
  }

  return (
    <aside
      className="no-print"
      aria-label="메뉴"
      style={{
        width: collapsed ? RAIL_WIDTH : OPEN_WIDTH,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--color-line)',
        background: 'var(--color-surface)',
        transition: 'width 0.15s ease',
      }}
    >
      <Link
        href="/"
        title="경희온담한의원"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: collapsed ? '14px 0' : '14px 16px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          textDecoration: 'none',
          flexShrink: 0,
        }}
      >
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
        {!collapsed && <span style={{ fontWeight: 700, fontSize: 14 }}>경희온담한의원</span>}
      </Link>

      <nav style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '0 8px' : '0 10px' }}>
        {visibleGroups(isOwner).map((group, gi) => (
          <div key={group.title ?? `g${gi}`} style={{ marginBottom: 6 }}>
            {group.title &&
              (collapsed ? (
                <div style={{ height: 1, background: 'var(--color-line)', margin: '8px 6px' }} />
              ) : (
                <div className="muted-text" style={{ fontSize: 11, fontWeight: 700, padding: '10px 8px 4px' }}>
                  {group.title}
                </div>
              ))}
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={`side-link${active ? ' active' : ''}${item.soon ? ' soon' : ''}`}
                  style={{ justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '8px 0' : '8px 10px' }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1, position: 'relative' }}>
                    {item.icon}
                    {item.href === '/chat' && unreadCount > 0 && collapsed && (
                      <span className="side-dot" aria-label={`읽지 않은 메시지 ${unreadCount}개`} />
                    )}
                    {item.href === '/paste-import' && closingMissing && collapsed && (
                      <span className="side-dot" aria-label="어제 결산 미입력" />
                    )}
                    {item.href === '/remote-consult-alerts' && remoteNewCount > 0 && collapsed && (
                      <span className="side-dot" aria-label={`처리 대기 비대면진료 신청 ${remoteNewCount}건`} />
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                      {item.href === '/chat' && unreadCount > 0 && (
                        <span className="side-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                      )}
                      {item.href === '/remote-consult-alerts' && remoteNewCount > 0 && (
                        <span className="side-badge">{remoteNewCount > 99 ? '99+' : remoteNewCount}</span>
                      )}
                      {item.href === '/paste-import' && closingMissing && (
                        <span className="side-badge" title="어제 결산이 아직 입력되지 않았어요">
                          미입력
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? '메뉴 펴기' : '메뉴 접기'}
        title={collapsed ? '메뉴 펴기' : '메뉴 접기'}
        className="side-toggle"
      >
        {collapsed ? '»' : '« 접기'}
      </button>
    </aside>
  );
}
