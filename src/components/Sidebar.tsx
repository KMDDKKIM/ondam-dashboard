'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface NavItem {
  href: string;
  label: string;
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈' },
  { href: 'https://kh-ondam-reservation.vercel.app', label: '예약관리', external: true },
  {
    href: 'https://scratch-2026-09-09-c5228e.vercel.app',
    label: '한약 복용법 출력',
    external: true,
  },
  { href: '/happy-call-register', label: '초진환자 해피콜' },
  { href: '/treatment-timer', label: '치료실 타이머' },
  { href: '/happy-call-list', label: '해피콜 목록' },
  { href: '/non-covered-patients', label: '비급여 환자 목록' },
  { href: '/event-patients', label: '이벤트 환자 목록' },
  { href: '/remote-consult-alerts', label: '비대면진료 알람' },
  { href: '/supply-requests', label: '물품신청' },
];

interface SidebarProps {
  staffName: string | null;
  isOwner?: boolean;
}

export function Sidebar({ staffName, isOwner }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = isOwner
    ? [...NAV_ITEMS, { href: '/staff-approval', label: '직원 승인' }]
    : NAV_ITEMS;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      style={{
        width: 220,
        borderRight: '1px solid #ddd',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h2 style={{ fontSize: 16, marginBottom: 16 }}>경희온담한의원</h2>
      <nav style={{ flex: 1 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {navItems.map((item) => (
            <li key={item.href}>
              {item.external ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', padding: 8, textDecoration: 'none' }}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  href={item.href}
                  style={{
                    display: 'block',
                    padding: 8,
                    textDecoration: 'none',
                    background: pathname === item.href ? '#e0ecff' : 'transparent',
                  }}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div style={{ borderTop: '1px solid #ddd', paddingTop: 12 }}>
        <p style={{ fontSize: 13, marginBottom: 8 }}>{staffName ?? '로그인됨'}</p>
        <button onClick={handleLogout} style={{ width: '100%', padding: 6 }}>
          로그아웃
        </button>
      </div>
    </aside>
  );
}
