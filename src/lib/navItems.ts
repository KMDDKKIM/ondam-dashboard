// 왼쪽 메뉴에 들어가는 도구 목록. 도구를 추가/이동할 때는 여기만 고치면 된다.
import { canUseConsultChart, type StaffGrade } from './staffGrade';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  ownerOnly?: boolean;
  /** 원장님(대표원장·부원장)에게만 보이는 메뉴 — 상담 녹음 차팅 */
  doctorsOnly?: boolean;
  soon?: boolean;
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { href: '/', label: '오늘', icon: '🏠' },
      // 매일 마감 때 입력하는 화면이라 홈 바로 아래에 둔다.
      { href: '/paste-import', label: '일일결산', icon: '🧾' },
    ],
  },
  {
    title: '진료',
    items: [
      { href: '/reservations', label: '예약관리', icon: '📅' },
      { href: '/reception-log', label: '접수기록부', icon: '📒' },
      { href: '/happy-call-register', label: '초진환자 해피콜', icon: '📞' },
      { href: '/happy-call-list', label: '해피콜 목록', icon: '📋' },
      { href: '/remote-consult-alerts', label: '비대면진료 신청', icon: '📨' },
      { href: '/consult-summary', label: '상담 녹음 차팅', icon: '🩺', doctorsOnly: true },
    ],
  },
  {
    title: '한약',
    items: [
      { href: '/herb-queue', label: '한약 대기방', icon: '🫖' },
      { href: '/herb-print', label: '한약 복용법 출력', icon: '💊' },
      { href: '/herb-inventory', label: '한약재 재고 현황', icon: '🌿' },
    ],
  },
  {
    title: '매출',
    items: [{ href: '/non-covered-patients', label: '비급여 현황', icon: '💰' }],
  },
  {
    title: '운영',
    items: [
      { href: '/supply-requests', label: '물품신청', icon: '📦' },
      { href: '/chat', label: '채팅', icon: '💬' },
      { href: '/staff-approval', label: '직원 승인', icon: '🙋', ownerOnly: true },
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

export function visibleGroups(isOwner: boolean, grade: StaffGrade | null = null): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.ownerOnly || isOwner) && (!i.doctorsOnly || canUseConsultChart(isOwner ? '대표원장' : grade))),
  })).filter((g) => g.items.length > 0);
}
