'use client';

import { usePathname } from 'next/navigation';
import { isWidePath } from '@/lib/navItems';

// 표가 넓은 화면(navItems의 WIDE_PATHS)은 1100px 제한 없이 화면을 넓게 쓴다.
export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = isWidePath(pathname);
  // 홈("오늘")은 왼쪽·오른쪽 두 단을 한 화면에 담도록 다른 화면보다 넓게 쓴다.
  const home = pathname === '/';

  return (
    <main
      className="app-main"
      style={{ padding: wide ? 16 : 24, maxWidth: wide ? 'none' : home ? 1560 : 1100, margin: '0 auto' }}
    >
      {children}
    </main>
  );
}
