'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath, visibleGroups } from '@/lib/navItems';
import type { StaffGrade } from '@/lib/staffGrade';
import { openChatWindow } from '@/lib/openChatWindow';
import { shouldRefreshBadges, type SidebarBadges } from '@/lib/sidebarBadges';

interface SidebarProps {
  isOwner: boolean;
  /** 직원 등급 — 등급에 따라 보이는 메뉴가 달라진다(상담 녹음 차팅은 원장님만). */
  grade?: StaffGrade | null;
  unreadCount: number;
  /** 어제 결산이 아직 입력되지 않았으면 true — 일일결산 메뉴에 빨간 표시를 붙인다. */
  closingMissing?: boolean;
  /** 처리 대기 중인 비대면진료 신청 건수 — 메뉴에 숫자 배지를 붙인다. */
  remoteNewCount?: number;
  /** 원장님 처리를 기다리는 한약 처방 신청 건수 — 한약 대기방 메뉴에 숫자 배지를 붙인다. */
  herbQueueCount?: number;
  /** 물품신청 메뉴 배지 건수 — 원장님에게는 주문 대기, 그 외에는 도착 확인 대기 건수(호출하는 쪽에서 역할별로 골라 내려준다). */
  supplyOpenCount?: number;
  /** 승인을 기다리는 직원 가입 신청 수 — 직원 승인 메뉴(원장님에게만 보임)에 숫자 배지를 붙인다. */
  pendingStaffCount?: number;
  /** 로그인한 사람의 인센티브 프로필이 있는지 — 있을 때만(원장 포함) "인센티브" 메뉴가 보인다. */
  hasIncentiveProfile?: boolean;
}

// 무거운 배지(오늘 걸 해피콜 수, 초진·재초진 등록 누락)는 메뉴가 뜬 뒤에 따로 읽는다.
// 화면을 옮길 때마다 읽지 않도록 마지막으로 읽은 시각을 모듈에 둔다.
let lastBadgeFetchAt: number | null = null;

const STORAGE_KEY = 'ondam-sidebar';
const OPEN_WIDTH = 216;
const RAIL_WIDTH = 60;

// 도구를 묶어 항상 보여 주는 왼쪽 메뉴. 표가 넓은 화면이나 좁은 창에서는 처음에 아이콘만
// 남겨 접어 두고, 아래 버튼으로 직접 펴고 접을 수 있다(직접 고른 선택은 기억한다).
export function Sidebar({
  isOwner,
  grade = null,
  unreadCount,
  closingMissing = false,
  remoteNewCount = 0,
  herbQueueCount = 0,
  supplyOpenCount = 0,
  pendingStaffCount = 0,
  hasIncentiveProfile = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<SidebarBadges>({ openCalls: null, missingFirstVisits: null, naverTalkTalkUnread: null });
  const inFlight = useRef(false);
  const openCallCount = badges.openCalls ?? 0;
  const firstVisitMissingCount = badges.missingFirstVisits ?? 0;
  // 원장님에게는 "주문해야 할 신청"을, 데스크 직원에게는 "도착 확인해야 할 신청"을 보여준다(supplyOpenCount는 layout.tsx에서 이미 역할별로 골라서 내려온다).
  const supplyBadgeLabel = isOwner ? '주문 대기 물품신청' : '도착 확인 대기 물품신청';

  const refreshBadges = useCallback(async () => {
    if (inFlight.current || !shouldRefreshBadges(lastBadgeFetchAt, Date.now())) return;
    inFlight.current = true;
    try {
      const response = await fetch('/api/sidebar-badges');
      if (!response.ok) return;
      const body = (await response.json()) as SidebarBadges;
      lastBadgeFetchAt = Date.now();
      // 못 읽은 값(null)은 이전 값을 그대로 둔다.
      setBadges((prev) => ({
        openCalls: body.openCalls ?? prev.openCalls,
        missingFirstVisits: body.missingFirstVisits ?? prev.missingFirstVisits,
        naverTalkTalkUnread: body.naverTalkTalkUnread ?? prev.naverTalkTalkUnread,
      }));
    } catch {
      // 배지를 못 읽어도 메뉴는 정상 동작한다.
    } finally {
      inFlight.current = false;
    }
  }, []);

  // 화면을 옮길 때(60초에 한 번까지)와 창으로 돌아올 때 다시 읽는다.
  useEffect(() => {
    void refreshBadges();
  }, [pathname, refreshBadges]);
  useEffect(() => {
    const onFocus = () => void refreshBadges();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshBadges]);
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

  // 화면이 좁을 때만 자동으로 접는다 — 예전에는 표가 넓은 화면(예약관리 등)으로 들어갈
  // 때도 자동으로 접혔는데, 메뉴를 눌렀는데 메뉴 크기가 저절로 바뀌는 게 거슬린다는
  // 지적(원장, 2026-09-29)으로 없앴다. 직접 접고 펴는 건 그대로 기억한다(STORAGE_KEY).
  const collapsed = pref ? pref === 'collapsed' : narrow;

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
        {visibleGroups(isOwner, grade, hasIncentiveProfile).map((group, gi) => (
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
                  onClick={
                    item.href === '/chat'
                      ? (event) => {
                          // 일반 클릭은 팝업으로, Ctrl/⌘/Shift 클릭은 브라우저 기본 동작(새 탭)을 그대로 둔다.
                          if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
                          event.preventDefault();
                          openChatWindow();
                        }
                      : undefined
                  }
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
                    {item.href === '/herb-queue' && herbQueueCount > 0 && collapsed && (
                      <span className="side-dot" aria-label={`대기 중인 한약 처방 ${herbQueueCount}건`} />
                    )}
                    {item.href === '/happy-call-list' && openCallCount > 0 && collapsed && (
                      <span className="side-dot" aria-label={`오늘 걸 해피콜 ${openCallCount}건`} />
                    )}
                    {item.href === '/happy-call-register' && firstVisitMissingCount > 0 && collapsed && (
                      <span className="side-dot" aria-label={`초진·재초진 등록 누락 ${firstVisitMissingCount}명`} />
                    )}
                    {item.href === '/remote-consult-alerts' && remoteNewCount > 0 && collapsed && (
                      <span className="side-dot" aria-label={`처리 대기 비대면진료 신청 ${remoteNewCount}건`} />
                    )}
                    {item.href === '/supply-requests' && supplyOpenCount > 0 && collapsed && (
                      <span className="side-dot" aria-label={`${supplyBadgeLabel} ${supplyOpenCount}건`} />
                    )}
                    {item.href === '/staff-approval' && pendingStaffCount > 0 && collapsed && (
                      <span className="side-dot" aria-label={`승인 대기 중인 직원 가입 신청 ${pendingStaffCount}건`} />
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                      {item.href === '/chat' && unreadCount > 0 && (
                        <span className="side-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                      )}
                      {item.href === '/herb-queue' && herbQueueCount > 0 && (
                        <span className="side-badge">{herbQueueCount > 99 ? '99+' : herbQueueCount}</span>
                      )}
                      {item.href === '/happy-call-list' && openCallCount > 0 && (
                        <span className="side-badge" title="오늘 걸 해피콜">
                          {openCallCount > 99 ? '99+' : openCallCount}
                        </span>
                      )}
                      {item.href === '/happy-call-register' && firstVisitMissingCount > 0 && (
                        <span className="side-badge" title="오늘 초진·재초진 등록 누락">
                          {firstVisitMissingCount > 99 ? '99+' : firstVisitMissingCount}
                        </span>
                      )}
                      {item.href === '/remote-consult-alerts' && remoteNewCount > 0 && (
                        <span className="side-badge">{remoteNewCount > 99 ? '99+' : remoteNewCount}</span>
                      )}
                      {item.href === '/paste-import' && closingMissing && (
                        <span className="side-badge" title="어제 결산이 아직 입력되지 않았어요">
                          미입력
                        </span>
                      )}
                      {item.href === '/supply-requests' && supplyOpenCount > 0 && (
                        <span className="side-badge" title={supplyBadgeLabel}>
                          {supplyOpenCount > 99 ? '99+' : supplyOpenCount}
                        </span>
                      )}
                      {item.href === '/staff-approval' && pendingStaffCount > 0 && (
                        <span className="side-badge" title="승인 대기 중인 직원 가입 신청">
                          {pendingStaffCount > 99 ? '99+' : pendingStaffCount}
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
