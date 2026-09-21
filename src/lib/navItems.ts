// 왼쪽 메뉴에 들어가는 도구 목록. 도구를 추가/이동할 때는 여기만 고치면 된다.
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  ownerOnly?: boolean;
  soon?: boolean;
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { title: null, items: [{ href: '/', label: '오늘', icon: '🏠' }] },
  {
    title: '진료',
    items: [
      { href: '/reservations', label: '예약관리', icon: '📅' },
      { href: '/happy-call-register', label: '초진환자 해피콜', icon: '📞' },
      { href: '/happy-call-list', label: '해피콜 목록', icon: '📋' },
      { href: '/consult-summary', label: '상담 녹음 차팅', icon: '🩺' },
      { href: '/treatment-timer', label: '치료실 타이머', icon: '⏱️' },
    ],
  },
  {
    title: '한약',
    items: [
      { href: '/herb-print', label: '한약 복용법 출력', icon: '💊' },
      { href: '/herb-inventory', label: '한약재 재고 현황', icon: '🌿' },
    ],
  },
  {
    title: '결산·매출',
    items: [
      { href: '/paste-import', label: '엑셀 붙여넣기', icon: '📥' },
      { href: '/non-covered-patients', label: '비급여 현황', icon: '💰' },
    ],
  },
  {
    title: '운영',
    items: [
      { href: '/supply-requests', label: '물품신청', icon: '📦' },
      { href: '/chat', label: '채팅', icon: '💬' },
      { href: '/staff-approval', label: '직원 승인', icon: '🙋', ownerOnly: true },
    ],
  },
  {
    title: '준비 중',
    items: [
      { href: '/event-patients', label: '이벤트 환자 목록', icon: '🎁', soon: true },
      { href: '/remote-consult-alerts', label: '비대면진료 알람', icon: '🔔', soon: true },
    ],
  },
];

// 표가 넓은 화면(예약관리, 초진환자 해피콜, 한약 복용법 출력)은 본문을 화면 가득 쓰고,
// 왼쪽 메뉴도 처음에는 아이콘만 남겨 접어 둔다.
export const WIDE_PATHS = ['/reservations', '/happy-call-register', '/herb-print'];

export function isWidePath(pathname: string): boolean {
  return WIDE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// "/"는 정확히 홈일 때만, 나머지는 그 경로이거나 그 아래 화면일 때 현재 메뉴로 본다.
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function visibleGroups(isOwner: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.ownerOnly || isOwner) })).filter(
    (g) => g.items.length > 0
  );
}
