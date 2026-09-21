'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/non-covered-patients', label: '구매 기록' },
  { href: '/non-covered-patients/monthly', label: '월별 현황' },
  { href: '/non-covered-patients/compare', label: '월별 비교' },
];

// 비급여 현황의 세 화면(구매 기록 / 월별 현황 / 월별 비교) 공통 머리: 제목과 화면 이동 탭.
export default function NonCoveredLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname().replace(/\/$/, '');

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>비급여 현황</h1>
        <p className="muted-text">비급여 구매를 구분(일반/이벤트)별로 한눈에 보고 기록하세요.</p>
      </div>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }} aria-label="비급여 현황 화면">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '9px 20px',
                borderRadius: 999,
                border: '1px solid var(--color-line)',
                background: active ? 'var(--color-brand-b)' : 'var(--color-surface)',
                color: active ? '#fff' : 'var(--color-ink)',
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
