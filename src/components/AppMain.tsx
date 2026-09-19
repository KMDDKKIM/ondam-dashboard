'use client';

import { usePathname } from 'next/navigation';

// 표가 넓은 화면(예약관리, 초진환자 해피콜, 한약 복용법 출력)은 1100px 제한 없이 화면을 넓게 쓴다.
const WIDE_PATHS = ['/reservations', '/happy-call-register', '/herb-print'];

export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = WIDE_PATHS.some((p) => pathname.startsWith(p));

  return (
    <main
      className="app-main"
      style={{ padding: wide ? 16 : 24, maxWidth: wide ? 'none' : 1100, margin: '0 auto' }}
    >
      {children}
    </main>
  );
}
